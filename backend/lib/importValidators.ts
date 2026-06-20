import type { ImportType } from './importTypes'

export interface RowValidationResult {
  rowNumber: number
  rowId?: string          // UUID of the import_job_rows record — set by commit route, not validate
  status: 'valid' | 'warning' | 'error'
  errors: string[]
  warnings: string[]
  normalizations: string[]  // informational notes that don't affect status (e.g. currency symbol → ISO)
  mappedData: Record<string, string | number | boolean | null>
}

// Maps currency display symbols to ISO-4217 codes.
// Allows files that store "$" or "€" instead of "USD" / "EUR" to import without error.
const CURRENCY_SYMBOLS: Record<string, string> = {
  '$':  'USD',
  '€':  'EUR',
  '₪':  'ILS',
  '£':  'GBP',
  '¥':  'JPY',
  '₩':  'KRW',
  'A$': 'AUD',
  'C$': 'CAD',
  'Fr': 'CHF',
  'kr': 'SEK',
}

export function validateRows(
  rawRows: Record<string, string>[],
  mapping: Record<string, string>,
  importType: ImportType
): RowValidationResult[] {
  const results = rawRows.map((raw, i) => validateRow(i + 1, raw, mapping, importType))

  // Cross-row sequence validation for BOM Lines in level mode.
  // Per-row validation (above) already checks that each level value is a non-negative
  // integer. This pass adds structural rules that require the full row sequence.
  if (importType === 'bom_lines') {
    const hasLevel = results.some(
      r => r.mappedData['level'] !== undefined && r.mappedData['level'] !== null
    )
    if (hasLevel) validateBomLevelSequence(results)
  }

  return results
}

function applyMapping(
  rawData: Record<string, string>,
  mapping: Record<string, string>
): Record<string, string | null> {
  const mapped: Record<string, string | null> = {}
  for (const [src, tgt] of Object.entries(mapping)) {
    if (tgt && tgt !== '__ignore__') {
      mapped[tgt] = rawData[src] ?? null
    }
  }
  return mapped
}

function isAllEmpty(mapped: Record<string, string | null>): boolean {
  return Object.values(mapped).every(v => v === null || v === '')
}

function requireField(
  mapped: Record<string, unknown>,
  field: string,
  errors: string[]
): boolean {
  const v = mapped[field]
  if (v === null || v === undefined || String(v).trim() === '') {
    errors.push(`Missing required field: ${field}`)
    return false
  }
  return true
}

function validateRow(
  rowNumber: number,
  rawData: Record<string, string>,
  mapping: Record<string, string>,
  importType: ImportType
): RowValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const normalizations: string[] = []
  const mapped = applyMapping(rawData, mapping)

  if (isAllEmpty(mapped)) {
    return { rowNumber, status: 'error', errors: ['Empty row — skipped'], warnings: [], normalizations: [], mappedData: {} }
  }

  switch (importType) {
    case 'sku_master':
      validateSkuMaster(mapped, errors, warnings)
      break
    case 'bom_lines':
      validateBomLines(mapped, errors, warnings)
      break
    case 'costs':
      validateCosts(mapped, errors, warnings)
      break
    case 'inventory_snapshot':
      validateInventory(mapped, errors, warnings)
      break
    case 'purchase_history':
      validatePurchaseHistory(mapped, errors, warnings)
      break
    case 'price_list':
      validatePriceList(mapped, errors, warnings, normalizations)
      break
    default:
      errors.push(`Import type "${importType}" is not yet supported for validation`)
  }

  const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid'
  return { rowNumber, status, errors, warnings, normalizations, mappedData: mapped as Record<string, string | number | boolean | null> }
}

function validateSkuMaster(
  mapped: Record<string, string | null>,
  errors: string[],
  warnings: string[]
): void {
  requireField(mapped, 'sku', errors)
  requireField(mapped, 'description', errors)
  const sku = String(mapped['sku'] ?? '').trim()
  if (sku && sku.length > 100) errors.push('SKU exceeds 100 characters')
  const desc = String(mapped['description'] ?? '').trim()
  if (desc && desc.length > 255) errors.push('Description exceeds 255 characters')
}

function validateBomLines(
  mapped: Record<string, string | null>,
  errors: string[],
  warnings: string[]
): void {
  // Level mode: detected when the 'level' key is present in the mapped data.
  // In level mode the file encodes the BOM tree via a Level column rather than
  // explicit parent_sku / child_sku pairs.
  if ('level' in mapped) {
    validateBomLinesLevelRow(mapped, errors, warnings)
    return
  }

  // Flat mode (default): explicit parent/child columns required.
  requireField(mapped, 'parent_sku', errors)
  requireField(mapped, 'child_sku', errors)
  requireField(mapped, 'quantity', errors)

  const parent = String(mapped['parent_sku'] ?? '').trim()
  const child  = String(mapped['child_sku'] ?? '').trim()
  if (parent && child && parent === child) {
    errors.push('parent_sku and child_sku cannot be the same (self-referencing BOM)')
  }

  const qty = mapped['quantity']
  if (qty !== null && qty !== '') {
    const n = Number(qty)
    if (isNaN(n) || n <= 0) errors.push(`Quantity must be a positive number (got: ${qty})`)
  }
}

function validateBomLinesLevelRow(
  mapped: Record<string, string | null>,
  errors: string[],
  _warnings: string[]
): void {
  requireField(mapped, 'sku', errors)
  requireField(mapped, 'quantity', errors)
  requireField(mapped, 'level', errors)

  const levelStr = String(mapped['level'] ?? '').trim()
  if (levelStr !== '') {
    const n = Number(levelStr)
    if (!Number.isInteger(n) || n < 0) {
      errors.push(`Level must be a non-negative integer (got: ${levelStr})`)
    }
  }

  const qty = mapped['quantity']
  if (qty !== null && qty !== '') {
    const n = Number(qty)
    if (isNaN(n) || n <= 0) errors.push(`Quantity must be a positive number (got: ${qty})`)
  }
}

// Cross-row validation for level-mode BOM imports.
// Mutates result objects in place — only called after all per-row results exist.
function validateBomLevelSequence(results: RowValidationResult[]): void {
  let prevLevel: number | null = null

  for (const r of results) {
    // Skip rows that already failed per-row validation or have no level value.
    if (r.status === 'error') continue
    const levelStr = String(r.mappedData['level'] ?? '').trim()
    if (levelStr === '') continue
    const level = Number(levelStr)
    if (!Number.isInteger(level) || level < 0) continue  // caught per-row

    if (prevLevel === null) {
      // The very first valid level row must be Level 0.
      if (level !== 0) {
        r.errors.push('First BOM row must be Level 0 (the root / finished product)')
        r.status = 'error'
        // Do not set prevLevel — treat the next valid row as still being "first".
        continue
      }
      prevLevel = 0
      continue
    }

    if (level > prevLevel + 1) {
      r.errors.push(
        `Invalid level jump: ${prevLevel} → ${level}. ` +
        `Level cannot increase by more than 1 from the previous row.`
      )
      r.status = 'error'
      // Keep prevLevel unchanged so the next valid row checks against the
      // last structurally-sound level, not the rejected jump target.
    } else {
      prevLevel = level
    }
  }
}

function validateCosts(
  mapped: Record<string, string | null>,
  errors: string[],
  warnings: string[]
): void {
  requireField(mapped, 'sku', errors)
  requireField(mapped, 'cost', errors)
  requireField(mapped, 'cost_set', errors)

  const cost = mapped['cost']
  if (cost !== null && cost !== '') {
    const n = Number(cost)
    if (isNaN(n)) errors.push(`Cost must be a number (got: ${cost})`)
    else if (n < 0) warnings.push('Cost is negative — please verify')
  }

  const eff = mapped['effective_date']
  if (eff && isNaN(Date.parse(String(eff)))) {
    errors.push(`Effective date is not a valid date (got: ${eff})`)
  }

  const ccy = mapped['currency']
  if (ccy && !/^[A-Z]{3}$/.test(String(ccy).toUpperCase().trim())) {
    warnings.push(`Currency "${ccy}" is not a standard 3-letter ISO code — defaulting to USD`)
  }
}

function validateInventory(
  mapped: Record<string, string | null>,
  errors: string[],
  warnings: string[]
): void {
  requireField(mapped, 'sku', errors)
  requireField(mapped, 'quantity', errors)

  const qty = mapped['quantity']
  if (qty !== null && qty !== '') {
    const n = Number(qty)
    if (isNaN(n)) errors.push(`Quantity must be a number (got: ${qty})`)
    else if (n < 0) warnings.push('Quantity is negative — please verify')
  }

  const sd = mapped['snapshot_date']
  if (sd && isNaN(Date.parse(String(sd)))) {
    errors.push(`Snapshot date is not a valid date (got: ${sd})`)
  }
}

function validatePurchaseHistory(
  mapped: Record<string, string | null>,
  errors: string[],
  warnings: string[]
): void {
  requireField(mapped, 'sku_part_number', errors)
  requireField(mapped, 'purchase_date', errors)
  requireField(mapped, 'quantity', errors)
  requireField(mapped, 'unit_cost', errors)
  requireField(mapped, 'currency', errors)

  const dateVal = mapped['purchase_date']
  if (dateVal && isNaN(Date.parse(String(dateVal)))) {
    errors.push(`purchase_date is not a valid date (got: ${dateVal})`)
  }

  const qty = Number(mapped['quantity'])
  if (mapped['quantity'] !== null && mapped['quantity'] !== '') {
    if (isNaN(qty) || qty <= 0) errors.push(`quantity must be a positive number (got: ${mapped['quantity']})`)
  }

  const cost = Number(mapped['unit_cost'])
  if (mapped['unit_cost'] !== null && mapped['unit_cost'] !== '') {
    if (isNaN(cost)) errors.push(`unit_cost must be numeric (got: ${mapped['unit_cost']})`)
    else if (cost < 0) errors.push('unit_cost cannot be negative')
    else if (cost === 0) warnings.push('unit_cost is zero — this record will not be used by costing strategies')
  }

  const ccy = String(mapped['currency'] ?? '').toUpperCase().trim()
  if (ccy && !/^[A-Z]{3}$/.test(ccy)) {
    errors.push(`currency must be a 3-letter ISO code (got: ${mapped['currency']})`)
  }

  // site_code: if mapped but empty, flag it
  if ('site_code' in mapped && (mapped['site_code'] === null || String(mapped['site_code'] ?? '').trim() === '')) {
    errors.push('site_code is empty — either map it to a column with values or remove the mapping and select a default site')
  }
}

function validatePriceList(
  mapped: Record<string, string | null>,
  errors: string[],
  warnings: string[],
  normalizations: string[]
): void {
  requireField(mapped, 'part_number', errors)
  requireField(mapped, 'unit_price', errors)

  const price = mapped['unit_price']
  if (price !== null && price !== '') {
    const n = Number(price)
    if (isNaN(n)) errors.push(`unit_price must be numeric (got: ${price})`)
    else if (n < 0) errors.push('unit_price cannot be negative')
    else if (n === 0) warnings.push('unit_price is zero — this SKU will not be costed from this price list')
  }

  const rawCcy = String(mapped['currency'] ?? '').trim()
  if (rawCcy) {
    const isoFromSymbol = CURRENCY_SYMBOLS[rawCcy]
    if (isoFromSymbol) {
      // Normalize symbol to ISO in-place so the committer receives the correct code.
      // Track for file-level aggregation — does not affect row status.
      mapped['currency'] = isoFromSymbol
      normalizations.push(`'${rawCcy}' → ${isoFromSymbol}`)
    } else {
      const upperCcy = rawCcy.toUpperCase()
      if (!/^[A-Z]{3}$/.test(upperCcy)) {
        errors.push(`currency must be a 3-letter ISO code (got: ${rawCcy})`)
      } else {
        mapped['currency'] = upperCcy  // normalize case
      }
    }
  }
  // Empty currency is valid — row inherits the header-level currency set in priceListMeta
}

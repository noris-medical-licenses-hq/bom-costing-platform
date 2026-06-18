import type { ImportType } from './importTypes'

export interface RowValidationResult {
  rowNumber: number
  status: 'valid' | 'warning' | 'error'
  errors: string[]
  warnings: string[]
  mappedData: Record<string, string | number | boolean | null>
}

export function validateRows(
  rawRows: Record<string, string>[],
  mapping: Record<string, string>,
  importType: ImportType
): RowValidationResult[] {
  return rawRows.map((raw, i) => validateRow(i + 1, raw, mapping, importType))
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
  const mapped = applyMapping(rawData, mapping)

  if (isAllEmpty(mapped)) {
    return { rowNumber, status: 'error', errors: ['Empty row — skipped'], warnings: [], mappedData: {} }
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
    default:
      errors.push(`Import type "${importType}" is not yet supported for validation`)
  }

  const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid'
  return { rowNumber, status, errors, warnings, mappedData: mapped as Record<string, string | number | boolean | null> }
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

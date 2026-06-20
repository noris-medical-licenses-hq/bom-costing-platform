import { randomUUID } from 'crypto'
import type { SupabaseServiceClient } from './supabase'
import type { ImportType } from './importTypes'
import type { RowValidationResult } from './importValidators'


export interface PriceListQualityMetrics {
  totalRows:          number
  importedRows:       number
  rejectedRows:       number
  duplicateSkus:      number
  missingSkus:        number
  missingPrices:      number
  currencyMismatches: number
  priceListVersionId: string
  priceListName:      string
  countryCode:        string
  versionNumber:      number
  effectiveDate:      string
}

export interface PurchaseHistoryQualityMetrics {
  rowsImported:       number
  uniqueSkus:         number
  uniqueSuppliers:    number
  dateRange:          { min: string; max: string } | null
  sitesCovered:       number
  missingSuppliers:   number
  zeroCostRecords:    number
  duplicateRefs:      number
}

export interface BomImportSummary {
  totalRows:            number
  bomLinesCreated:      number
  maxDepth:             number
  autoCreatedSkusCount: number
  warningCount:         number
  errorCount:           number
}

export interface CommitResult {
  committed:               number
  skipped:                 number
  errors:                  Array<{ row: number; error: string }>
  qualityMetrics?:         PriceListQualityMetrics
  purchaseHistoryMetrics?: PurchaseHistoryQualityMetrics
  bomSummary?:             BomImportSummary
}

// ─── SKU prefix classification ────────────────────────────────────────────────
// Exported so it can be unit-tested independently of DB interactions.
//
// Classification rules (per BOM onboarding convention):
//   PR*  →  make_buy = 'buy',  classification_status = 'classified'
//   NM*  →  make_buy = 'make', classification_status = 'classified'
//   NG*  →  make_buy = 'make', classification_status = 'classified'
//   else →  make_buy = null,   classification_status = 'needs_review'
//
// The returned values are defaults only. Users can edit make_buy at any time.
export function classifySkuByPrefix(partNumber: string): {
  makeBuy:              'make' | 'buy' | null
  classificationStatus: 'classified' | 'needs_review'
  itemType:             'purchased_part' | 'sub_assembly'
} {
  const upper = partNumber.toUpperCase()
  if (upper.startsWith('PR')) {
    return { makeBuy: 'buy',  classificationStatus: 'classified', itemType: 'purchased_part' }
  }
  if (upper.startsWith('NM') || upper.startsWith('NG')) {
    return { makeBuy: 'make', classificationStatus: 'classified', itemType: 'sub_assembly' }
  }
  return { makeBuy: null, classificationStatus: 'needs_review', itemType: 'purchased_part' }
}

// Rows are processed in batches for all DB writes. This keeps individual
// API calls small and avoids memory spikes for large imports.
const DB_BATCH = 200

export async function commitImport(
  jobId: string,
  orgId: string,
  userId: string,
  importType: ImportType,
  rows: RowValidationResult[],
  client: SupabaseServiceClient
): Promise<CommitResult> {
  const commitableRows = rows.filter(r => r.status === 'valid' || r.status === 'warning')
  const result: CommitResult = {
    committed: 0,
    skipped: rows.length - commitableRows.length,
    errors: [],
  }

  switch (importType) {
    case 'sku_master':
      await commitSkuMaster(commitableRows, orgId, userId, result, client)
      break
    case 'bom_lines':
      await commitBomLines(commitableRows, jobId, orgId, userId, result, client)
      break
    case 'costs':
      await commitCosts(commitableRows, orgId, userId, result, client)
      break
    case 'inventory_snapshot':
      await commitInventory(commitableRows, orgId, userId, result, client)
      break
    case 'price_list':
      await commitPriceList(jobId, commitableRows, orgId, userId, result, client)
      break
    case 'purchase_history':
      await commitPurchaseHistory(jobId, commitableRows, orgId, userId, result, client)
      break
    default:
      result.errors.push({ row: 0, error: `Import type "${importType}" commit not yet implemented` })
  }

  return result
}

// ─── SKU Master ──────────────────────────────────────────────────────────────

async function commitSkuMaster(
  rows: RowValidationResult[],
  orgId: string,
  userId: string,
  result: CommitResult,
  client: SupabaseServiceClient
): Promise<void> {
  const db = client as any
  const { data: families } = await db.from('families').select('id, code, name').eq('organization_id', orgId)
  const { data: subfamilies } = await db.from('subfamilies').select('id, code, name').eq('organization_id', orgId)

  const familyMap = new Map<string, string>()
  for (const f of families ?? []) {
    familyMap.set(f.name.toLowerCase(), f.id)
    familyMap.set(f.code.toLowerCase(), f.id)
  }
  const subfamilyMap = new Map<string, string>()
  for (const sf of subfamilies ?? []) {
    subfamilyMap.set(sf.name.toLowerCase(), sf.id)
    subfamilyMap.set(sf.code.toLowerCase(), sf.id)
  }

  // Build all upsert records first, then bulk-upsert in batches
  const records = rows.map(row => {
    const d        = row.mappedData
    const famName  = d['family']    ? String(d['family']).toLowerCase().trim()    : null
    const subName  = d['subfamily'] ? String(d['subfamily']).toLowerCase().trim() : null
    return {
      organization_id: orgId,
      part_number:     String(d['sku'] ?? '').trim(),
      name:            String(d['description'] ?? '').trim(),
      description:     null as string | null,
      item_type:       'purchased_part',
      make_buy:        'buy',
      unit_of_measure: d['uom'] ? String(d['uom']).trim() : 'EA',
      family_id:       famName ? (familyMap.get(famName) ?? null) : null,
      subfamily_id:    subName ? (subfamilyMap.get(subName) ?? null) : null,
      status:             'active',
      is_regulated:       false,
      import_job_row_id:  row.rowId ?? null,
      created_by:         userId,
      updated_by:         userId,
      _rowNumber:         row.rowNumber,
    }
  })

  for (let i = 0; i < records.length; i += DB_BATCH) {
    const batch = records.slice(i, i + DB_BATCH)
    const upsertRows = batch.map(({ _rowNumber: _r, ...r }) => r)
    const { error } = await db.from('skus').upsert(
      upsertRows,
      { onConflict: 'organization_id,part_number', ignoreDuplicates: false }
    )
    if (error) {
      for (const r of batch) result.errors.push({ row: r._rowNumber, error: error.message })
    } else {
      result.committed += batch.length
    }
  }
}

// ─── BOM Lines ───────────────────────────────────────────────────────────────

async function commitBomLines(
  rows: RowValidationResult[],
  jobId: string,
  orgId: string,
  userId: string,
  result: CommitResult,
  client: SupabaseServiceClient
): Promise<void> {
  const db = client as any
  const hasLevel = rows.some(
    r => r.mappedData['level'] !== undefined && r.mappedData['level'] !== null
  )

  if (hasLevel) {
    await commitBomLinesLevelMode(rows, jobId, orgId, userId, result, db)
  } else {
    await commitBomLinesFlatMode(rows, jobId, orgId, userId, result, db)
  }
}

// ─── Shared: find or create a BOM record + new draft version ─────────────────

async function findOrCreateBomVersion(
  parentSkuId: string,
  orgId: string,
  userId: string,
  db: any
): Promise<{ versionId: string } | { error: string }> {
  let { data: bom } = await db.from('boms')
    .select('id')
    .eq('organization_id', orgId)
    .eq('sku_id', parentSkuId)
    .maybeSingle()

  if (!bom) {
    const { data: newBom, error: bomErr } = await db.from('boms').insert({
      organization_id: orgId,
      sku_id:          parentSkuId,
      created_by:      userId,
      updated_by:      userId,
    }).select('id').single()
    if (bomErr || !newBom) return { error: `Failed to create BOM: ${bomErr?.message}` }
    bom = newBom
  }

  const { data: maxVer } = await db.from('bom_versions')
    .select('version_number')
    .eq('bom_id', bom.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: version, error: verErr } = await db.from('bom_versions').insert({
    organization_id: orgId,
    bom_id:          bom.id,
    version_number:  (maxVer?.version_number ?? 0) + 1,
    status:          'draft',
    effective_from:  new Date().toISOString().slice(0, 10),
    created_by:      userId,
    updated_by:      userId,
  }).select('id').single()

  if (verErr || !version) return { error: `Failed to create BOM version: ${verErr?.message}` }
  return { versionId: version.id }
}

// ─── Shared: auto-create missing SKUs and warn about them ────────────────────
//
// MVP Limitation: auto-created SKUs are committed to the SKU master before BOM
// lines are inserted. If the subsequent BOM line commit fails, the SKU remains
// in the master (marked auto_created = true, classifiable by the user).

interface AutoCreatedSkuInfo {
  partNumber:   string
  skuId:        string
  makeBuy:      'make' | 'buy' | null
  status:       'classified' | 'needs_review'
}

async function autoCreateMissingSkus(
  missingPartNumbers: string[],
  allRows: RowValidationResult[],
  jobId: string,
  orgId: string,
  userId: string,
  skuMap: Map<string, string>,  // mutated in place with new IDs
  db: any
): Promise<AutoCreatedSkuInfo[]> {
  if (missingPartNumbers.length === 0) return []

  // Build a lookup from part number to description (available in level mode).
  const descriptionByPn = new Map<string, string>()
  for (const r of allRows) {
    const pn  = String(r.mappedData['sku'] ?? '').trim()
    const desc = String(r.mappedData['description'] ?? '').trim()
    if (pn && desc && !descriptionByPn.has(pn)) descriptionByPn.set(pn, desc)
  }

  const records = missingPartNumbers.map(pn => {
    const { makeBuy, classificationStatus, itemType } = classifySkuByPrefix(pn)
    const desc = descriptionByPn.get(pn) ?? null
    return {
      organization_id:        orgId,
      part_number:            pn,
      name:                   desc ?? pn,
      description:            desc,
      item_type:              itemType,
      make_buy:               makeBuy,
      classification_status:  classificationStatus,
      unit_of_measure:        'EA',
      status:                 'active',
      is_regulated:           false,
      auto_created:           true,
      created_source:         'BOM_IMPORT',
      original_import_job_id: jobId,
      created_by:             userId,
      updated_by:             userId,
    }
  })

  // Upsert with ignoreDuplicates: if another concurrent import already created
  // the SKU, the existing record is left unchanged.
  await db.from('skus').upsert(
    records,
    { onConflict: 'organization_id,part_number', ignoreDuplicates: true }
  )

  // Re-query to get IDs for all processed part numbers (newly created or pre-existing).
  const { data: resolvedRows } = await db.from('skus')
    .select('id, part_number')
    .eq('organization_id', orgId)
    .in('part_number', missingPartNumbers)

  const autoCreated: AutoCreatedSkuInfo[] = []
  for (const s of resolvedRows ?? []) {
    skuMap.set(s.part_number, s.id)
    const { makeBuy, classificationStatus } = classifySkuByPrefix(s.part_number)
    autoCreated.push({
      partNumber: s.part_number,
      skuId:      s.id,
      makeBuy,
      status:     classificationStatus,
    })
  }
  return autoCreated
}

// Appends AUTO_CREATED_SKU warnings to the import_job_rows that triggered each
// auto-creation so they appear in the export and in the UI issue list.
async function writeAutoCreatedSkuWarnings(
  autoCreated: AutoCreatedSkuInfo[],
  allRows: RowValidationResult[],
  db: any
): Promise<void> {
  if (autoCreated.length === 0) return

  const autoCreatedPns = new Set(autoCreated.map(a => a.partNumber))

  // Map rowId → [warning messages]
  const rowWarnings = new Map<string, string[]>()
  const skuFields = ['sku', 'parent_sku', 'child_sku'] as const
  for (const r of allRows) {
    if (!r.rowId) continue
    for (const field of skuFields) {
      const pn = String(r.mappedData[field] ?? '').trim()
      if (pn && autoCreatedPns.has(pn)) {
        const msgs = rowWarnings.get(r.rowId) ?? []
        const msg  = `SKU "${pn}" was automatically created during BOM import`
        if (!msgs.includes(msg)) msgs.push(msg)
        rowWarnings.set(r.rowId, msgs)
      }
    }
  }

  if (rowWarnings.size === 0) return

  const rowIds = Array.from(rowWarnings.keys())
  const { data: existingRows } = await db.from('import_job_rows')
    .select('id, warnings')
    .in('id', rowIds)

  for (const existing of existingRows ?? []) {
    const current  = (existing.warnings as string[] | null) ?? []
    const toAppend = rowWarnings.get(existing.id) ?? []
    await db.from('import_job_rows')
      .update({ warnings: [...current, ...toAppend] })
      .eq('id', existing.id)
  }
}

// ─── Flat mode commit ─────────────────────────────────────────────────────────

async function commitBomLinesFlatMode(
  rows: RowValidationResult[],
  jobId: string,
  orgId: string,
  userId: string,
  result: CommitResult,
  db: any
): Promise<void> {
  const allSkuNums = new Set<string>()
  for (const r of rows) {
    const p = String(r.mappedData['parent_sku'] ?? '').trim()
    const c = String(r.mappedData['child_sku'] ?? '').trim()
    if (p) allSkuNums.add(p)
    if (c) allSkuNums.add(c)
  }

  const { data: skuRows } = await db.from('skus')
    .select('id, part_number')
    .eq('organization_id', orgId)
    .in('part_number', Array.from(allSkuNums))

  const skuMap = new Map<string, string>()
  for (const s of skuRows ?? []) skuMap.set(s.part_number, s.id)

  // Auto-create any SKUs that don't exist yet.
  const missing = Array.from(allSkuNums).filter(pn => !skuMap.has(pn))
  const autoCreated = await autoCreateMissingSkus(missing, rows, jobId, orgId, userId, skuMap, db)
  await writeAutoCreatedSkuWarnings(autoCreated, rows, db)

  // Group rows by parent SKU and commit each BOM.
  const parentGroups = new Map<string, RowValidationResult[]>()
  for (const r of rows) {
    const p = String(r.mappedData['parent_sku'] ?? '').trim()
    const arr = parentGroups.get(p) ?? []
    arr.push(r)
    parentGroups.set(p, arr)
  }

  let errorCount = result.errors.length

  for (const [parentSku, parentRows] of parentGroups) {
    const parentId = skuMap.get(parentSku)
    if (!parentId) {
      for (const r of parentRows) {
        result.errors.push({ row: r.rowNumber, error: `Parent SKU "${parentSku}" could not be resolved` })
        result.skipped++
      }
      continue
    }

    const bomResult = await findOrCreateBomVersion(parentId, orgId, userId, db)
    if ('error' in bomResult) {
      for (const r of parentRows) result.errors.push({ row: r.rowNumber, error: bomResult.error })
      continue
    }

    const lineRecords = []
    for (const r of parentRows) {
      const childSku = String(r.mappedData['child_sku'] ?? '').trim()
      const childId  = skuMap.get(childSku)
      if (!childId) {
        result.errors.push({ row: r.rowNumber, error: `Child SKU "${childSku}" could not be resolved` })
        result.skipped++
        continue
      }
      lineRecords.push({
        organization_id:   orgId,
        bom_version_id:    bomResult.versionId,
        line_type:         'sku',
        sku_id:            childId,
        quantity:          Number(r.mappedData['quantity']) || 1,
        unit_of_measure:   'EA',
        import_job_row_id: r.rowId ?? null,
        created_by:        userId,
        updated_by:        userId,
        _rowNumber:        r.rowNumber,
      })
    }

    for (let i = 0; i < lineRecords.length; i += DB_BATCH) {
      const batch       = lineRecords.slice(i, i + DB_BATCH)
      const insertBatch = batch.map(({ _rowNumber: _r, ...row }) => row)
      const { error }   = await db.from('bom_lines').insert(insertBatch)
      if (error) {
        for (const r of batch) result.errors.push({ row: r._rowNumber, error: error.message })
      } else {
        result.committed += batch.length
      }
    }
  }

  const newErrors = result.errors.length - errorCount
  result.bomSummary = {
    totalRows:            rows.length,
    bomLinesCreated:      result.committed,
    maxDepth:             1,  // flat mode is always depth 1
    autoCreatedSkusCount: autoCreated.length,
    warningCount:         rows.filter(r => r.status === 'warning').length + autoCreated.length,
    errorCount:           newErrors,
  }
  await saveBomSummaryToJob(jobId, result.bomSummary, db)
}

// ─── Level mode commit ────────────────────────────────────────────────────────
//
// The BOM tree is encoded in a flat file using a Level column:
//   Level 0 = root finished product (identifies the BOM, not itself a line)
//   Level 1 = direct child of the root
//   Level N = child of the nearest preceding Level N-1 row
//
// Pre-generated UUIDs allow all lines in a BOM group to be bulk-inserted while
// still having the correct parent_line_id references.

async function commitBomLinesLevelMode(
  rows: RowValidationResult[],
  jobId: string,
  orgId: string,
  userId: string,
  result: CommitResult,
  db: any
): Promise<void> {
  // Collect all unique part numbers across every row.
  const allSkuNums = new Set<string>()
  for (const r of rows) {
    const pn = String(r.mappedData['sku'] ?? '').trim()
    if (pn) allSkuNums.add(pn)
  }

  const { data: skuRows } = await db.from('skus')
    .select('id, part_number')
    .eq('organization_id', orgId)
    .in('part_number', Array.from(allSkuNums))

  const skuMap = new Map<string, string>()
  for (const s of skuRows ?? []) skuMap.set(s.part_number, s.id)

  const missing = Array.from(allSkuNums).filter(pn => !skuMap.has(pn))
  const autoCreated = await autoCreateMissingSkus(missing, rows, jobId, orgId, userId, skuMap, db)
  await writeAutoCreatedSkuWarnings(autoCreated, rows, db)

  // Split rows into BOM groups: each Level 0 row starts a new group.
  const groups: RowValidationResult[][] = []
  let current: RowValidationResult[] = []
  for (const r of rows) {
    const level = Number(r.mappedData['level'])
    if (level === 0 && current.length > 0) {
      groups.push(current)
      current = []
    }
    current.push(r)
  }
  if (current.length > 0) groups.push(current)

  let maxDepth    = 0
  let errorCount  = result.errors.length

  for (const group of groups) {
    const rootRow = group[0]
    const rootSku = String(rootRow.mappedData['sku'] ?? '').trim()
    const rootId  = skuMap.get(rootSku)

    if (!rootId) {
      for (const r of group) {
        result.errors.push({ row: r.rowNumber, error: `Root SKU "${rootSku}" could not be resolved` })
        result.skipped++
      }
      continue
    }

    const bomResult = await findOrCreateBomVersion(rootId, orgId, userId, db)
    if ('error' in bomResult) {
      for (const r of group) result.errors.push({ row: r.rowNumber, error: bomResult.error })
      continue
    }

    // Stack-based parent_line_id resolution.
    // Each entry: the level and pre-generated UUID of the last inserted line at that depth.
    type StackEntry = { level: number; lineId: string; partNumber: string }
    const stack:       StackEntry[] = []
    const ancestorSet  = new Set<string>([rootSku])  // root counts as an ancestor
    const lineRecords: Array<Record<string, unknown> & { _rowNumber: number }> = []

    for (const r of group.slice(1)) {  // skip the Level 0 root row
      const level  = Number(r.mappedData['level'])
      const pn     = String(r.mappedData['sku'] ?? '').trim()
      const skuId  = skuMap.get(pn)

      if (!skuId) {
        result.errors.push({ row: r.rowNumber, error: `SKU "${pn}" could not be resolved` })
        result.skipped++
        continue
      }

      // Pop stack until the top entry's level is strictly less than current level.
      // Each popped entry leaves the ancestor chain.
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        ancestorSet.delete(stack.pop()!.partNumber)
      }

      // Circular reference: current SKU already appears in the active ancestor path.
      if (ancestorSet.has(pn)) {
        result.errors.push({
          row:   r.rowNumber,
          error: `Circular BOM reference: "${pn}" is already an ancestor in this BOM path`,
        })
        result.skipped++
        continue
      }

      const parentLineId = stack.length > 0 ? stack[stack.length - 1].lineId : null
      const lineId       = randomUUID()

      lineRecords.push({
        id:                lineId,
        organization_id:   orgId,
        bom_version_id:    bomResult.versionId,
        parent_line_id:    parentLineId,
        line_type:         'sku',
        sku_id:            skuId,
        quantity:          Number(r.mappedData['quantity']) || 1,
        unit_of_measure:   'EA',
        import_job_row_id: r.rowId ?? null,
        created_by:        userId,
        updated_by:        userId,
        _rowNumber:        r.rowNumber,
      })

      stack.push({ level, lineId, partNumber: pn })
      ancestorSet.add(pn)
      if (level > maxDepth) maxDepth = level
    }

    for (let i = 0; i < lineRecords.length; i += DB_BATCH) {
      const batch       = lineRecords.slice(i, i + DB_BATCH)
      const insertBatch = batch.map(({ _rowNumber: _r, ...row }) => row)
      const { error }   = await db.from('bom_lines').insert(insertBatch)
      if (error) {
        for (const r of batch) result.errors.push({ row: r._rowNumber as number, error: error.message })
      } else {
        result.committed += batch.length
      }
    }
  }

  const newErrors = result.errors.length - errorCount
  result.bomSummary = {
    totalRows:            rows.length,
    bomLinesCreated:      result.committed,
    maxDepth,
    autoCreatedSkusCount: autoCreated.length,
    warningCount:         rows.filter(r => r.status === 'warning').length + autoCreated.length,
    errorCount:           newErrors,
  }
  await saveBomSummaryToJob(jobId, result.bomSummary, db)
}

async function saveBomSummaryToJob(
  jobId: string,
  summary: BomImportSummary,
  db: any
): Promise<void> {
  const { data: job } = await db.from('import_jobs').select('metadata').eq('id', jobId).single()
  const existing = (job?.metadata as Record<string, unknown>) ?? {}
  await db.from('import_jobs')
    .update({ metadata: { ...existing, bom_summary: summary } })
    .eq('id', jobId)
}

// ─── Costs ───────────────────────────────────────────────────────────────────

async function commitCosts(
  rows: RowValidationResult[],
  orgId: string,
  userId: string,
  result: CommitResult,
  client: SupabaseServiceClient
): Promise<void> {
  const db = client as any
  const skuNums = [...new Set(rows.map(r => String(r.mappedData['sku'] ?? '').trim()))]
  const csNames = [...new Set(rows.map(r => String(r.mappedData['cost_set'] ?? '').trim()))]

  const { data: skuRows } = await db.from('skus').select('id, part_number').eq('organization_id', orgId).in('part_number', skuNums)
  const { data: csRows  } = await db.from('cost_sets').select('id, name').eq('organization_id', orgId).in('name', csNames)

  const skuMap = new Map<string, string>()
  for (const s of skuRows ?? []) skuMap.set(s.part_number, s.id)
  const csMap = new Map<string, string>()
  for (const cs of csRows ?? []) csMap.set(cs.name, cs.id)

  // Resolve all rows to insert records, collecting errors for unknowns
  const toInsert: Array<Record<string, unknown> & { _rowNumber: number }> = []

  for (const r of rows) {
    const skuNum = String(r.mappedData['sku'] ?? '').trim()
    const csName = String(r.mappedData['cost_set'] ?? '').trim()
    const skuId  = skuMap.get(skuNum)
    const csId   = csMap.get(csName)

    if (!skuId) { result.errors.push({ row: r.rowNumber, error: `SKU "${skuNum}" not found` }); result.skipped++; continue }
    if (!csId)  { result.errors.push({ row: r.rowNumber, error: `Cost set "${csName}" not found` }); result.skipped++; continue }

    const rawCcy  = r.mappedData['currency'] ? String(r.mappedData['currency']).toUpperCase().trim() : null
    const ccy     = rawCcy && /^[A-Z]{3}$/.test(rawCcy) ? rawCcy : 'USD'
    const effRaw  = r.mappedData['effective_date'] ? String(r.mappedData['effective_date']) : null
    const effDate = effRaw && !isNaN(Date.parse(effRaw))
      ? new Date(effRaw).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    toInsert.push({
      organization_id:    orgId,
      cost_set_id:        csId,
      item_type:          'material_price',
      scope_type:         'sku',
      scope_id:           skuId,
      scope_code:         skuNum,
      value:              Number(r.mappedData['cost']) || 0,
      value_unit:         'currency_amount',
      currency:           ccy,
      applies_to:         'per_unit',
      effective_from:     effDate,
      is_active:          true,
      import_job_row_id:  r.rowId ?? null,
      created_by:         userId,
      updated_by:         userId,
      _rowNumber:         r.rowNumber,
    })
  }

  for (let i = 0; i < toInsert.length; i += DB_BATCH) {
    const batch = toInsert.slice(i, i + DB_BATCH)
    const insertBatch = batch.map(({ _rowNumber: _r, ...row }) => row)
    const { error } = await db.from('cost_items').insert(insertBatch)
    if (error) {
      for (const r of batch) result.errors.push({ row: r._rowNumber as number, error: error.message })
    } else {
      result.committed += batch.length
    }
  }
}

// ─── Inventory Snapshot ───────────────────────────────────────────────────────

async function commitInventory(
  rows: RowValidationResult[],
  orgId: string,
  userId: string,
  result: CommitResult,
  client: SupabaseServiceClient
): Promise<void> {
  const db = client as any
  const { data: costSets } = await db.from('cost_sets')
    .select('id, base_currency')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .limit(1)

  const costSet = costSets?.[0]
  if (!costSet) {
    result.errors.push({ row: 0, error: 'No active cost set found. Create a cost set before importing inventory.' })
    return
  }

  const { data: snapshot, error: snapErr } = await db.from('inventory_snapshots').insert({
    organization_id: orgId,
    snapshot_name:   `Import ${new Date().toISOString().slice(0, 10)}`,
    snapshot_date:   new Date().toISOString().slice(0, 10),
    snapshot_type:   'full',
    cost_set_id:     costSet.id,
    base_currency:   costSet.base_currency ?? 'USD',
    status:          'draft',
    created_by:      userId,
    updated_by:      userId,
  }).select('id').single()

  if (snapErr || !snapshot) {
    result.errors.push({ row: 0, error: `Failed to create inventory snapshot: ${snapErr?.message}` })
    return
  }

  // Load SKU and warehouse lookups
  const skuNums = [...new Set(rows.map(r => String(r.mappedData['sku'] ?? '').trim()))]
  const { data: skuRows } = await db.from('skus').select('id, part_number').eq('organization_id', orgId).in('part_number', skuNums)
  const skuMap = new Map<string, string>()
  for (const s of skuRows ?? []) skuMap.set(s.part_number, s.id)

  const { data: whRows } = await db.from('warehouses').select('id, code, name').eq('organization_id', orgId)
  const whMap = new Map<string, string>()
  for (const w of whRows ?? []) {
    whMap.set(w.code.toLowerCase(), w.id)
    whMap.set(w.name.toLowerCase(), w.id)
  }
  const defaultWarehouseId = whRows?.[0]?.id ?? null

  // Build all line records, then bulk insert
  const toInsert: Array<Record<string, unknown> & { _rowNumber: number }> = []

  for (const r of rows) {
    const skuNum = String(r.mappedData['sku'] ?? '').trim()
    const skuId  = skuMap.get(skuNum)
    if (!skuId) {
      result.errors.push({ row: r.rowNumber, error: `SKU "${skuNum}" not found` })
      result.skipped++
      continue
    }

    const whRaw       = r.mappedData['warehouse'] ? String(r.mappedData['warehouse']).toLowerCase().trim() : null
    const warehouseId = (whRaw ? whMap.get(whRaw) : null) ?? defaultWarehouseId
    if (!warehouseId) {
      result.errors.push({ row: r.rowNumber, error: 'No warehouse found. Create at least one warehouse first.' })
      result.skipped++
      continue
    }

    toInsert.push({
      organization_id:    orgId,
      snapshot_id:        snapshot.id,
      sku_id:             skuId,
      warehouse_id:       warehouseId,
      quantity:           Number(r.mappedData['quantity']) || 0,
      currency:           costSet.base_currency ?? 'USD',
      import_job_row_id:  r.rowId ?? null,
      created_by:         userId,
      updated_by:         userId,
      _rowNumber:         r.rowNumber,
    })
  }

  for (let i = 0; i < toInsert.length; i += DB_BATCH) {
    const batch = toInsert.slice(i, i + DB_BATCH)
    const insertBatch = batch.map(({ _rowNumber: _r, ...row }) => row)
    const { error } = await db.from('inventory_lines').insert(insertBatch)
    if (error) {
      for (const r of batch) result.errors.push({ row: r._rowNumber as number, error: error.message })
    } else {
      result.committed += batch.length
    }
  }
}

// ─── Price List ───────────────────────────────────────────────────────────────
// Creates a country_price_list + price_list_version + price_list_version_items.
// Never overwrites existing data — each import creates a new numbered version.

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  germany: 'DE', deutschland: 'DE',
  france: 'FR', frankreich: 'FR',
  italy: 'IT', italia: 'IT',
  spain: 'ES', espana: 'ES',
  'united states': 'US', usa: 'US', america: 'US',
  'united kingdom': 'GB', uk: 'GB', britain: 'GB', england: 'GB',
  austria: 'AT', österreich: 'AT',
  switzerland: 'CH', schweiz: 'CH',
  netherlands: 'NL', holland: 'NL',
  belgium: 'BE',
  poland: 'PL',
  'czech republic': 'CZ', czechia: 'CZ',
  hungary: 'HU',
  sweden: 'SE',
  denmark: 'DK',
  norway: 'NO',
  finland: 'FI',
  portugal: 'PT',
  greece: 'GR',
  israel: 'IL',
  china: 'CN',
  japan: 'JP',
  'south korea': 'KR', korea: 'KR',
  india: 'IN',
}

async function commitPriceList(
  jobId: string,
  rows: RowValidationResult[],
  orgId: string,
  userId: string,
  result: CommitResult,
  client: SupabaseServiceClient
): Promise<void> {
  const db = client as any

  // Load job metadata
  const { data: job } = await db.from('import_jobs').select('metadata, file_name').eq('id', jobId).single()
  const meta = (job?.metadata as Record<string, unknown>)?.price_list as Record<string, string> | undefined

  const priceListName  = (meta?.priceListName ?? job?.file_name ?? `Price List ${new Date().toISOString().slice(0, 10)}`).trim()
  const rawCountry     = (meta?.targetCountry ?? '').trim()
  const currency       = ((meta?.currency ?? 'USD').trim().toUpperCase() || 'USD')
  const today          = new Date().toISOString().slice(0, 10)
  const effectiveDate  = meta?.effectiveDate ?? today

  // Resolve country code
  const countryCode: string = rawCountry.length === 2
    ? rawCountry.toUpperCase()
    : (COUNTRY_NAME_TO_CODE[rawCountry.toLowerCase()] ?? 'XX')

  // ── Find or create country_price_list ─────────────────────────────────────
  let priceListId: string

  const { data: existingPl } = await db.from('country_price_lists')
    .select('id')
    .eq('organization_id', orgId)
    .eq('country_code', countryCode)
    .eq('name', priceListName)
    .maybeSingle()

  if (existingPl) {
    priceListId = existingPl.id
  } else {
    const { data: newPl, error: plErr } = await db.from('country_price_lists').insert({
      organization_id: orgId,
      country_code:    countryCode,
      name:            priceListName,
      description:     rawCountry ? `Price list for ${rawCountry}` : null,
      is_active:       true,
      created_by:      userId,
    }).select('id').single()

    if (plErr || !newPl) {
      result.errors.push({ row: 0, error: `Failed to create country price list: ${plErr?.message ?? 'unknown'}` })
      return
    }
    priceListId = newPl.id
  }

  // ── Determine next version number ─────────────────────────────────────────
  const { data: maxVerRow } = await db.from('price_list_versions')
    .select('version_number')
    .eq('price_list_id', priceListId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const versionNumber = (maxVerRow?.version_number ?? 0) + 1

  // Mark any previously active versions as superseded
  await db.from('price_list_versions')
    .update({ status: 'superseded' })
    .eq('price_list_id', priceListId)
    .eq('status', 'active')

  // ── Create price_list_version ─────────────────────────────────────────────
  const { data: plVersion, error: plvErr } = await db.from('price_list_versions').insert({
    organization_id: orgId,
    price_list_id:   priceListId,
    version_number:  versionNumber,
    effective_date:  effectiveDate,
    imported_at:     new Date().toISOString(),
    imported_by:     userId,
    currency,
    status:          'active',
    import_job_id:   jobId,
  }).select('id').single()

  if (plvErr || !plVersion) {
    result.errors.push({ row: 0, error: `Failed to create price list version: ${plvErr?.message ?? 'unknown'}` })
    return
  }
  const versionId: string = plVersion.id

  // ── Load SKU map ──────────────────────────────────────────────────────────
  const partNums = [...new Set(rows.map(r => String(r.mappedData['part_number'] ?? '').trim()).filter(Boolean))]
  const { data: skuRows } = await db.from('skus').select('id, part_number').eq('organization_id', orgId).in('part_number', partNums)
  const skuMap = new Map<string, string>()
  for (const s of skuRows ?? []) skuMap.set(s.part_number, s.id)

  // ── Build quality metrics while processing rows ───────────────────────────
  const seenPartNums  = new Map<string, number>()  // partNum → first rowNumber
  let missingSkus     = 0
  let missingPrices   = 0
  let duplicateSkus   = 0
  let currencyMismatches = 0
  let rejectedRows    = 0

  const toInsert: Array<Record<string, unknown> & { _rowNumber: number }> = []

  for (const r of rows) {
    const partNum = String(r.mappedData['part_number'] ?? '').trim()
    const skuId   = skuMap.get(partNum)

    if (!skuId) {
      missingSkus++
      result.errors.push({ row: r.rowNumber, error: `Part number "${partNum}" not found in SKU master` })
      result.skipped++
      rejectedRows++
      continue
    }

    if (seenPartNums.has(partNum)) {
      duplicateSkus++
      result.errors.push({ row: r.rowNumber, error: `Duplicate part number "${partNum}" (first seen at row ${seenPartNums.get(partNum)})` })
      result.skipped++
      rejectedRows++
      continue
    }
    seenPartNums.set(partNum, r.rowNumber)

    const rawPrice = r.mappedData['unit_price']
    const price    = Number(rawPrice)
    if (isNaN(price) || price < 0) {
      missingPrices++
      result.errors.push({ row: r.rowNumber, error: `Invalid or missing price "${rawPrice}"` })
      result.skipped++
      rejectedRows++
      continue
    }

    const lineCcy = String(r.mappedData['currency'] ?? '').trim().toUpperCase()
    const ccy     = lineCcy.length === 3 ? lineCcy : currency
    if (lineCcy.length === 3 && lineCcy !== currency) currencyMismatches++

    toInsert.push({
      organization_id:      orgId,
      price_list_version_id: versionId,
      sku_id:               skuId,
      part_number:          partNum,
      unit_price:           price,
      currency:             ccy,
      import_job_row_id:    r.rowId ?? null,
      _rowNumber:           r.rowNumber,
    })
  }

  for (let i = 0; i < toInsert.length; i += DB_BATCH) {
    const batch = toInsert.slice(i, i + DB_BATCH)
    const insertBatch = batch.map(({ _rowNumber: _r, ...row }) => row)
    const { error } = await db.from('price_list_version_items').insert(insertBatch)
    if (error) {
      for (const r of batch) {
        result.errors.push({ row: r._rowNumber as number, error: error.message })
        rejectedRows++
      }
    } else {
      result.committed += batch.length
    }
  }

  const importedRows = result.committed
  const metrics: PriceListQualityMetrics = {
    totalRows:          rows.length,
    importedRows,
    rejectedRows,
    duplicateSkus,
    missingSkus,
    missingPrices,
    currencyMismatches,
    priceListVersionId: versionId,
    priceListName,
    countryCode,
    versionNumber,
    effectiveDate,
  }

  // Persist metrics on the version record
  await db.from('price_list_versions').update({
    item_count:      importedRows,
    quality_metrics: metrics,
  }).eq('id', versionId)

  result.qualityMetrics = metrics
}

// ─── Purchase History ─────────────────────────────────────────────────────────

async function commitPurchaseHistory(
  jobId: string,
  rows: RowValidationResult[],
  orgId: string,
  userId: string,
  result: CommitResult,
  client: SupabaseServiceClient
): Promise<void> {
  const db = client as any

  // Load import job metadata for defaultSiteId
  const { data: job } = await db.from('import_jobs').select('metadata').eq('id', jobId).single()
  const meta = (job?.metadata as Record<string, unknown>)?.purchase_history as { defaultSiteId?: string } | undefined
  const defaultSiteId: string | null = meta?.defaultSiteId ?? null

  // Collect all unique lookup keys
  const partNumbers  = new Set<string>()
  const siteCodes    = new Set<string>()
  const supplierCodes = new Set<string>()

  for (const r of rows) {
    const pn = String(r.mappedData['sku_part_number'] ?? '').trim()
    if (pn) partNumbers.add(pn)
    const sc = String(r.mappedData['site_code'] ?? '').trim()
    if (sc) siteCodes.add(sc)
    const sup = String(r.mappedData['supplier_code'] ?? '').trim()
    if (sup) supplierCodes.add(sup)
  }

  // Parallel lookups: SKUs, sites, suppliers
  const [skuRows, siteRows, supplierRows] = await Promise.all([
    partNumbers.size > 0
      ? db.from('skus').select('id, part_number').eq('organization_id', orgId).in('part_number', Array.from(partNumbers))
      : Promise.resolve({ data: [] }),
    siteCodes.size > 0
      ? db.from('sites').select('id, code').eq('organization_id', orgId).in('code', Array.from(siteCodes))
      : Promise.resolve({ data: [] }),
    supplierCodes.size > 0
      ? db.from('suppliers').select('id, code').eq('organization_id', orgId).in('code', Array.from(supplierCodes))
      : Promise.resolve({ data: [] }),
  ])

  const skuMap = new Map<string, string>()
  for (const s of skuRows.data ?? []) skuMap.set(s.part_number, s.id)

  const siteMap = new Map<string, string>()
  for (const s of siteRows.data ?? []) siteMap.set(s.code, s.id)

  const supplierMap = new Map<string, string>()
  for (const s of supplierRows.data ?? []) supplierMap.set(s.code, s.id)

  // Quality metric counters
  const importedSkuIds   = new Set<string>()
  const importedSiteIds  = new Set<string>()
  const importedSupIds   = new Set<string>()
  const seenRefs         = new Set<string>()
  let missingSuppliers   = 0
  let zeroCostRecords    = 0
  let duplicateRefs      = 0
  let minDate: string | null = null
  let maxDate: string | null = null

  const toInsert: Array<Record<string, unknown> & { _rowNumber: number }> = []

  for (const r of rows) {
    const partNum = String(r.mappedData['sku_part_number'] ?? '').trim()
    const skuId   = skuMap.get(partNum)
    if (!skuId) {
      result.errors.push({ row: r.rowNumber, error: `SKU "${partNum}" not found in system — import via SKU Master first` })
      result.skipped++
      continue
    }

    // Resolve site: row-level site_code takes priority over default
    const siteCodeRaw = String(r.mappedData['site_code'] ?? '').trim()
    let siteId: string | null = null
    if (siteCodeRaw) {
      siteId = siteMap.get(siteCodeRaw) ?? null
      if (!siteId) {
        result.errors.push({ row: r.rowNumber, error: `Site code "${siteCodeRaw}" not found` })
        result.skipped++
        continue
      }
    } else if (defaultSiteId) {
      siteId = defaultSiteId
    } else {
      result.errors.push({ row: r.rowNumber, error: 'No site_code in row and no default site selected' })
      result.skipped++
      continue
    }

    const supplierCodeRaw = String(r.mappedData['supplier_code'] ?? '').trim()
    const supplierId: string | null = supplierCodeRaw ? (supplierMap.get(supplierCodeRaw) ?? null) : null
    if (supplierCodeRaw && !supplierId) missingSuppliers++

    const purchaseDate = String(r.mappedData['purchase_date'] ?? '').trim()
    const unitCost     = Number(r.mappedData['unit_cost'])
    const quantity     = Number(r.mappedData['quantity'])
    const currency     = String(r.mappedData['currency'] ?? '').toUpperCase().trim()
    const srcSystem    = String(r.mappedData['source_system'] ?? '').trim() || null
    const srcRef       = String(r.mappedData['source_reference'] ?? '').trim() || null

    if (unitCost === 0) zeroCostRecords++

    // Track date range
    if (!minDate || purchaseDate < minDate) minDate = purchaseDate
    if (!maxDate || purchaseDate > maxDate) maxDate = purchaseDate

    // Detect duplicate source references within this import
    if (srcRef) {
      const refKey = `${srcSystem ?? ''}|${srcRef}`
      if (seenRefs.has(refKey)) { duplicateRefs++ }
      else { seenRefs.add(refKey) }
    }

    importedSkuIds.add(skuId)
    importedSiteIds.add(siteId)
    if (supplierId) importedSupIds.add(supplierId)

    toInsert.push({
      organization_id:   orgId,
      site_id:           siteId,
      sku_id:            skuId,
      supplier_id:       supplierId,
      purchase_date:     purchaseDate,
      quantity,
      unit_cost:         unitCost,
      currency,
      source_system:     srcSystem,
      source_reference:  srcRef,
      import_job_id:     jobId,
      import_job_row_id: r.rowId ?? null,
      created_by:        userId,
      _rowNumber:        r.rowNumber,
    })
  }

  for (let i = 0; i < toInsert.length; i += DB_BATCH) {
    const batch = toInsert.slice(i, i + DB_BATCH)
    const insertBatch = batch.map(({ _rowNumber: _r, ...row }) => row)
    const { error } = await db.from('purchase_history').insert(insertBatch)
    if (error) {
      for (const r of batch) result.errors.push({ row: r._rowNumber as number, error: error.message })
    } else {
      result.committed += batch.length
    }
  }

  result.purchaseHistoryMetrics = {
    rowsImported:    result.committed,
    uniqueSkus:      importedSkuIds.size,
    uniqueSuppliers: importedSupIds.size,
    dateRange:       minDate && maxDate ? { min: minDate, max: maxDate } : null,
    sitesCovered:    importedSiteIds.size,
    missingSuppliers,
    zeroCostRecords,
    duplicateRefs,
  }
}

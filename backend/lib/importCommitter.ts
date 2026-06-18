import type { SupabaseServiceClient } from './supabase'
import type { ImportType } from './importTypes'
import type { RowValidationResult } from './importValidators'


export interface CommitResult {
  committed: number
  skipped: number
  errors: Array<{ row: number; error: string }>
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
      await commitBomLines(commitableRows, orgId, userId, result, client)
      break
    case 'costs':
      await commitCosts(commitableRows, orgId, userId, result, client)
      break
    case 'inventory_snapshot':
      await commitInventory(commitableRows, orgId, userId, result, client)
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
      status:          'active',
      is_regulated:    false,
      created_by:      userId,
      updated_by:      userId,
      _rowNumber:      row.rowNumber,
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
  orgId: string,
  userId: string,
  result: CommitResult,
  client: SupabaseServiceClient
): Promise<void> {
  const db = client as any
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

  const parentGroups = new Map<string, RowValidationResult[]>()
  for (const r of rows) {
    const p = String(r.mappedData['parent_sku'] ?? '').trim()
    const arr = parentGroups.get(p) ?? []
    arr.push(r)
    parentGroups.set(p, arr)
  }

  for (const [parentSku, parentRows] of parentGroups) {
    const parentId = skuMap.get(parentSku)
    if (!parentId) {
      for (const r of parentRows) {
        result.errors.push({ row: r.rowNumber, error: `Parent SKU "${parentSku}" not found in system — import it via SKU Master first` })
        result.skipped++
      }
      continue
    }

    let { data: bom } = await db.from('boms')
      .select('id')
      .eq('organization_id', orgId)
      .eq('sku_id', parentId)
      .maybeSingle()

    if (!bom) {
      const { data: newBom, error: bomErr } = await db.from('boms').insert({
        organization_id: orgId,
        sku_id:          parentId,
        created_by:      userId,
        updated_by:      userId,
      }).select('id').single()
      if (bomErr || !newBom) {
        for (const r of parentRows) result.errors.push({ row: r.rowNumber, error: `Failed to create BOM: ${bomErr?.message}` })
        continue
      }
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

    if (verErr || !version) {
      for (const r of parentRows) result.errors.push({ row: r.rowNumber, error: `Failed to create BOM version: ${verErr?.message}` })
      continue
    }

    // Bulk insert all lines for this parent
    const lineRecords = []
    for (const r of parentRows) {
      const childSku = String(r.mappedData['child_sku'] ?? '').trim()
      const childId  = skuMap.get(childSku)
      if (!childId) {
        result.errors.push({ row: r.rowNumber, error: `Child SKU "${childSku}" not found in system` })
        result.skipped++
        continue
      }
      lineRecords.push({
        organization_id: orgId,
        bom_version_id:  version.id,
        line_type:       'sku',
        sku_id:          childId,
        quantity:        Number(r.mappedData['quantity']) || 1,
        unit_of_measure: 'EA',
        created_by:      userId,
        updated_by:      userId,
        _rowNumber:      r.rowNumber,
      })
    }

    for (let i = 0; i < lineRecords.length; i += DB_BATCH) {
      const batch = lineRecords.slice(i, i + DB_BATCH)
      const insertBatch = batch.map(({ _rowNumber: _r, ...row }) => row)
      const { error } = await db.from('bom_lines').insert(insertBatch)
      if (error) {
        for (const r of batch) result.errors.push({ row: r._rowNumber, error: error.message })
      } else {
        result.committed += batch.length
      }
    }
  }
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
      organization_id: orgId,
      cost_set_id:     csId,
      item_type:       'material_price',
      scope_type:      'sku',
      scope_id:        skuId,
      scope_code:      skuNum,
      value:           Number(r.mappedData['cost']) || 0,
      value_unit:      'currency_amount',
      currency:        ccy,
      applies_to:      'per_unit',
      effective_from:  effDate,
      is_active:       true,
      created_by:      userId,
      updated_by:      userId,
      _rowNumber:      r.rowNumber,
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
      organization_id: orgId,
      snapshot_id:     snapshot.id,
      sku_id:          skuId,
      warehouse_id:    warehouseId,
      quantity:        Number(r.mappedData['quantity']) || 0,
      currency:        costSet.base_currency ?? 'USD',
      created_by:      userId,
      updated_by:      userId,
      _rowNumber:      r.rowNumber,
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

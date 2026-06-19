/**
 * BG-017: Full Import Row Traceability
 *
 * Verifies that all four new committers (sku_master, bom_lines, costs,
 * inventory_snapshot) populate import_job_row_id on every DB write, and
 * that the import-trace API returns correct provenance information.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const req = (url: string) => new NextRequest(url)

// ─── Types ────────────────────────────────────────────────────────────────────

type CapturedInsert = Record<string, unknown>[]
type CapturedUpsert = Record<string, unknown>[]

// ─── Committer helpers ───────────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}, rowId = 'row-uuid-111') {
  return {
    rowNumber:      1,
    rowId,
    status:         'valid' as const,
    errors:         [],
    warnings:       [],
    normalizations: [],
    mappedData:     {
      sku:          'SKU-001',
      description:  'Test SKU',
      parent_sku:   'PARENT-001',
      child_sku:    'SKU-001',
      quantity:     '5',
      cost_set:     'CS-MAIN',
      cost:         '12.50',
      currency:     'EUR',
      effective_date: '2026-06-19',
      warehouse:    'WH-001',
      ...overrides,
    },
  }
}

// Build a minimal DB mock that captures inserts/upserts and returns success
function buildDbMock(overrides: Record<string, unknown> = {}) {
  const captures: Record<string, CapturedInsert | CapturedUpsert> = {}

  const chain = {
    select:       vi.fn().mockReturnThis(),
    eq:           vi.fn().mockReturnThis(),
    in:           vi.fn().mockReturnThis(),
    order:        vi.fn().mockReturnThis(),
    limit:        vi.fn().mockReturnThis(),
    single:       vi.fn().mockResolvedValue({ data: overrides['single'] ?? { id: 'record-1' }, error: null }),
    maybeSingle:  vi.fn().mockResolvedValue({ data: overrides['maybeSingle'] ?? null, error: null }),
  }

  const insertCapture: CapturedInsert = []
  const upsertCapture: CapturedUpsert = []

  const db = {
    from: vi.fn().mockImplementation((table: string) => ({
      ...chain,
      select: vi.fn().mockReturnValue({
        ...chain,
        eq: vi.fn().mockReturnValue({
          ...chain,
          in: vi.fn().mockResolvedValue({ data: (overrides[table] as unknown[]) ?? [], error: null }),
          single: vi.fn().mockResolvedValue({ data: overrides['single'] ?? { id: 'record-1' }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockImplementation((rows: CapturedInsert) => {
        captures[table] = rows
        insertCapture.push(...rows)
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'record-1' }, error: null }),
          error:  null,
        }
      }),
      upsert: vi.fn().mockImplementation((rows: CapturedUpsert, _opts: unknown) => {
        captures[table] = rows
        upsertCapture.push(...rows)
        return { error: null }
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ error: null }),
      }),
    })),
    _captures: captures,
    _inserts:  insertCapture,
    _upserts:  upsertCapture,
  }
  return db
}

// ─── commitSkuMaster ─────────────────────────────────────────────────────────

describe('commitSkuMaster — import_job_row_id traceability', () => {
  it('sets import_job_row_id on upserted SKU records', async () => {
    const { commitImport } = await import('@/backend/lib/importCommitter')
    const rowId = 'ijr-sku-001'
    const db = buildDbMock({
      families:    [{ id: 'fam-1', code: 'FAM', name: 'Family A' }],
      subfamilies: [],
    })
    const rows = [makeRow({ sku: 'SKU-TEST-001', description: 'Test Part' }, rowId)]

    await commitImport('job-1', 'org-1', 'user-1', 'sku_master', rows, db as any)

    const upserted = db._upserts.find((r: any) => r.part_number === 'SKU-TEST-001')
    expect(upserted).toBeDefined()
    expect((upserted as any).import_job_row_id).toBe(rowId)
  })

  it('sets import_job_row_id to null when rowId is undefined', async () => {
    const { commitImport } = await import('@/backend/lib/importCommitter')
    const db = buildDbMock({ families: [], subfamilies: [] })
    const rowWithoutId = { ...makeRow(), rowId: undefined as unknown as string }
    await commitImport('job-1', 'org-1', 'user-1', 'sku_master', [rowWithoutId], db as any)

    const upserted = db._upserts.find((r: any) => r.part_number === 'SKU-001')
    expect(upserted).toBeDefined()
    expect((upserted as any).import_job_row_id).toBeNull()
  })

  it('does not include _rowNumber in the upsert payload', async () => {
    const { commitImport } = await import('@/backend/lib/importCommitter')
    const db = buildDbMock({ families: [], subfamilies: [] })
    await commitImport('job-1', 'org-1', 'user-1', 'sku_master', [makeRow()], db as any)

    const upserted = db._upserts[0] as any
    expect(upserted).toBeDefined()
    expect('_rowNumber' in upserted).toBe(false)
  })
})

// ─── commitBomLines ───────────────────────────────────────────────────────────

describe('commitBomLines — import_job_row_id traceability', () => {
  it('sets import_job_row_id on inserted bom_line records', async () => {
    const { commitImport } = await import('@/backend/lib/importCommitter')
    const rowId = 'ijr-bom-001'

    // Build a DB mock that returns the parent and child SKUs, and the BOM
    const skuData = [
      { id: 'sku-parent', part_number: 'PARENT-001' },
      { id: 'sku-child',  part_number: 'CHILD-001'  },
    ]

    let bomInsertCapture: Record<string, unknown>[] = []
    let bomLineInsertCapture: Record<string, unknown>[] = []

    const db = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'skus') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: skuData, error: null }),
              }),
            }),
          }
        }
        if (table === 'boms') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
            insert: vi.fn().mockImplementation((rows: any) => {
              bomInsertCapture = Array.isArray(rows) ? rows : [rows]
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: 'bom-1' }, error: null }),
              }
            }),
          }
        }
        if (table === 'bom_versions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockImplementation((rows: any) => ({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: 'bomv-1' }, error: null }),
            })),
          }
        }
        if (table === 'bom_lines') {
          return {
            insert: vi.fn().mockImplementation((rows: any) => {
              bomLineInsertCapture = Array.isArray(rows) ? rows : [rows]
              return { error: null }
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }),
    }

    const rows = [
      makeRow({ parent_sku: 'PARENT-001', child_sku: 'CHILD-001', quantity: '2' }, rowId),
    ]

    await commitImport('job-1', 'org-1', 'user-1', 'bom_lines', rows, db as any)

    expect(bomLineInsertCapture.length).toBe(1)
    expect((bomLineInsertCapture[0] as any).import_job_row_id).toBe(rowId)
    expect('_rowNumber' in bomLineInsertCapture[0]).toBe(false)
  })
})

// ─── commitCosts ─────────────────────────────────────────────────────────────

describe('commitCosts — import_job_row_id traceability', () => {
  it('sets import_job_row_id on inserted cost_item records', async () => {
    const { commitImport } = await import('@/backend/lib/importCommitter')
    const rowId = 'ijr-cost-001'

    let costInsertCapture: Record<string, unknown>[] = []

    const db = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'skus') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [{ id: 'sku-1', part_number: 'SKU-001' }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'cost_sets') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [{ id: 'cs-1', name: 'CS-MAIN' }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'cost_items') {
          return {
            insert: vi.fn().mockImplementation((rows: any) => {
              costInsertCapture = Array.isArray(rows) ? rows : [rows]
              return { error: null }
            }),
          }
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
      }),
    }

    const rows = [makeRow({ sku: 'SKU-001', cost_set: 'CS-MAIN', cost: '12.50', currency: 'EUR' }, rowId)]
    await commitImport('job-1', 'org-1', 'user-1', 'costs', rows, db as any)

    expect(costInsertCapture.length).toBe(1)
    expect((costInsertCapture[0] as any).import_job_row_id).toBe(rowId)
    expect('_rowNumber' in costInsertCapture[0]).toBe(false)
  })

  it('preserves null import_job_row_id for rows without rowId', async () => {
    const { commitImport } = await import('@/backend/lib/importCommitter')
    let costInsertCapture: Record<string, unknown>[] = []

    const db = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'skus') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [{ id: 'sku-1', part_number: 'SKU-001' }], error: null }) }) }) }
        }
        if (table === 'cost_sets') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [{ id: 'cs-1', name: 'CS-MAIN' }], error: null }) }) }) }
        }
        if (table === 'cost_items') {
          return { insert: vi.fn().mockImplementation((rows: any) => { costInsertCapture = Array.isArray(rows) ? rows : [rows]; return { error: null } }) }
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
      }),
    }

    const rowWithoutId = { ...makeRow({ sku: 'SKU-001', cost_set: 'CS-MAIN', cost: '5' }), rowId: undefined as unknown as string }
    await commitImport('job-1', 'org-1', 'user-1', 'costs', [rowWithoutId], db as any)

    expect((costInsertCapture[0] as any).import_job_row_id).toBeNull()
  })
})

// ─── commitInventory ──────────────────────────────────────────────────────────

describe('commitInventory — import_job_row_id traceability', () => {
  it('sets import_job_row_id on inserted inventory_lines records', async () => {
    const { commitImport } = await import('@/backend/lib/importCommitter')
    const rowId = 'ijr-inv-001'
    let lineInsertCapture: Record<string, unknown>[] = []

    const db = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'cost_sets') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [{ id: 'cs-1', base_currency: 'EUR' }], error: null }) }) }) }) }
        }
        if (table === 'inventory_snapshots') {
          return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'snap-1' }, error: null }) }) }
        }
        if (table === 'skus') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [{ id: 'sku-1', part_number: 'SKU-001' }], error: null }) }) }) }
        }
        if (table === 'warehouses') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'wh-1', code: 'WH-001', name: 'Main Warehouse' }], error: null }) }) }
        }
        if (table === 'inventory_lines') {
          return { insert: vi.fn().mockImplementation((rows: any) => { lineInsertCapture = Array.isArray(rows) ? rows : [rows]; return { error: null } }) }
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
      }),
    }

    const rows = [makeRow({ sku: 'SKU-001', quantity: '100', warehouse: 'WH-001' }, rowId)]
    await commitImport('job-1', 'org-1', 'user-1', 'inventory_snapshot', rows, db as any)

    expect(lineInsertCapture.length).toBe(1)
    expect((lineInsertCapture[0] as any).import_job_row_id).toBe(rowId)
    expect('_rowNumber' in lineInsertCapture[0]).toBe(false)
  })
})

// ─── Import Trace API ─────────────────────────────────────────────────────────

vi.mock('@/backend/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}))

import * as sbMod from '@/backend/lib/supabase'

function buildSbClient(overrides: { userId?: string | null; rowData?: unknown } = {}) {
  const uid = 'userId' in overrides ? overrides.userId : 'user-1'
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: uid ? { id: uid } : null }, error: null }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: overrides.rowData ?? null, error: null }),
    }),
  }
}

describe('GET /api/import-trace/[rowId]', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 401 when not authenticated', async () => {
    const client = buildSbClient({ userId: null })
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/import-trace/[rowId]/route')
    const res = await GET(
      req('http://localhost/api/import-trace/row-1'),
      { params: { rowId: 'row-1' } }
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when row does not exist', async () => {
    const client = buildSbClient({ userId: 'user-1', rowData: null })
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/import-trace/[rowId]/route')
    const res = await GET(
      req('http://localhost/api/import-trace/nonexistent'),
      { params: { rowId: 'nonexistent' } }
    )
    expect(res.status).toBe(404)
  })

  it('returns full trace info for a valid import row', async () => {
    const traceRow = {
      id:         'ijr-001',
      row_number: 42,
      status:     'valid',
      mapped_data: { sku: 'SKU-001' },
      import_jobs: {
        id:         'job-001',
        file_name:  'skus_june.csv',
        import_type: 'sku_master',
        status:     'complete',
        created_at: '2026-06-19T10:00:00Z',
        profiles:   { full_name: 'Alice Admin', email: 'alice@example.com' },
      },
    }
    const client = buildSbClient({ userId: 'user-1', rowData: traceRow })
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/import-trace/[rowId]/route')
    const res = await GET(
      req('http://localhost/api/import-trace/ijr-001'),
      { params: { rowId: 'ijr-001' } }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.import_job_row_id).toBe('ijr-001')
    expect(body.data.row_number).toBe(42)
    expect(body.data.file_name).toBe('skus_june.csv')
    expect(body.data.import_type).toBe('sku_master')
    expect(body.data.imported_by_name).toBe('Alice Admin')
    expect(body.data.imported_by_email).toBe('alice@example.com')
    expect(body.data.imported_at).toBe('2026-06-19T10:00:00Z')
  })

  it('handles job with no profile gracefully', async () => {
    const traceRow = {
      id:          'ijr-002',
      row_number:  5,
      status:      'warning',
      mapped_data: {},
      import_jobs: {
        id:          'job-002',
        file_name:   'costs.xlsx',
        import_type: 'costs',
        status:      'complete',
        created_at:  '2026-06-18T08:00:00Z',
        profiles:    null,
      },
    }
    const client = buildSbClient({ userId: 'user-1', rowData: traceRow })
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/import-trace/[rowId]/route')
    const res = await GET(
      req('http://localhost/api/import-trace/ijr-002'),
      { params: { rowId: 'ijr-002' } }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.imported_by_name).toBeNull()
    expect(body.data.imported_by_email).toBeNull()
    expect(body.data.file_name).toBe('costs.xlsx')
  })
})

// ─── Backward compatibility ───────────────────────────────────────────────────

describe('Backward compatibility — existing records with null import_job_row_id', () => {
  it('validateRows still produces valid output when import_job_row_id would be null', async () => {
    const { validateRows } = await import('@/backend/lib/importValidators')
    const rows = [{ part: 'SKU-001', desc: 'Test', uom: 'EA' }]
    const mapping = { part: 'sku', desc: 'description', uom: 'uom' }
    const results = validateRows(rows, mapping, 'sku_master')
    expect(results.length).toBe(1)
    expect(results[0].status).toBe('valid')
    // rowId comes from the DB row ID (set in chunk route), not from validation
    // so it's not set here — that's expected and fine
    expect(results[0].rowId).toBeUndefined()
  })
})

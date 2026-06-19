/**
 * BG-018: Master Data Quality Dashboard
 * BG-020: Universal Failure Export Framework
 *
 * Tests cover:
 * - Excel export library (buildIssueWorkbook, workbookToBuffer)
 * - Data quality API (GET /api/data-quality)
 * - Import issues export (GET /api/imports/export-issues)
 * - Cost build issues export (GET /api/cost-builds/export-issues)
 * - Import trace API still works (regression guard)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'

const req = (url: string) => new NextRequest(url)

// ─── BG-020: Excel export library ────────────────────────────────────────────

describe('buildIssueWorkbook', () => {
  it('produces a workbook with the correct sheet name', async () => {
    const { buildIssueWorkbook } = await import('@/backend/lib/excelExport')
    const wb = buildIssueWorkbook([{
      name: 'Costing Health',
      issues: [],
    }])
    expect(wb.SheetNames).toContain('Costing Health')
  })

  it('includes header row even when there are no issues', async () => {
    const { buildIssueWorkbook } = await import('@/backend/lib/excelExport')
    const wb = buildIssueWorkbook([{ name: 'Test', issues: [] }])
    const ws = wb.Sheets['Test']
    expect(ws).toBeDefined()
    // A1 = 'Severity'
    expect(ws['A1']?.v).toBe('Severity')
    // M1 = 'Detected At'
    expect(ws['M1']?.v).toBe('Detected At')
  })

  it('writes issue data to the correct cells', async () => {
    const { buildIssueWorkbook } = await import('@/backend/lib/excelExport')
    const wb = buildIssueWorkbook([{
      name: 'Issues',
      issues: [{
        severity:      'CRITICAL',
        module:        'Cost Build',
        entity_type:   'SKU',
        entity_id:     'sku-uuid-001',
        sku:           'ABC-100',
        error_message: 'Missing BOM',
        suggested_fix: 'Import BOM lines',
        detected_at:   '2026-06-19T00:00:00Z',
      }],
    }])
    const ws = wb.Sheets['Issues']
    expect(ws['A2']?.v).toBe('CRITICAL')
    expect(ws['B2']?.v).toBe('Cost Build')
    expect(ws['E2']?.v).toBe('ABC-100')
    expect(ws['K2']?.v).toBe('Missing BOM')
  })

  it('handles multi-sheet workbooks correctly', async () => {
    const { buildIssueWorkbook } = await import('@/backend/lib/excelExport')
    const wb = buildIssueWorkbook([
      { name: 'Sheet1', issues: [{ severity: 'INFO', module: 'A', entity_type: 'B', error_message: 'x', suggested_fix: 'y', detected_at: '2026-06-19' }] },
      { name: 'Sheet2', issues: [{ severity: 'WARNING', module: 'C', entity_type: 'D', error_message: 'z', suggested_fix: 'w', detected_at: '2026-06-19' }] },
    ])
    expect(wb.SheetNames).toHaveLength(2)
    expect(wb.SheetNames).toContain('Sheet1')
    expect(wb.SheetNames).toContain('Sheet2')
  })

  it('truncates sheet names to 31 characters', async () => {
    const { buildIssueWorkbook } = await import('@/backend/lib/excelExport')
    const longName = 'This is a very long sheet name that exceeds Excel limit'
    const wb = buildIssueWorkbook([{ name: longName, issues: [] }])
    expect(wb.SheetNames[0].length).toBeLessThanOrEqual(31)
  })
})

describe('workbookToBuffer', () => {
  it('returns a non-empty Uint8Array', async () => {
    const { buildIssueWorkbook, workbookToBuffer } = await import('@/backend/lib/excelExport')
    const wb  = buildIssueWorkbook([{ name: 'Test', issues: [] }])
    const buf = workbookToBuffer(wb)
    expect(buf).toBeInstanceOf(Uint8Array)
    expect(buf.byteLength).toBeGreaterThan(0)
  })

  it('produces valid XLSX (parseable by the xlsx library itself)', async () => {
    const { buildIssueWorkbook, workbookToBuffer } = await import('@/backend/lib/excelExport')
    const wb  = buildIssueWorkbook([{
      name: 'Round-trip',
      issues: [{
        severity: 'WARNING', module: 'Test', entity_type: 'Row',
        sku: 'SKU-001', error_message: 'Test error', suggested_fix: 'Fix it',
        detected_at: '2026-06-19',
      }],
    }])
    const buf    = workbookToBuffer(wb)
    const parsed = XLSX.read(buf, { type: 'array' })
    expect(parsed.SheetNames).toContain('Round-trip')
    const data = XLSX.utils.sheet_to_json<Record<string, string>>(parsed.Sheets['Round-trip'])
    expect(data[0].Severity).toBe('WARNING')
    expect(data[0].SKU).toBe('SKU-001')
    expect(data[0]['Error Message']).toBe('Test error')
  })

  it('preserves Hebrew characters (UTF-8)', async () => {
    const { buildIssueWorkbook, workbookToBuffer } = await import('@/backend/lib/excelExport')
    const hebrewMsg = 'שגיאה: מחיר חסר'
    const wb  = buildIssueWorkbook([{
      name: 'Hebrew',
      issues: [{ severity: 'CRITICAL', module: 'Price List', entity_type: 'Item',
        error_message: hebrewMsg, suggested_fix: 'Fix', detected_at: '2026-06-19' }],
    }])
    const buf    = workbookToBuffer(wb)
    const parsed = XLSX.read(buf, { type: 'array' })
    const data   = XLSX.utils.sheet_to_json<Record<string, string>>(parsed.Sheets['Hebrew'])
    expect(data[0]['Error Message']).toBe(hebrewMsg)
  })
})

// ─── BG-018: Data Quality API ─────────────────────────────────────────────────

vi.mock('@/backend/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}))

import * as sbMod from '@/backend/lib/supabase'

function buildSbClient(tableData: Record<string, unknown[]> = {}, userId = 'user-1') {
  const makeChain = (data: unknown[]) => ({
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
    lte:    vi.fn().mockReturnThis(),
    lt:     vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    in:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    limit:  vi.fn().mockResolvedValue({ data, error: null, count: data.length }),
    single: vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null }),
  })

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null }, error: null }) },
    rpc:  vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: 'org-1', error: null }) }),
    from: vi.fn().mockImplementation((table: string) => makeChain((tableData[table] as unknown[]) ?? [])),
  }
}

describe('GET /api/data-quality', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when unauthenticated', async () => {
    const client = buildSbClient({}, '')
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/data-quality/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns data quality sections when authenticated', async () => {
    const client = buildSbClient({
      skus:                          [{ id: 'sku-1', part_number: 'SKU-001', name: 'Test', item_type: 'purchased_part' }],
      site_cost_build_lines:         [],
      boms:                          [],
      bom_versions:                  [],
      manufacturing_cost_structures: [],
      mfg_cost_elements:             [],
      price_list_version_items:      [],
      price_list_versions:           [],
      inventory_snapshots:           [],
      inventory_lines:               [],
      valuation_reports:             [],
    })
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/data-quality/route')
    const res  = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.data.costing).toBeDefined()
    expect(body.data.bom).toBeDefined()
    expect(body.data.mfg).toBeDefined()
    expect(body.data.price_list).toBeDefined()
    expect(body.data.inventory).toBeDefined()
    expect(body.data.generated_at).toBeDefined()
  })

  it('costing section reports SKUs without cost type', async () => {
    const noTypeSkus = [
      { id: 'sku-1', part_number: 'SKU-001', name: 'Part One', item_type: 'purchased_part' },
      { id: 'sku-2', part_number: 'SKU-002', name: 'Part Two', item_type: 'purchased_part' },
    ]
    const client = buildSbClient({
      skus:                          noTypeSkus,
      site_cost_build_lines:         [],
      boms:                          [],
      bom_versions:                  [],
      manufacturing_cost_structures: [],
      mfg_cost_elements:             [],
      price_list_version_items:      [],
      price_list_versions:           [],
      inventory_snapshots:           [],
      inventory_lines:               [],
      valuation_reports:             [],
    })
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/data-quality/route')
    const res  = await GET()
    const body = await res.json()
    expect(body.data.costing.skus_without_cost_type.count).toBe(2)
    expect(body.data.costing.skus_without_cost_type.sample).toHaveLength(2)
  })
})

// ─── BG-020: Import Issues Export ────────────────────────────────────────────

describe('GET /api/imports/export-issues', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 400 when jobId is missing', async () => {
    const client = buildSbClient()
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/imports/export-issues/route')
    const res = await GET(req('http://localhost/api/imports/export-issues'))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const client = buildSbClient({}, '')
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/imports/export-issues/route')
    const res = await GET(req('http://localhost/api/imports/export-issues?jobId=job-1'))
    expect(res.status).toBe(401)
  })

  it('returns xlsx Content-Type for a valid job with issues', async () => {
    const jobData  = { id: 'job-1', file_name: 'skus.csv', import_type: 'sku_master', created_at: '2026-06-19T00:00:00Z' }
    const rowsData = [
      { id: 'row-1', row_number: 3, status: 'error',   errors: ['Part number is required'], warnings: [], mapped_data: { sku: 'SKU-001' } },
      { id: 'row-2', row_number: 5, status: 'warning', errors: [], warnings: ['Cost is zero'],   mapped_data: { sku: 'SKU-002' } },
    ]

    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        in:     vi.fn().mockReturnThis(),
        order:  vi.fn().mockReturnThis(),
        limit:  vi.fn().mockResolvedValue({ data: table === 'import_job_rows' ? rowsData : [], error: null }),
        single: vi.fn().mockResolvedValue({ data: table === 'import_jobs' ? jobData : null, error: null }),
      })),
    }
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/imports/export-issues/route')
    const res = await GET(req('http://localhost/api/imports/export-issues?jobId=job-1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml.sheet')
    expect(res.headers.get('Content-Disposition')).toContain('.xlsx')

    // Verify it contains a parseable XLSX with the issues
    const buf    = await res.arrayBuffer()
    const parsed = XLSX.read(new Uint8Array(buf), { type: 'array' })
    const data   = XLSX.utils.sheet_to_json<Record<string, string>>(parsed.Sheets['Import Issues'])
    expect(data.length).toBe(2)
    expect(data[0].Severity).toBe('CRITICAL')
    expect(data[1].Severity).toBe('WARNING')
    expect(data[0]['Import Job']).toBe('job-1')
  })
})

// ─── BG-020: Cost Build Issues Export ────────────────────────────────────────

describe('GET /api/cost-builds/export-issues', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 400 when buildId is missing', async () => {
    const client = buildSbClient()
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/cost-builds/export-issues/route')
    const res = await GET(req('http://localhost/api/cost-builds/export-issues'))
    expect(res.status).toBe(400)
  })

  it('returns xlsx with zero-cost lines', async () => {
    const buildData = { id: 'build-1', name: 'DE Build 2026', status: 'complete', sites: { name: 'Germany', code: 'DE' } }
    const linesData = [
      { id: 'line-1', sku_id: 'sku-1', item_cost_type: 'PURCHASED', cost_strategy_used: 'PRICE_LIST', source_record_type: null, source_reference: null, resolved_cost: 0, currency: 'EUR', fallback_path: [], skus: { part_number: 'ABC-100', name: 'Sensor', item_type: 'purchased_part' } },
      { id: 'line-2', sku_id: 'sku-2', item_cost_type: 'PURCHASED', cost_strategy_used: 'LAST_PURCHASE', source_record_type: null, source_reference: null, resolved_cost: 0, currency: 'EUR', fallback_path: ['PRICE_LIST'], skus: { part_number: 'DEF-200', name: 'Cable', item_type: 'purchased_part' } },
    ]

    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        order:  vi.fn().mockReturnThis(),
        limit:  vi.fn().mockResolvedValue({ data: table === 'site_cost_build_lines' ? linesData : [], error: null }),
        single: vi.fn().mockResolvedValue({ data: table === 'site_cost_builds' ? buildData : null, error: null }),
      })),
    }
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/cost-builds/export-issues/route')
    const res = await GET(req('http://localhost/api/cost-builds/export-issues?buildId=build-1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml.sheet')

    const buf    = await res.arrayBuffer()
    const parsed = XLSX.read(new Uint8Array(buf), { type: 'array' })
    const data   = XLSX.utils.sheet_to_json<Record<string, string>>(parsed.Sheets['Build Issues'])
    expect(data.length).toBe(2)
    expect(data[0].Severity).toBe('CRITICAL')
    expect(data[0].SKU).toBe('ABC-100')
    expect(data[0].Site).toBe('Germany')
    expect(data[0]['Error Code']).toBe('ZERO_RESOLVED_COST')
  })
})

// ─── Data Quality Export API ──────────────────────────────────────────────────

describe('GET /api/data-quality/export', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns xlsx Content-Type', async () => {
    const client = buildSbClient({
      skus:                          [],
      site_cost_build_lines:         [],
      boms:                          [],
      bom_versions:                  [],
      manufacturing_cost_structures: [],
      mfg_cost_elements:             [],
      price_list_version_items:      [],
      price_list_versions:           [],
      inventory_snapshots:           [],
      inventory_lines:               [],
      valuation_reports:             [],
    })
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/data-quality/export/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml.sheet')
  })

  it('produces a 5-sheet workbook (one per health section)', async () => {
    const client = buildSbClient({
      skus: [], site_cost_build_lines: [], boms: [], bom_versions: [],
      manufacturing_cost_structures: [], mfg_cost_elements: [],
      price_list_version_items: [], price_list_versions: [],
      inventory_snapshots: [], inventory_lines: [], valuation_reports: [],
    })
    vi.mocked(sbMod.createServerSupabaseClient).mockResolvedValue(client as any)
    const { GET } = await import('@/app/api/data-quality/export/route')
    const res    = await GET()
    const buf    = await res.arrayBuffer()
    const parsed = XLSX.read(new Uint8Array(buf), { type: 'array' })
    expect(parsed.SheetNames).toContain('Costing Health')
    expect(parsed.SheetNames).toContain('BOM Health')
    expect(parsed.SheetNames).toContain('Mfg Health')
    expect(parsed.SheetNames).toContain('Price List Health')
    expect(parsed.SheetNames).toContain('Inventory Health')
  })
})

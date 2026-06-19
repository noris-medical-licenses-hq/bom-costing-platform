/**
 * Universal Failure Export Framework — BG-020
 *
 * Shared Excel generation for every module that produces errors, warnings,
 * or rejected records. One function builds a workbook; another serialises it
 * to a Buffer suitable for streaming from an API route.
 *
 * UTF-8 / Hebrew: xlsx 0.18+ writes UTF-8 strings into the XML payload
 * so all Unicode code points (including Hebrew) survive round-trips.
 */
import * as XLSX from 'xlsx'

// ─── Standard issue row ───────────────────────────────────────────────────────

export type IssueSeverity = 'CRITICAL' | 'WARNING' | 'INFO'

export interface IssueRow {
  severity:        IssueSeverity
  module:          string           // e.g. 'Cost Build', 'Import', 'Price List'
  entity_type:     string           // e.g. 'SKU', 'BOM Line', 'Inventory Line'
  entity_id?:      string
  sku?:            string
  site?:           string
  country?:        string
  import_job?:     string
  import_row?:     string
  error_code?:     string
  error_message:   string
  suggested_fix:   string
  detected_at:     string           // ISO timestamp or date string
}

// ─── Column header order ──────────────────────────────────────────────────────

const HEADERS: (keyof IssueRow)[] = [
  'severity',
  'module',
  'entity_type',
  'entity_id',
  'sku',
  'site',
  'country',
  'import_job',
  'import_row',
  'error_code',
  'error_message',
  'suggested_fix',
  'detected_at',
]

const HEADER_LABELS: Record<keyof IssueRow, string> = {
  severity:      'Severity',
  module:        'Module',
  entity_type:   'Entity Type',
  entity_id:     'Entity ID',
  sku:           'SKU',
  site:          'Site',
  country:       'Country',
  import_job:    'Import Job',
  import_row:    'Import Row',
  error_code:    'Error Code',
  error_message: 'Error Message',
  suggested_fix: 'Suggested Fix',
  detected_at:   'Detected At',
}

// ─── Build a single-sheet workbook ───────────────────────────────────────────

export function buildIssueSheet(issues: IssueRow[]): XLSX.WorkSheet {
  const headerRow = HEADERS.map(k => HEADER_LABELS[k])
  const dataRows  = issues.map(issue =>
    HEADERS.map(k => (issue[k] as string | undefined) ?? '')
  )
  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])

  // Column widths for readability
  ws['!cols'] = [
    { wch: 10 }, // Severity
    { wch: 16 }, // Module
    { wch: 16 }, // Entity Type
    { wch: 36 }, // Entity ID
    { wch: 20 }, // SKU
    { wch: 14 }, // Site
    { wch: 10 }, // Country
    { wch: 36 }, // Import Job
    { wch: 36 }, // Import Row
    { wch: 18 }, // Error Code
    { wch: 50 }, // Error Message
    { wch: 40 }, // Suggested Fix
    { wch: 24 }, // Detected At
  ]
  return ws
}

// ─── Multi-sheet workbook ─────────────────────────────────────────────────────

export interface WorkbookSheet {
  name:   string
  issues: IssueRow[]
}

export function buildIssueWorkbook(sheets: WorkbookSheet[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const { name, issues } of sheets) {
    XLSX.utils.book_append_sheet(wb, buildIssueSheet(issues), name.slice(0, 31))
  }
  return wb
}

// ─── Serialise workbook to Buffer ─────────────────────────────────────────────

export function workbookToBuffer(wb: XLSX.WorkBook): Uint8Array {
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array
}

// ─── HTTP response helpers ────────────────────────────────────────────────────

export function excelResponse(buf: Uint8Array, filename: string): Response {
  // Cast needed: Next.js Edge types for BodyInit are narrower than Node types
  return new Response(buf as unknown as BodyInit, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      'Cache-Control':       'no-store',
    },
  })
}

// ─── Convenience: build + respond in one call ─────────────────────────────────

export function issueExcelResponse(
  sheets: WorkbookSheet[],
  filename: string
): Response {
  const wb  = buildIssueWorkbook(sheets)
  const buf = workbookToBuffer(wb)
  return excelResponse(buf as Uint8Array, filename)
}

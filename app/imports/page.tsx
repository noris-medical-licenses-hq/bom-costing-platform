'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { FieldDef } from '@/app/api/import-fields/route'

// ─── Design tokens ────────────────────────────────────────────────────────────
const D = {
  red:        '#C62839',
  dark:       '#222222',
  secondary:  '#666666',
  bg:         '#F8F9FA',
  card:       '#FFFFFF',
  border:     '#E5E7EB',
  success:    '#16a34a',
  warning:    '#d97706',
  error:      '#dc2626',
  redLight:   '#FEF2F2',
}

const CHUNK_SIZE = 1000
const IGNORE     = '__ignore__'

const COUNTRIES = [
  { code: 'AT', name: 'Austria' }, { code: 'AU', name: 'Australia' }, { code: 'BE', name: 'Belgium' },
  { code: 'BR', name: 'Brazil' },  { code: 'CA', name: 'Canada' },   { code: 'CH', name: 'Switzerland' },
  { code: 'CL', name: 'Chile' },   { code: 'CN', name: 'China' },    { code: 'CZ', name: 'Czech Republic' },
  { code: 'DE', name: 'Germany' }, { code: 'DK', name: 'Denmark' },  { code: 'EG', name: 'Egypt' },
  { code: 'ES', name: 'Spain' },   { code: 'FI', name: 'Finland' },  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'GR', name: 'Greece' }, { code: 'HU', name: 'Hungary' },
  { code: 'IE', name: 'Ireland' }, { code: 'IL', name: 'Israel' },   { code: 'IN', name: 'India' },
  { code: 'IT', name: 'Italy' },   { code: 'JP', name: 'Japan' },    { code: 'KR', name: 'South Korea' },
  { code: 'MX', name: 'Mexico' },  { code: 'NL', name: 'Netherlands' }, { code: 'NO', name: 'Norway' },
  { code: 'NZ', name: 'New Zealand' }, { code: 'PL', name: 'Poland' }, { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' }, { code: 'SA', name: 'Saudi Arabia' }, { code: 'SE', name: 'Sweden' },
  { code: 'SG', name: 'Singapore' }, { code: 'SK', name: 'Slovakia' }, { code: 'TR', name: 'Turkey' },
  { code: 'UA', name: 'Ukraine' }, { code: 'US', name: 'United States' }, { code: 'ZA', name: 'South Africa' },
  { code: 'AE', name: 'UAE' },     { code: 'AR', name: 'Argentina' }, { code: 'TH', name: 'Thailand' },
]

// ─── Import type definitions ──────────────────────────────────────────────────

interface ImportTypeSummary {
  type:          string
  label:         string
  description:   string
  allOrNothing?: boolean
}

const IMPORT_TYPES: ImportTypeSummary[] = [
  { type: 'sku_master',           label: 'SKU Master',          description: 'Part numbers, descriptions, families, identifiers, planning and cost fields.' },
  { type: 'bom_lines',            label: 'BOM Lines',           description: 'Parent-child component relationships. All-or-nothing commit.', allOrNothing: true },
  { type: 'costs',                label: 'Costs',               description: 'Material costs with currency, cost set, breakdown fields. All-or-nothing.', allOrNothing: true },
  { type: 'inventory_snapshot',   label: 'Inventory Snapshot',  description: 'On-hand quantities with warehouse, bin, lot, traceability and dates.' },
  { type: 'price_list',           label: 'Price List',          description: 'Standard price list (supports auto-detection of name, country, currency from header rows). Creates a Cost Set.' },
  { type: 'purchase_history',     label: 'Purchase History',    description: 'ERP purchase records for LAST_PURCHASE and AVERAGE_PURCHASE costing strategies. Include site_code or select a default site.' },
  { type: 'supplier_prices',      label: 'Supplier Prices',     description: 'Quoted / contracted prices per SKU per supplier.' },
]

const ALL_OR_NOTHING = new Set(['bom_lines', 'costs'])

type Step = 'type' | 'upload' | 'mapping' | 'validation' | 'done'

interface UploadProgress {
  totalRows: number; processedRows: number; validRows: number
  warningRows: number; errorRows: number
  sampleErrors: Array<{ row: number; errors: string[] }>; aborted: boolean
}

interface ValidationSummary {
  jobId: string; totalRows: number; validRows: number
  warningRows: number; errorRows: number
  sampleErrors: Array<{ row: number; errors: string[] }>
}

interface PriceListQualityMetrics {
  totalRows: number; importedRows: number; rejectedRows: number
  duplicateSkus: number; missingSkus: number; missingPrices: number; currencyMismatches: number
  priceListVersionId: string; priceListName: string; countryCode: string
  versionNumber: number; effectiveDate: string
}

interface PurchaseHistoryQualityMetrics {
  rowsImported:    number
  uniqueSkus:      number
  uniqueSuppliers: number
  dateRange:       { min: string; max: string } | null
  sitesCovered:    number
  missingSuppliers: number
  zeroCostRecords: number
  duplicateRefs:   number
}

interface CommitSummary {
  committed: number; skipped: number; errors: Array<{ row: number; error: string }>
  qualityMetrics?:         PriceListQualityMetrics | null
  purchaseHistoryMetrics?: PurchaseHistoryQualityMetrics | null
}

// ─── Field catalog helpers ────────────────────────────────────────────────────

const CAT_ORDER = [
  'core','structure','warehouse','financial','classification','identifiers','planning',
  'engineering','manufacturing','traceability','dates','stock','ownership',
  'cost_breakdown','source','supplier','commercial','terms','performance',
  'references','production','execution','custom',
]
const CAT_LABEL: Record<string, string> = {
  core: 'Core', structure: 'Structure', warehouse: 'Warehouse', financial: 'Financial',
  classification: 'Classification', identifiers: 'Identifiers', planning: 'Planning',
  engineering: 'Engineering', manufacturing: 'Manufacturing', traceability: 'Traceability',
  dates: 'Dates', stock: 'Stock', ownership: 'Ownership', cost_breakdown: 'Cost Breakdown',
  source: 'Source', supplier: 'Supplier', commercial: 'Commercial', terms: 'Terms',
  performance: 'Performance', references: 'References', production: 'Production',
  execution: 'Execution', custom: 'Custom',
}

// Categories hidden until "Show Advanced" is enabled
const ADVANCED_CATS = new Set([
  'identifiers','planning','engineering','manufacturing','traceability',
  'dates','stock','ownership','cost_breakdown','references','production','execution','performance',
])

function filterFields(fields: FieldDef[], search: string, showAdvanced: boolean): FieldDef[] {
  const q = search.trim().toLowerCase()
  return fields.filter(f => {
    if (f.is_deprecated) return false
    if (!showAdvanced && ADVANCED_CATS.has(f.field_category) && !f.required_by_default) return false
    if (!q) return true
    return (
      f.display_name.toLowerCase().includes(q) ||
      f.field_key.toLowerCase().includes(q) ||
      f.synonyms.some(s => s.toLowerCase().includes(q))
    )
  })
}

function groupByCategory(fields: FieldDef[]) {
  const map = new Map<string, FieldDef[]>()
  for (const f of fields) {
    const arr = map.get(f.field_category) ?? []
    arr.push(f)
    map.set(f.field_category, arr)
  }
  return CAT_ORDER
    .filter(c => map.has(c))
    .map(c => ({ cat: c, label: CAT_LABEL[c] ?? c, fields: map.get(c)! }))
}

// ─── Standard price list format detection ────────────────────────────────────
// Rows 1-2 contain metadata, row 3 = headers, row 4+ = data.

export interface DetectedPriceList {
  priceListName: string; targetCountry: string; currency: string; effectiveDate?: string
}

function detectPriceListFormat(rawRows: unknown[][]): {
  isStandardFormat: boolean; priceListName?: string; targetCountry?: string; currency?: string
} {
  if (rawRows.length < 3) return { isStandardFormat: false }
  const r0 = rawRows[0] as unknown[]
  const r1 = rawRows[1] as unknown[]
  const cell00 = String(r0[0] ?? '').toLowerCase()
  if (!cell00.includes('price list') && !cell00.includes('מחירון') && !cell00.includes('תיאור מחיר')) {
    return { isStandardFormat: false }
  }
  const priceListName = String(r0[1] ?? '').trim() || String(r0[0] ?? '').trim()
  let targetCountry = ''
  let currency = ''
  for (let i = 0; i < r1.length - 1; i++) {
    const key = String(r1[i] ?? '').toLowerCase()
    const val = String(r1[i + 1] ?? '').trim()
    if (key.includes('country') || key.includes('מדינ') || key.includes('יעד')) { targetCountry = val; i++ }
    else if (key.includes('currency') || key.includes('מטבע')) { currency = val; i++ }
  }
  return { isStandardFormat: true, priceListName, targetCountry, currency }
}

// ─── Parse file (xlsx/csv → headers + rows) ───────────────────────────────────

interface ParseResult {
  headers: string[]; rows: Record<string, string>[]; detectedPriceList?: DetectedPriceList
}

async function parseFile(file: File): Promise<ParseResult> {
  const XLSX = await import('xlsx')
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws   = wb.Sheets[wb.SheetNames[0]]

  // Always read raw array-of-arrays first for format detection
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  const detected = detectPriceListFormat(rawRows)

  if (detected.isStandardFormat && rawRows.length >= 3) {
    const headerRow = (rawRows[2] as unknown[]).map(c => String(c ?? '').trim()).filter(Boolean)
    // Parse data starting from row index 3 (rows 4+ in 1-based)
    const dataRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      header: headerRow,
      range:  3,
      defval: '',
    })
    const rows = dataRows.map(r =>
      Object.fromEntries(
        headerRow.map(h => [h, r[h] instanceof Date ? (r[h] as Date).toISOString().slice(0, 10) : String(r[h] ?? '')])
      )
    )
    return {
      headers: headerRow,
      rows,
      detectedPriceList: {
        priceListName: detected.priceListName ?? '',
        targetCountry: detected.targetCountry ?? '',
        currency:      detected.currency ?? '',
      },
    }
  }

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  if (!raw.length) return { headers: [], rows: [] }
  const headers = Object.keys(raw[0])
  const rows = raw.map(r =>
    Object.fromEntries(
      headers.map(h => [h, r[h] instanceof Date ? (r[h] as Date).toISOString().slice(0, 10) : String(r[h] ?? '')])
    )
  )
  return { headers, rows }
}

function fmtNum(n: number) { return n.toLocaleString('en-US') }

// ─── Shared components ────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '24px', ...style }}>
      {children}
    </div>
  )
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'type',       label: '1. Type'    },
    { key: 'upload',     label: '2. Upload'  },
    { key: 'mapping',    label: '3. Mapping' },
    { key: 'validation', label: '4. Validate'},
    { key: 'done',       label: '5. Done'    },
  ]
  const idx = steps.findIndex(s => s.key === step)
  return (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '28px' }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{
            padding: '4px 14px', borderRadius: '20px', fontSize: '13px',
            fontWeight: i <= idx ? 600 : 400,
            background: i < idx ? D.success : i === idx ? D.red : D.border,
            color: i <= idx ? '#fff' : D.secondary,
          }}>
            {i < idx ? '✓ ' : ''}{s.label}
          </div>
          {i < steps.length - 1 && <div style={{ width: '20px', height: '1px', background: D.border }} />}
        </div>
      ))}
    </div>
  )
}

function ProgressBar({ progress }: { progress: UploadProgress }) {
  const pct = progress.totalRows > 0 ? Math.round((progress.processedRows / progress.totalRows) * 100) : 0
  return (
    <div>
      <div style={{ background: D.border, borderRadius: '99px', height: '10px', overflow: 'hidden', marginBottom: '12px' }}>
        <div style={{ height: '100%', borderRadius: '99px', background: progress.errorRows > 0 ? D.error : D.red, width: `${pct}%`, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '12px' }}>
        {[
          { label: 'Total',     value: fmtNum(progress.totalRows),     color: D.dark    },
          { label: 'Processed', value: fmtNum(progress.processedRows), color: D.dark    },
          { label: 'Valid',     value: fmtNum(progress.validRows),     color: D.success },
          { label: 'Warnings',  value: fmtNum(progress.warningRows),   color: D.warning },
          { label: 'Errors',    value: fmtNum(progress.errorRows),     color: progress.errorRows > 0 ? D.error : D.secondary },
        ].map(s => (
          <div key={s.label} style={{ background: D.bg, borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: D.secondary }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '13px', color: D.secondary, textAlign: 'center' }}>
        {pct}% · {fmtNum(progress.processedRows)} of {fmtNum(progress.totalRows)} rows
      </div>
    </div>
  )
}

// ─── FieldSelector ────────────────────────────────────────────────────────────

interface FieldSelectorProps {
  value:       string
  fields:      FieldDef[]
  onChange:    (key: string) => void
  onAddCustom: () => void
}

function FieldSelector({ value, fields, onChange, onAddCustom }: FieldSelectorProps) {
  const [open,         setOpen]         = useState(false)
  const [search,       setSearch]       = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef    = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30)
  }, [open])

  const selected = fields.find(f => f.field_key === value)
  const filtered = filterFields(fields, search, showAdvanced)
  const groups   = groupByCategory(filtered)

  function select(key: string) { onChange(key); setOpen(false); setSearch('') }

  const label       = value === IGNORE || !value ? '— Ignore this column —' : (selected?.display_name ?? value)
  const labelColor  = value && value !== IGNORE ? D.dark : D.secondary
  const borderColor = value && value !== IGNORE ? D.red : D.border

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', padding: '6px 10px', border: `1px solid ${borderColor}`, borderRadius: '4px', background: D.card, color: labelColor, cursor: 'pointer', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selected?.is_deprecated
            ? <span style={{ color: D.warning }} title={`Deprecated — use ${selected.replacement_field_key ?? 'a newer field'}`}>⚠ {label}</span>
            : label
          }
        </span>
        <span style={{ marginLeft: '8px', color: D.secondary, fontSize: '10px' }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: D.card, border: `1px solid ${D.border}`, borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: '2px', maxHeight: '360px', display: 'flex', flexDirection: 'column' }}>
          {/* Search bar */}
          <div style={{ padding: '8px', borderBottom: `1px solid ${D.border}`, display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, key or synonym…"
              style={{ flex: 1, padding: '5px 8px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '12px', outline: 'none', background: D.bg }}
            />
            <button
              onClick={() => setShowAdvanced(a => !a)}
              style={{ fontSize: '11px', padding: '4px 8px', border: `1px solid ${showAdvanced ? D.red : D.border}`, borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap', background: showAdvanced ? D.redLight : D.card, color: showAdvanced ? D.red : D.secondary }}
            >
              {showAdvanced ? 'Less' : 'Advanced'}
            </button>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Ignore option */}
            <button
              onClick={() => select(IGNORE)}
              style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: value === IGNORE ? '#F0F9FF' : D.card, color: D.secondary, fontSize: '13px', cursor: 'pointer', borderBottom: `1px solid ${D.border}` }}
            >
              — Ignore this column —
            </button>

            {groups.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: D.secondary }}>
                No fields match &quot;{search}&quot;
              </div>
            )}

            {groups.map(group => (
              <div key={group.cat}>
                <div style={{ padding: '4px 12px 2px', fontSize: '10px', fontWeight: 700, color: D.secondary, background: D.bg, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {group.label}
                </div>
                {group.fields.map(f => (
                  <button
                    key={f.field_key}
                    onClick={() => select(f.field_key)}
                    title={f.description ?? f.display_name}
                    style={{ width: '100%', textAlign: 'left', padding: '6px 12px 6px 20px', border: 'none', borderBottom: `1px solid ${D.border}`, background: value === f.field_key ? '#FFF5F5' : D.card, cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F9FAFB' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = value === f.field_key ? '#FFF5F5' : D.card }}
                  >
                    {f.required_by_default && <span style={{ color: D.error, fontWeight: 700, fontSize: '10px', minWidth: '8px' }}>✱</span>}
                    <span style={{ flex: 1, color: D.dark, fontWeight: value === f.field_key ? 600 : 400 }}>{f.display_name}</span>
                    <span style={{ fontSize: '10px', fontFamily: 'monospace', color: D.secondary }}>{f.field_key}</span>
                  </button>
                ))}
              </div>
            ))}

            {/* Add custom field */}
            <button
              onClick={() => { setOpen(false); onAddCustom() }}
              style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: D.bg, cursor: 'pointer', fontSize: '13px', color: D.red, fontWeight: 600, borderTop: `1px solid ${D.border}` }}
            >
              + Add custom field
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Custom Field Modal ───────────────────────────────────────────────────────

interface CustomFieldModalProps {
  importType: string
  onClose:    () => void
  onCreated:  (field: FieldDef) => void
}

function CustomFieldModal({ importType, onClose, onCreated }: CustomFieldModalProps) {
  const [displayName, setDisplayName] = useState('')
  const [fieldKey,    setFieldKey]    = useState('')
  const [dataType,    setDataType]    = useState('text')
  const [category,    setCategory]    = useState('custom')
  const [description, setDescription] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  function toSnake(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') }

  function handleNameChange(v: string) { setDisplayName(v); setFieldKey(toSnake(v)) }

  async function handleSubmit() {
    if (!displayName.trim() || !fieldKey) { setError('Display name is required'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/import-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importType, fieldKey, displayName: displayName.trim(), description: description.trim() || undefined, dataType, fieldCategory: category }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create field'); setSaving(false); return }
      onCreated({ field_key: fieldKey, display_name: displayName.trim(), description: description.trim() || null, data_type: dataType, field_category: category, required_by_default: false, is_system: false, is_deprecated: false, replacement_field_key: null, sort_order: 999, synonyms: [] })
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: D.card, borderRadius: '8px', padding: '28px', width: '440px', maxWidth: '94vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: D.dark, marginBottom: '20px' }}>Add Custom Field</div>
        {error && <div style={{ background: D.redLight, border: `1px solid ${D.error}`, borderRadius: '4px', padding: '8px 12px', fontSize: '13px', color: D.error, marginBottom: '16px' }}>{error}</div>}

        {[
          { label: 'Display Name *', node: <input value={displayName} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Internal Reference" style={iStyle} /> },
          { label: 'Field Key *',    node: <input value={fieldKey}    onChange={e => setFieldKey(toSnake(e.target.value))} placeholder="auto-generated" style={{ ...iStyle, fontFamily: 'monospace' }} /> },
          { label: 'Data Type',      node:
            <select value={dataType} onChange={e => setDataType(e.target.value)} style={iStyle}>
              {['text','integer','decimal','date','boolean','percent','currency'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          },
          { label: 'Category',       node: <input value={category}    onChange={e => setCategory(e.target.value)} placeholder="custom" style={iStyle} /> },
          { label: 'Description',    node: <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional tooltip shown in mapping UI" style={iStyle} /> },
        ].map(row => (
          <div key={row.label} style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '4px' }}>{row.label}</label>
            {row.node}
          </div>
        ))}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', border: `1px solid ${D.border}`, borderRadius: '4px', cursor: 'pointer', background: D.card, fontSize: '13px', color: D.dark }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 18px', background: D.red, color: '#fff', border: 'none', borderRadius: '4px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Creating…' : 'Create Field'}
          </button>
        </div>
      </div>
    </div>
  )
}

const iStyle: React.CSSProperties = { width: '100%', padding: '8px', border: `1px solid #E5E7EB`, borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportsPage() {
  const [step,            setStep]            = useState<Step>('type')
  const [importType,      setImportType]      = useState<ImportTypeSummary | null>(null)
  const [fileName,        setFileName]        = useState('')
  const [headers,         setHeaders]         = useState<string[]>([])
  const [rows,            setRows]            = useState<Record<string, string>[]>([])
  const [mapping,         setMapping]         = useState<Record<string, string>>({})
  const [fields,          setFields]          = useState<FieldDef[]>([])
  const [loadingFields,   setLoadingFields]   = useState(false)
  const [templates,       setTemplates]       = useState<Array<{ id: string; name: string; import_template_mappings: Array<{ source_column: string; target_field: string }> }>>([])
  const [parsing,         setParsing]         = useState(false)
  const [uploading,       setUploading]       = useState(false)
  const [progress,        setProgress]        = useState<UploadProgress | null>(null)
  const [committing,      setCommitting]      = useState(false)
  const [validation,      setValidation]      = useState<ValidationSummary | null>(null)
  const [commitResult,    setCommitResult]    = useState<CommitSummary | null>(null)
  const [saveTemplate,      setSaveTemplate]      = useState(false)
  const [templateName,      setTemplateName]      = useState('')
  const [error,             setError]             = useState<string | null>(null)
  const [showCustomModal,   setShowCustomModal]   = useState(false)
  const [detectedPriceList, setDetectedPriceList] = useState<DetectedPriceList | null>(null)
  const [priceListEffDate,  setPriceListEffDate]  = useState<string>(new Date().toISOString().slice(0, 10))
  const [plName,            setPlName]            = useState<string>('')
  const [plCountry,         setPlCountry]         = useState<string>('')
  const [plCurrency,        setPlCurrency]        = useState<string>('')
  const [purchaseSiteId,    setPurchaseSiteId]    = useState<string>('')
  const [purchaseSites,     setPurchaseSites]     = useState<Array<{ id: string; name: string; code: string }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef     = useRef(false)

  // Load catalog whenever import type changes
  useEffect(() => {
    if (!importType) return
    setLoadingFields(true)
    fetch(`/api/import-fields?importType=${importType.type}`)
      .then(r => r.json())
      .then(data => setFields(data.fields ?? []))
      .catch(() => setFields([]))
      .finally(() => setLoadingFields(false))
  }, [importType])

  function selectType(def: ImportTypeSummary) {
    setImportType(def)
    setStep('upload')
    setError(null)
    if (def.type === 'purchase_history' && purchaseSites.length === 0) {
      fetch('/api/sites').then(r => r.json()).then(d => setPurchaseSites(d.data ?? [])).catch(() => {})
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !importType) return
    setError(null)
    setParsing(true)
    try {
      const { headers: h, rows: r, detectedPriceList: detected } = await parseFile(file)
      if (!h.length) { setError('File appears to be empty or has no headers.'); setParsing(false); return }
      setFileName(file.name)
      setHeaders(h)
      setRows(r)
      setDetectedPriceList(detected ?? null)
      if (detected) {
        if (detected.priceListName) setPlName(detected.priceListName)
        if (detected.targetCountry) setPlCountry(detected.targetCountry)
        if (detected.currency)      setPlCurrency(detected.currency)
      }

      // If format detected and user is on generic type, switch to price_list
      if (detected && importType.type !== 'price_list') {
        const plType = IMPORT_TYPES.find(t => t.type === 'price_list')!
        setImportType(plType)
      }

      const res  = await fetch('/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importType: importType.type, columns: h }),
      })
      const data = await res.json()
      setTemplates(data.templates ?? [])

      const sugg: Array<{ sourceColumn: string; suggestedField: string | null }> = data.suggestions ?? []
      const m: Record<string, string> = {}
      for (const s of sugg) m[s.sourceColumn] = s.suggestedField ?? IGNORE
      for (const col of h) if (!m[col]) m[col] = IGNORE
      setMapping(m)

      setStep('mapping')
    } catch {
      setError('Failed to parse file. Check the format and try again.')
    } finally {
      setParsing(false)
    }
  }

  function applyTemplate(tmpl: { import_template_mappings: Array<{ source_column: string; target_field: string }> }) {
    const m = { ...mapping }
    for (const e of tmpl.import_template_mappings) {
      if (headers.includes(e.source_column)) m[e.source_column] = e.target_field
    }
    setMapping(m)
  }

  const handleChunkedUpload = useCallback(async () => {
    if (!importType || !rows.length) return
    setUploading(true); setError(null); abortRef.current = false
    const prog: UploadProgress = { totalRows: rows.length, processedRows: 0, validRows: 0, warningRows: 0, errorRows: 0, sampleErrors: [], aborted: false }
    setProgress({ ...prog })

    try {
      const startRes = await fetch('/api/imports/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importType: importType.type, fileName, mapping, totalRows: rows.length,
          ...(importType.type === 'price_list' ? { priceListMeta: { priceListName: plName, targetCountry: plCountry, currency: plCurrency, effectiveDate: priceListEffDate } } : {}),
          ...(importType.type === 'purchase_history' && purchaseSiteId
            ? { purchaseHistoryMeta: { defaultSiteId: purchaseSiteId } }
            : {}),
        }),
      })
      const startData = await startRes.json()
      if (!startRes.ok) { setError(startData.error ?? 'Failed to create import job'); setUploading(false); return }
      const jobId: string = startData.jobId
      const totalChunks = Math.ceil(rows.length / CHUNK_SIZE)

      for (let ci = 0; ci < totalChunks; ci++) {
        if (abortRef.current) { prog.aborted = true; setProgress({ ...prog }); break }
        const chunk = rows.slice(ci * CHUNK_SIZE, (ci + 1) * CHUNK_SIZE)
        const res = await fetch(`/api/imports/${jobId}/chunk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk, rowOffset: ci * CHUNK_SIZE }),
        })
        const d = await res.json()
        if (!res.ok) { setError(d.error ?? `Chunk ${ci + 1} failed`); setUploading(false); return }
        prog.processedRows = d.totalProcessed
        prog.validRows     = d.totalValid
        prog.warningRows   = d.totalWarnings
        prog.errorRows     = d.totalErrors
        prog.sampleErrors  = [...prog.sampleErrors, ...(d.sampleErrors ?? [])].slice(0, 20)
        setProgress({ ...prog })
      }

      if (!prog.aborted) {
        setValidation({ jobId, totalRows: prog.totalRows, validRows: prog.validRows, warningRows: prog.warningRows, errorRows: prog.errorRows, sampleErrors: prog.sampleErrors })
        setStep('validation')
      }
    } catch { setError('Upload failed. Please try again.') }
    finally { setUploading(false) }
  }, [importType, rows, fileName, mapping, plName, plCountry, plCurrency, priceListEffDate, purchaseSiteId])

  async function handleCommit() {
    if (!validation) return
    setCommitting(true); setError(null)
    try {
      const res = await fetch('/api/imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: validation.jobId, saveTemplate: saveTemplate && !!templateName.trim(), templateName: templateName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Commit failed'); setCommitting(false); return }
      setCommitResult(data)
      setStep('done')
    } catch { setError('Commit failed. Please try again.') }
    finally { setCommitting(false) }
  }

  function reset() {
    setStep('type'); setImportType(null); setFileName(''); setHeaders([]); setRows([])
    setMapping({}); setFields([]); setTemplates([]); setValidation(null); setCommitResult(null)
    setProgress(null); setSaveTemplate(false); setTemplateName(''); setError(null)
    setDetectedPriceList(null)
    setPriceListEffDate(new Date().toISOString().slice(0, 10))
    setPlName(''); setPlCountry(''); setPlCurrency('')
    setPurchaseSiteId('')
    abortRef.current = false
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Price list quality metrics (BG-006/BG-007) — computed client-side from rows + current mapping
  const plPartCol    = importType?.type === 'price_list' ? Object.entries(mapping).find(([,v]) => v === 'part_number')?.[0] : undefined
  const plPriceCol   = importType?.type === 'price_list' ? Object.entries(mapping).find(([,v]) => v === 'unit_price')?.[0] : undefined
  const plCcyCol     = importType?.type === 'price_list' ? Object.entries(mapping).find(([,v]) => v === 'currency')?.[0] : undefined
  const plPartNums   = plPartCol  ? rows.map(r => String(r[plPartCol]  ?? '').trim()).filter(Boolean) : []
  const plPartNumSet = new Set(plPartNums)
  const plDupCount   = plPartNums.length - plPartNumSet.size
  const plMissingPN  = rows.length > 0 && plPartCol ? rows.length - plPartNums.length : 0
  const plPrices     = plPriceCol ? rows.map(r => Number(r[plPriceCol] ?? ''))        : []
  const plZeroCount  = plPrices.filter(p => !isNaN(p) && p === 0).length
  const plNegCount   = plPrices.filter(p => !isNaN(p) && p < 0).length

  // Mapping completeness
  const requiredFields    = fields.filter(f => f.required_by_default && !f.is_deprecated)
  const mappedRequiredKeys = new Set(Object.values(mapping).filter(v => v && v !== IGNORE))
  const missingRequired   = requiredFields.filter(f => !mappedRequiredKeys.has(f.field_key))
  const allRequiredMapped = missingRequired.length === 0 || requiredFields.length === 0

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {showCustomModal && importType && (
        <CustomFieldModal
          importType={importType.type}
          onClose={() => setShowCustomModal(false)}
          onCreated={f => { setFields(prev => [...prev, f]); setShowCustomModal(false) }}
        />
      )}

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, marginBottom: '4px' }}>Import Center</h1>
        <p style={{ color: D.secondary, fontSize: '14px', margin: 0 }}>
          Import structured business data from CSV or Excel. Supports 100,000+ rows via chunked upload and a 100+ field catalog with synonym matching.
        </p>
      </div>

      <Stepper step={step} />

      {error && (
        <div style={{ background: D.redLight, border: `1px solid ${D.error}`, borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', fontSize: '14px', color: D.error }}>
          {error}
        </div>
      )}

      {/* ── Type ──────────────────────────────────────────────────────────── */}
      {step === 'type' && (
        <div>
          <div style={{ marginBottom: '16px', fontSize: '15px', fontWeight: 600, color: D.dark }}>Select import type</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px', marginBottom: '40px' }}>
            {IMPORT_TYPES.map(def => (
              <button key={def.type} onClick={() => selectType(def)}
                style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '20px', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = D.red)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = D.border)}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark, marginBottom: '6px' }}>{def.label}</div>
                <div style={{ fontSize: '13px', color: D.secondary, marginBottom: def.allOrNothing ? '10px' : 0 }}>{def.description}</div>
                {def.allOrNothing && <span style={{ fontSize: '11px', background: '#FFFBEB', color: D.warning, border: '1px solid #FDE68A', borderRadius: '3px', padding: '1px 6px' }}>All-or-nothing</span>}
              </button>
            ))}
          </div>
          <ImportHistory />
        </div>
      )}

      {/* ── Upload ────────────────────────────────────────────────────────── */}
      {step === 'upload' && importType && (
        <Card>
          <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark, marginBottom: '4px' }}>Upload file — {importType.label}</div>
          <div style={{ fontSize: '13px', color: D.secondary, marginBottom: '24px' }}>
            Supported: .csv, .xlsx · No row limit — files are uploaded in {fmtNum(CHUNK_SIZE)}-row chunks.
          </div>
          <div
            style={{ border: `2px dashed ${D.border}`, borderRadius: '8px', padding: '40px', textAlign: 'center', cursor: 'pointer', background: D.bg }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📁</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark, marginBottom: '4px' }}>
              {parsing ? 'Parsing file…' : 'Click to select file'}
            </div>
            <div style={{ fontSize: '13px', color: D.secondary }}>CSV or Excel (.xlsx)</div>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFileChange} />
          <div style={{ marginTop: '16px' }}>
            <button onClick={reset} style={{ fontSize: '13px', color: D.secondary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Back to type selection</button>
          </div>
        </Card>
      )}

      {/* ── Mapping ───────────────────────────────────────────────────────── */}
      {step === 'mapping' && importType && (
        <div>
          {/* Purchase history: default site selector (shown if site_code column not detected) */}
          {importType?.type === 'purchase_history' && !Object.values(mapping).includes('site_code') && (
            <div style={{ background: '#EFF6FF', border: '1px solid #93C5FD', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1565c0', marginBottom: '6px' }}>
                No site_code column detected
              </div>
              <div style={{ fontSize: '13px', color: '#1e3a5f', marginBottom: '10px' }}>
                Select a default site — all imported rows will be assigned to it.
                If your file has a site column, map it to <strong>Site Code</strong> instead.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#1565c0', whiteSpace: 'nowrap' }}>Default Site</label>
                <select
                  value={purchaseSiteId}
                  onChange={e => setPurchaseSiteId(e.target.value)}
                  style={{ fontSize: '13px', padding: '5px 8px', border: '1px solid #93C5FD', borderRadius: '4px', background: '#fff', color: '#1e3a5f' }}
                >
                  <option value="">— select site —</option>
                  {purchaseSites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
                {purchaseSiteId && <span style={{ fontSize: '12px', color: '#16a34a' }}>✓ Site selected</span>}
              </div>
            </div>
          )}

          {/* Price list metadata (BG-002/003/004/005) — always shown for price_list, editable */}
          {importType?.type === 'price_list' && (
            <div>
              <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', padding: '14px 18px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534', marginBottom: '10px' }}>
                  {detectedPriceList ? '✓ Standard Price List Format Detected — review and edit below' : 'Price List Metadata'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#166534', display: 'block', marginBottom: '4px' }}>Price List Name *</label>
                    <input
                      value={plName}
                      onChange={e => setPlName(e.target.value)}
                      placeholder="e.g. IL Standard 2026"
                      style={{ width: '100%', fontSize: '13px', padding: '5px 8px', border: '1px solid #86EFAC', borderRadius: '4px', background: '#fff', color: '#14532d', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#166534', display: 'block', marginBottom: '4px' }}>Target Country</label>
                    <select
                      value={plCountry}
                      onChange={e => setPlCountry(e.target.value)}
                      style={{ width: '100%', fontSize: '13px', padding: '5px 8px', border: '1px solid #86EFAC', borderRadius: '4px', background: '#fff', color: '#14532d', boxSizing: 'border-box' }}
                    >
                      <option value="">— select country —</option>
                      {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#166534', display: 'block', marginBottom: '4px' }}>Currency (header-level)</label>
                    <input
                      value={plCurrency}
                      onChange={e => setPlCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))}
                      placeholder="EUR"
                      maxLength={3}
                      style={{ width: '100%', fontSize: '13px', padding: '5px 8px', border: '1px solid #86EFAC', borderRadius: '4px', background: '#fff', color: '#14532d', fontFamily: 'monospace', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#166534', display: 'block', marginBottom: '4px' }}>Effective Date *</label>
                    <input
                      type="date"
                      value={priceListEffDate}
                      onChange={e => setPriceListEffDate(e.target.value)}
                      style={{ width: '100%', fontSize: '13px', padding: '5px 8px', border: '1px solid #86EFAC', borderRadius: '4px', background: '#fff', color: '#14532d', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                {detectedPriceList && (
                  <div style={{ marginTop: '10px', fontSize: '12px', color: '#166534' }}>
                    Row 3 used as column header. A versioned price list will be created on commit.
                  </div>
                )}
              </div>

              {/* BG-006 / BG-007 — Preview + quality metrics */}
              {rows.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '14px' }}>
                    {[
                      { label: 'Total rows',     value: rows.length,      warn: false },
                      { label: 'Unique SKUs',    value: plPartNumSet.size, warn: false },
                      { label: 'Duplicate SKUs', value: plDupCount,        warn: plDupCount > 0 },
                      { label: 'Missing SKU',    value: plMissingPN,       warn: plMissingPN > 0 },
                      { label: 'Zero prices',    value: plZeroCount + plNegCount, warn: plZeroCount + plNegCount > 0 },
                    ].map(m => (
                      <div key={m.label} style={{ background: D.card, border: `1px solid ${m.warn ? '#FDE68A' : D.border}`, borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: m.warn ? D.warning : D.dark }}>{m.value.toLocaleString()}</div>
                        <div style={{ fontSize: '11px', color: D.secondary, marginTop: '2px' }}>{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {plPartCol && plPriceCol ? (
                    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ padding: '8px 14px', borderBottom: `1px solid ${D.border}`, fontSize: '11px', fontWeight: 600, color: D.secondary }}>
                        FIRST {Math.min(20, rows.length)} ROWS PREVIEW
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: D.bg }}>
                              <th style={{ padding: '6px 10px', textAlign: 'left', color: D.secondary, fontWeight: 600, borderBottom: `1px solid ${D.border}`, width: '40px' }}>#</th>
                              <th style={{ padding: '6px 10px', textAlign: 'left', color: D.secondary, fontWeight: 600, borderBottom: `1px solid ${D.border}` }}>Part Number</th>
                              <th style={{ padding: '6px 10px', textAlign: 'right', color: D.secondary, fontWeight: 600, borderBottom: `1px solid ${D.border}` }}>Unit Price</th>
                              {plCcyCol && <th style={{ padding: '6px 10px', textAlign: 'left', color: D.secondary, fontWeight: 600, borderBottom: `1px solid ${D.border}` }}>Currency</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.slice(0, 20).map((row, idx) => {
                              const pn    = String(row[plPartCol] ?? '').trim()
                              const pr    = row[plPriceCol] ?? ''
                              const cc    = plCcyCol ? String(row[plCcyCol] ?? '').trim() : ''
                              const prNum = Number(pr)
                              const priceWarn = !isNaN(prNum) && prNum <= 0
                              return (
                                <tr key={idx} style={{ borderBottom: `1px solid ${D.border}`, background: idx % 2 === 0 ? D.card : D.bg }}>
                                  <td style={{ padding: '5px 10px', color: D.secondary }}>{idx + 1}</td>
                                  <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: pn ? D.dark : D.error }}>{pn || <span style={{ color: D.error }}>—</span>}</td>
                                  <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', color: priceWarn ? D.warning : D.dark }}>{pr !== '' ? pr : '—'}</td>
                                  {plCcyCol && <td style={{ padding: '5px 10px', color: cc ? D.dark : D.secondary }}>{cc || (plCurrency || '—')}</td>}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '13px', color: '#92400E' }}>
                      Map <strong>Part Number</strong> and <strong>Unit Price</strong> columns to see row preview and quality metrics.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark }}>Map columns — {fileName}</div>
              <div style={{ fontSize: '13px', color: D.secondary, marginTop: '2px' }}>
                {fmtNum(rows.length)} rows · {headers.length} columns detected · {Object.values(mapping).filter(v => v && v !== IGNORE).length} mapped
              </div>
            </div>
            {templates.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: D.secondary }}>Apply template:</span>
                {templates.map(t => (
                  <button key={t.id} onClick={() => applyTemplate(t)} style={{ fontSize: '13px', padding: '4px 12px', border: `1px solid ${D.border}`, borderRadius: '4px', cursor: 'pointer', background: D.card, color: D.dark }}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!allRequiredMapped && !loadingFields && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: '#92400E' }}>
              ✱ Required but not yet mapped: {missingRequired.map(f => f.display_name).join(', ')}
            </div>
          )}

          {loadingFields && (
            <div style={{ padding: '10px 16px', background: D.bg, borderRadius: '6px', fontSize: '13px', color: D.secondary, marginBottom: '16px' }}>
              Loading field catalog…
            </div>
          )}

          <Card style={{ padding: 0, overflow: 'visible' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '26%' }} />
                <col style={{ width: '38%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '24%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                  {['SOURCE COLUMN','TARGET FIELD','REQUIRED','EXAMPLE VALUE'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: D.secondary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {headers.map((col, i) => {
                  const current = mapping[col] ?? IGNORE
                  const tgtDef  = fields.find(f => f.field_key === current)
                  const example = rows[0]?.[col] ?? ''
                  return (
                    <tr key={col} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? D.card : D.bg }}>
                      <td style={{ padding: '8px 14px', fontSize: '13px', fontFamily: 'monospace', color: D.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col}</td>
                      <td style={{ padding: '4px 8px', overflow: 'visible', position: 'relative' }}>
                        <FieldSelector
                          value={current}
                          fields={fields}
                          onChange={v => setMapping(prev => ({ ...prev, [col]: v }))}
                          onAddCustom={() => setShowCustomModal(true)}
                        />
                      </td>
                      <td style={{ padding: '8px 14px', fontSize: '12px', color: tgtDef?.required_by_default ? D.error : D.secondary }}>
                        {tgtDef?.required_by_default ? '✱ Required' : tgtDef ? 'Optional' : '—'}
                      </td>
                      <td style={{ padding: '8px 14px', fontSize: '12px', fontFamily: 'monospace', color: D.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {example || <span style={{ color: D.border }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>

          {uploading && progress && (
            <Card style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark }}>Uploading &amp; validating…</div>
                <button onClick={() => { abortRef.current = true }} style={{ fontSize: '12px', color: D.secondary, background: 'none', border: `1px solid ${D.border}`, padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              </div>
              <ProgressBar progress={progress} />
            </Card>
          )}

          {!uploading && (
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setStep('upload')} style={{ fontSize: '14px', padding: '8px 20px', border: `1px solid ${D.border}`, borderRadius: '6px', cursor: 'pointer', background: D.card, color: D.dark }}>← Back</button>
              <button
                onClick={handleChunkedUpload}
                disabled={!allRequiredMapped || loadingFields}
                style={{ fontSize: '14px', padding: '8px 24px', background: D.red, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: (!allRequiredMapped || loadingFields) ? 'not-allowed' : 'pointer', opacity: (!allRequiredMapped || loadingFields) ? 0.5 : 1 }}
              >
                Upload &amp; Validate {fmtNum(rows.length)} rows →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Validation ────────────────────────────────────────────────────── */}
      {step === 'validation' && validation && importType && (
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark, marginBottom: '20px' }}>Validation results</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Total rows', value: fmtNum(validation.totalRows),   color: D.dark    },
              { label: 'Valid',      value: fmtNum(validation.validRows),   color: D.success },
              { label: 'Warnings',   value: fmtNum(validation.warningRows), color: D.warning },
              { label: 'Errors',     value: fmtNum(validation.errorRows),   color: D.error   },
            ].map(s => (
              <Card key={s.label} style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '12px', color: D.secondary, marginTop: '2px' }}>{s.label}</div>
              </Card>
            ))}
          </div>

          {validation.sampleErrors.length > 0 && (
            <Card style={{ marginBottom: '20px', borderColor: '#FECACA', background: D.redLight }}>
              <div style={{ fontWeight: 600, color: D.error, marginBottom: '12px', fontSize: '14px' }}>
                {fmtNum(validation.errorRows)} error{validation.errorRows !== 1 ? 's' : ''} (first 20 shown):
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <tbody>
                  {validation.sampleErrors.map((e, i) => (
                    <tr key={i}>
                      <td style={{ padding: '3px 8px', color: D.dark, width: '70px' }}>Row #{e.row}</td>
                      <td style={{ padding: '3px 8px', color: D.dark }}>{e.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {ALL_OR_NOTHING.has(importType.type) && validation.errorRows > 0 && (
            <div style={{ padding: '12px 16px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '14px', color: '#92400E', marginBottom: '20px' }}>
              ⚠ {importType.label} uses all-or-nothing commit. Fix all {fmtNum(validation.errorRows)} error{validation.errorRows !== 1 ? 's' : ''} before committing.
            </div>
          )}

          <Card style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: D.dark, marginBottom: '12px' }}>Save mapping as template</div>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: D.dark }}>
              <input type="checkbox" checked={saveTemplate} onChange={e => setSaveTemplate(e.target.checked)} />
              Save this column mapping for future imports
            </label>
            {saveTemplate && (
              <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)}
                placeholder="Template name, e.g. Priority ERP Export"
                style={{ marginTop: '10px', width: '100%', padding: '8px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }} />
            )}
          </Card>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setStep('mapping')} style={{ fontSize: '14px', padding: '8px 20px', border: `1px solid ${D.border}`, borderRadius: '6px', cursor: 'pointer', background: D.card, color: D.dark }}>← Back</button>
            <button
              onClick={handleCommit}
              disabled={committing || (ALL_OR_NOTHING.has(importType.type) && validation.errorRows > 0)}
              style={{ fontSize: '14px', padding: '8px 24px', background: D.red, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: (committing || (ALL_OR_NOTHING.has(importType.type) && validation.errorRows > 0)) ? 'not-allowed' : 'pointer', opacity: (committing || (ALL_OR_NOTHING.has(importType.type) && validation.errorRows > 0)) ? 0.5 : 1 }}
            >
              {committing ? 'Committing…' : `Commit ${fmtNum(validation.validRows + validation.warningRows)} rows →`}
            </button>
          </div>
        </div>
      )}

      {/* ── Done ──────────────────────────────────────────────────────────── */}
      {step === 'done' && commitResult && (
        <Card style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>{commitResult.errors.length === 0 ? '✅' : '⚠️'}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: D.dark, marginBottom: '8px' }}>Import complete</div>
          <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginBottom: '24px' }}>
            {[
              { label: 'Committed', value: fmtNum(commitResult.committed), color: D.success },
              { label: 'Skipped',   value: fmtNum(commitResult.skipped),   color: D.secondary },
              ...(commitResult.errors.length > 0 ? [{ label: 'Errors', value: fmtNum(commitResult.errors.length), color: D.error }] : []),
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '13px', color: D.secondary }}>{s.label}</div>
              </div>
            ))}
          </div>
          {commitResult.errors.length > 0 && (
            <div style={{ marginBottom: '24px', textAlign: 'left', background: D.redLight, border: '1px solid #FECACA', borderRadius: '6px', padding: '12px 16px' }}>
              {commitResult.errors.slice(0, 5).map((e, i) => (
                <div key={i} style={{ fontSize: '13px', color: D.error }}>Row #{e.row}: {e.error}</div>
              ))}
              {commitResult.errors.length > 5 && <div style={{ fontSize: '12px', color: D.secondary, marginTop: '4px' }}>…and {fmtNum(commitResult.errors.length - 5)} more. See Audit Log.</div>}
            </div>
          )}

          {/* Price list quality dashboard */}
          {commitResult.qualityMetrics && (
            <div style={{ textAlign: 'left', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', padding: '16px 20px', marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#166534', marginBottom: '12px' }}>
                Price List Quality Dashboard — {commitResult.qualityMetrics.priceListName} ({commitResult.qualityMetrics.countryCode}) v{commitResult.qualityMetrics.versionNumber}
              </div>
              <div style={{ fontSize: '12px', color: '#166534', marginBottom: '12px' }}>
                Effective date: {commitResult.qualityMetrics.effectiveDate}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {[
                  { label: 'Total Rows',          value: fmtNum(commitResult.qualityMetrics.totalRows),          color: '#166534' },
                  { label: 'Imported',             value: fmtNum(commitResult.qualityMetrics.importedRows),        color: D.success },
                  { label: 'Rejected',             value: fmtNum(commitResult.qualityMetrics.rejectedRows),        color: commitResult.qualityMetrics.rejectedRows > 0 ? D.error : D.success },
                  { label: 'Duplicate SKUs',       value: fmtNum(commitResult.qualityMetrics.duplicateSkus),       color: commitResult.qualityMetrics.duplicateSkus > 0 ? D.warning : D.success },
                  { label: 'Missing in SKU Master',value: fmtNum(commitResult.qualityMetrics.missingSkus),         color: commitResult.qualityMetrics.missingSkus > 0 ? D.error : D.success },
                  { label: 'Missing Prices',       value: fmtNum(commitResult.qualityMetrics.missingPrices),       color: commitResult.qualityMetrics.missingPrices > 0 ? D.error : D.success },
                  { label: 'Currency Mismatches',  value: fmtNum(commitResult.qualityMetrics.currencyMismatches),  color: commitResult.qualityMetrics.currencyMismatches > 0 ? D.warning : D.success },
                ].map(m => (
                  <div key={m.label} style={{ background: '#fff', borderRadius: '6px', padding: '8px 12px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: '11px', color: '#166534' }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Purchase history quality dashboard */}
          {commitResult.purchaseHistoryMetrics && (
            <div style={{ textAlign: 'left', background: '#EFF6FF', border: '1px solid #93C5FD', borderRadius: '8px', padding: '16px 20px', marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1565c0', marginBottom: '12px' }}>
                Purchase History — Data Quality Dashboard
              </div>
              {commitResult.purchaseHistoryMetrics.dateRange && (
                <div style={{ fontSize: '12px', color: '#1e3a5f', marginBottom: '12px' }}>
                  Date range: {commitResult.purchaseHistoryMetrics.dateRange.min} → {commitResult.purchaseHistoryMetrics.dateRange.max}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {[
                  { label: 'Rows Imported',       value: fmtNum(commitResult.purchaseHistoryMetrics.rowsImported),    color: '#1565c0' },
                  { label: 'Unique SKUs',          value: fmtNum(commitResult.purchaseHistoryMetrics.uniqueSkus),      color: D.success },
                  { label: 'Unique Suppliers',     value: fmtNum(commitResult.purchaseHistoryMetrics.uniqueSuppliers), color: D.success },
                  { label: 'Sites Covered',        value: fmtNum(commitResult.purchaseHistoryMetrics.sitesCovered),    color: D.success },
                  { label: 'Missing Suppliers',    value: fmtNum(commitResult.purchaseHistoryMetrics.missingSuppliers),color: commitResult.purchaseHistoryMetrics.missingSuppliers > 0 ? D.warning : D.success },
                  { label: 'Zero-Cost Records',    value: fmtNum(commitResult.purchaseHistoryMetrics.zeroCostRecords), color: commitResult.purchaseHistoryMetrics.zeroCostRecords > 0 ? D.warning : D.success },
                  { label: 'Duplicate References', value: fmtNum(commitResult.purchaseHistoryMetrics.duplicateRefs),   color: commitResult.purchaseHistoryMetrics.duplicateRefs > 0 ? D.warning : D.success },
                ].map(m => (
                  <div key={m.label} style={{ background: '#fff', borderRadius: '6px', padding: '8px 12px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: '11px', color: '#1e3a5f' }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next step CTA for purchase history imports */}
          {commitResult.purchaseHistoryMetrics && (
            <div style={{ textAlign: 'left', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  Next Step · Run Cost Build
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: D.dark, marginBottom: '4px' }}>
                  Purchase history is ready for costing
                </div>
                <div style={{ fontSize: '13px', color: D.secondary }}>
                  Create a Cost Build with strategy <strong>Last Purchase</strong> or <strong>Average Purchase</strong> to use this data.
                </div>
              </div>
              <a
                href="/cost-builds"
                style={{ background: '#16a34a', color: '#fff', textDecoration: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Create Cost Build →
              </a>
            </div>
          )}

          {/* Next step CTA for price list imports */}
          {commitResult.qualityMetrics && (
            <div style={{ textAlign: 'left', background: '#EFF6FF', border: '1px solid #93C5FD', borderRadius: '8px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#1565c0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  Next Step · Build Cost Set
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: D.dark, marginBottom: '4px' }}>
                  Create a Cost Build for {commitResult.qualityMetrics.countryCode}
                </div>
                <div style={{ fontSize: '13px', color: D.secondary }}>
                  {commitResult.qualityMetrics.priceListName} v{commitResult.qualityMetrics.versionNumber} is now active.
                  Run a Cost Build to resolve SKU prices and generate a frozen Cost Set for inventory valuation.
                </div>
              </div>
              <a
                href="/cost-builds"
                style={{ background: '#1565c0', color: '#fff', textDecoration: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Create Cost Build →
              </a>
            </div>
          )}

          {/* Next step CTA for inventory_snapshot imports */}
          {importType?.type === 'inventory_snapshot' && !commitResult.qualityMetrics && (
            <div style={{ textAlign: 'left', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  Next Step · Value Inventory
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: D.dark, marginBottom: '4px' }}>
                  Your inventory is ready to value
                </div>
                <div style={{ fontSize: '13px', color: D.secondary }}>
                  Inventory quantities imported. Go to Inventory Snapshots and click <strong>Value Inventory</strong> to compute stock values using your approved Cost Build.
                </div>
              </div>
              <a
                href="/inventory"
                style={{ background: '#16a34a', color: '#fff', textDecoration: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Value Inventory →
              </a>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button onClick={reset} style={{ fontSize: '14px', padding: '8px 24px', background: D.red, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>New import</button>
            <a href="/audit" style={{ fontSize: '14px', padding: '8px 24px', border: `1px solid ${D.border}`, borderRadius: '6px', background: D.card, color: D.dark, textDecoration: 'none', display: 'inline-block' }}>View audit log</a>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Import History ───────────────────────────────────────────────────────────

function ImportHistory() {
  const [jobs,    setJobs]    = useState<Array<{ id: string; import_type: string; file_name: string | null; status: string; total_rows: number; processed_rows: number; valid_rows: number; error_rows: number; created_at: string }> | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)

  async function load() {
    if (loaded) return
    setLoading(true)
    try {
      const res = await fetch('/api/imports?limit=20')
      const data = await res.json()
      setJobs(data.data ?? [])
      setLoaded(true)
    } finally { setLoading(false) }
  }

  const LABELS: Record<string, string> = { sku_master: 'SKU Master', bom_lines: 'BOM Lines', costs: 'Costs', inventory_snapshot: 'Inventory', price_list: 'Price List', purchase_history: 'Purchase History', supplier_prices: 'Supplier Prices' }
  const SCOLOR: Record<string, string> = { committed: D.success, validated: D.warning, uploading: '#1565c0', failed: D.error, pending: D.secondary, cancelled: D.secondary }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontWeight: 600, fontSize: '14px', color: D.dark }}>Recent imports</span>
        <button onClick={load} disabled={loading} style={{ fontSize: '13px', color: D.red, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {loading ? 'Loading…' : loaded ? 'Refresh' : 'Load history'}
        </button>
      </div>
      {jobs !== null && (jobs.length === 0 ? (
        <div style={{ fontSize: '13px', color: D.secondary }}>No imports yet.</div>
      ) : (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                {['Type','File','Status','Total','Processed','Valid','Errors','Date'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: D.secondary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j, i) => (
                <tr key={j.id} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? D.card : D.bg }}>
                  <td style={{ padding: '8px 14px', fontSize: '13px', color: D.dark }}>{LABELS[j.import_type] ?? j.import_type}</td>
                  <td style={{ padding: '8px 14px', fontSize: '12px', color: D.secondary, fontFamily: 'monospace' }}>{j.file_name ?? '—'}</td>
                  <td style={{ padding: '8px 14px', fontSize: '12px', color: SCOLOR[j.status] ?? D.secondary, fontWeight: 600, textTransform: 'capitalize' }}>{j.status}</td>
                  <td style={{ padding: '8px 14px', fontSize: '13px', color: D.dark }}>{fmtNum(j.total_rows)}</td>
                  <td style={{ padding: '8px 14px', fontSize: '13px', color: D.secondary }}>{fmtNum(j.processed_rows)}</td>
                  <td style={{ padding: '8px 14px', fontSize: '13px', color: D.success }}>{fmtNum(j.valid_rows)}</td>
                  <td style={{ padding: '8px 14px', fontSize: '13px', color: j.error_rows > 0 ? D.error : D.secondary }}>{fmtNum(j.error_rows)}</td>
                  <td style={{ padding: '8px 14px', fontSize: '12px', color: D.secondary }}>{new Date(j.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

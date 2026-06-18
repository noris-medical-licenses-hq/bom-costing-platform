'use client'

import { useState, useRef, useCallback } from 'react'

// ─── Design tokens ────────────────────────────────────────────────────────────
const D = {
  red:       '#C62839',
  dark:      '#222222',
  secondary: '#666666',
  bg:        '#F8F9FA',
  card:      '#FFFFFF',
  border:    '#E5E7EB',
  success:   '#16a34a',
  warning:   '#d97706',
  error:     '#dc2626',
  redLight:  '#FEF2F2',
  greenLight:'#F0FDF4',
  yellowLight:'#FFFBEB',
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'type' | 'upload' | 'mapping' | 'validation' | 'done'

type ImportType = 'sku_master' | 'bom_lines' | 'costs' | 'inventory_snapshot'

interface TargetFieldDef {
  key: string
  label: string
  required: boolean
}

interface ImportTypeDef {
  type: ImportType
  label: string
  description: string
  fields: TargetFieldDef[]
  allOrNothing?: boolean
}

interface ColumnSuggestion {
  sourceColumn: string
  suggestedField: string | null
  confidence: number
  method?: string
}

interface Template {
  id: string
  name: string
  import_template_mappings: Array<{ source_column: string; target_field: string }>
}

interface ValidationSummary {
  jobId: string
  totalRows: number
  validRows: number
  warningRows: number
  errorRows: number
  sampleErrors: Array<{ row: number; errors: string[] }>
}

interface CommitSummary {
  committed: number
  skipped: number
  errors: Array<{ row: number; error: string }>
}

// ─── Import type definitions ──────────────────────────────────────────────────

const IMPORT_TYPES: ImportTypeDef[] = [
  {
    type: 'sku_master',
    label: 'SKU Master',
    description: 'Import part numbers, descriptions, families and units of measure.',
    fields: [
      { key: 'sku',         label: 'SKU',         required: true  },
      { key: 'description', label: 'Description', required: true  },
      { key: 'family',      label: 'Family',      required: false },
      { key: 'subfamily',   label: 'Subfamily',   required: false },
      { key: 'uom',         label: 'UOM',         required: false },
    ],
  },
  {
    type: 'bom_lines',
    label: 'BOM Lines',
    description: 'Import parent-child relationships with quantities. All-or-nothing commit.',
    allOrNothing: true,
    fields: [
      { key: 'parent_sku', label: 'Parent SKU', required: true  },
      { key: 'child_sku',  label: 'Child SKU',  required: true  },
      { key: 'quantity',   label: 'Quantity',   required: true  },
      { key: 'notes',      label: 'Notes',      required: false },
    ],
  },
  {
    type: 'costs',
    label: 'Costs',
    description: 'Import material costs into existing cost sets. All-or-nothing commit.',
    allOrNothing: true,
    fields: [
      { key: 'sku',            label: 'SKU',            required: true  },
      { key: 'cost',           label: 'Cost',           required: true  },
      { key: 'cost_set',       label: 'Cost Set',       required: true  },
      { key: 'currency',       label: 'Currency',       required: false },
      { key: 'effective_date', label: 'Effective Date', required: false },
    ],
  },
  {
    type: 'inventory_snapshot',
    label: 'Inventory Snapshot',
    description: 'Import counted quantities. Creates a new draft snapshot. Partial import allowed.',
    fields: [
      { key: 'sku',       label: 'SKU',       required: true  },
      { key: 'quantity',  label: 'Quantity',  required: true  },
      { key: 'warehouse', label: 'Warehouse', required: false },
      { key: 'site',      label: 'Site',      required: false },
    ],
  },
]

const IGNORE = '__ignore__'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const XLSX = await import('xlsx')
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const raw  = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  if (!raw.length) return { headers: [], rows: [] }
  const headers = Object.keys(raw[0])
  const rows    = raw.map(r =>
    Object.fromEntries(headers.map(h => [h, r[h] instanceof Date ? (r[h] as Date).toISOString().slice(0, 10) : String(r[h] ?? '')]))
  )
  return { headers, rows }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
            padding: '4px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: i <= idx ? 600 : 400,
            background: i < idx ? D.success : i === idx ? D.red : D.border,
            color:      i <= idx ? '#fff' : D.secondary,
          }}>
            {i < idx ? '✓ ' : ''}{s.label}
          </div>
          {i < steps.length - 1 && <div style={{ width: '20px', height: '1px', background: D.border }} />}
        </div>
      ))}
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '24px', ...style }}>
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportsPage() {
  const [step,           setStep]           = useState<Step>('type')
  const [importTypeDef,  setImportTypeDef]  = useState<ImportTypeDef | null>(null)
  const [fileName,       setFileName]       = useState('')
  const [headers,        setHeaders]        = useState<string[]>([])
  const [rows,           setRows]           = useState<Record<string, string>[]>([])
  const [mapping,        setMapping]        = useState<Record<string, string>>({})
  const [suggestions,    setSuggestions]    = useState<ColumnSuggestion[]>([])
  const [templates,      setTemplates]      = useState<Template[]>([])
  const [parsing,        setParsing]        = useState(false)
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [validating,     setValidating]     = useState(false)
  const [committing,     setCommitting]     = useState(false)
  const [validation,     setValidation]     = useState<ValidationSummary | null>(null)
  const [commitResult,   setCommitResult]   = useState<CommitSummary | null>(null)
  const [saveTemplate,   setSaveTemplate]   = useState(false)
  const [templateName,   setTemplateName]   = useState('')
  const [error,          setError]          = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 1 → Select type
  function selectType(def: ImportTypeDef) {
    setImportTypeDef(def)
    setStep('upload')
    setError(null)
  }

  // Step 2 → Upload & parse file
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !importTypeDef) return
    setError(null)
    setParsing(true)
    try {
      const { headers: h, rows: r } = await parseFile(file)
      if (!h.length) { setError('File appears to be empty or has no headers.'); setParsing(false); return }
      if (r.length > 10_000) { setError('File exceeds 10,000 rows. Please split and import in batches.'); setParsing(false); return }
      setFileName(file.name)
      setHeaders(h)
      setRows(r)

      // Fetch suggestions from server
      setLoadingSuggest(true)
      const res = await fetch('/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importType: importTypeDef.type, columns: h }),
      })
      const data = await res.json()
      const sugg: ColumnSuggestion[] = data.suggestions ?? []
      setSuggestions(sugg)
      setTemplates(data.templates ?? [])

      // Auto-apply suggestions
      const m: Record<string, string> = {}
      for (const s of sugg) {
        m[s.sourceColumn] = s.suggestedField ?? IGNORE
      }
      setMapping(m)
      setStep('mapping')
    } catch (err) {
      setError('Failed to parse file. Check the file format and try again.')
    } finally {
      setParsing(false)
      setLoadingSuggest(false)
    }
  }

  function applyTemplate(tmpl: Template) {
    const m: Record<string, string> = { ...mapping }
    for (const entry of tmpl.import_template_mappings) {
      if (headers.includes(entry.source_column)) {
        m[entry.source_column] = entry.target_field
      }
    }
    setMapping(m)
  }

  function updateMapping(srcCol: string, tgtField: string) {
    setMapping(prev => ({ ...prev, [srcCol]: tgtField }))
  }

  // Step 3 → Validate
  async function handleValidate() {
    if (!importTypeDef) return
    setValidating(true)
    setError(null)
    try {
      const res = await fetch('/api/imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importType: importTypeDef.type, fileName, rows, mapping }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Validation failed'); setValidating(false); return }
      setValidation(data)
      setStep('validation')
    } catch {
      setError('Validation request failed. Please try again.')
    } finally {
      setValidating(false)
    }
  }

  // Step 4 → Commit
  async function handleCommit() {
    if (!validation) return
    setCommitting(true)
    setError(null)
    try {
      const res = await fetch('/api/imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId:        validation.jobId,
          saveTemplate: saveTemplate && templateName.trim() !== '',
          templateName: templateName.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Commit failed'); setCommitting(false); return }
      setCommitResult(data)
      setStep('done')
    } catch {
      setError('Commit request failed. Please try again.')
    } finally {
      setCommitting(false)
    }
  }

  function reset() {
    setStep('type')
    setImportTypeDef(null)
    setFileName('')
    setHeaders([])
    setRows([])
    setMapping({})
    setSuggestions([])
    setTemplates([])
    setValidation(null)
    setCommitResult(null)
    setSaveTemplate(false)
    setTemplateName('')
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, marginBottom: '4px' }}>Import Center</h1>
        <p style={{ color: D.secondary, fontSize: '14px', margin: 0 }}>
          Import SKUs, BOMs, costs and inventory from CSV or Excel files. Maps are saved as reusable templates.
        </p>
      </div>

      <Stepper step={step} />

      {error && (
        <div style={{ background: D.redLight, border: `1px solid ${D.error}`, borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', fontSize: '14px', color: D.error }}>
          {error}
        </div>
      )}

      {/* ── Step: Type ────────────────────────────────────────────────────── */}
      {step === 'type' && (
        <div>
          <div style={{ marginBottom: '16px', fontSize: '15px', fontWeight: 600, color: D.dark }}>Select import type</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
            {IMPORT_TYPES.map(def => (
              <button key={def.type} onClick={() => selectType(def)} style={{
                background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px',
                padding: '20px', cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = D.red)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = D.border)}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark, marginBottom: '6px' }}>{def.label}</div>
                <div style={{ fontSize: '13px', color: D.secondary, marginBottom: '12px' }}>{def.description}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {def.fields.filter(f => f.required).map(f => (
                    <span key={f.key} style={{ fontSize: '11px', background: '#FEF2F2', color: D.red, border: `1px solid #FECACA`, borderRadius: '3px', padding: '1px 6px' }}>
                      {f.label}
                    </span>
                  ))}
                  {def.fields.filter(f => !f.required).map(f => (
                    <span key={f.key} style={{ fontSize: '11px', background: '#F9FAFB', color: D.secondary, border: `1px solid ${D.border}`, borderRadius: '3px', padding: '1px 6px' }}>
                      {f.label}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {/* History */}
          <div style={{ marginTop: '40px' }}>
            <ImportHistory />
          </div>
        </div>
      )}

      {/* ── Step: Upload ──────────────────────────────────────────────────── */}
      {step === 'upload' && importTypeDef && (
        <Card>
          <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark, marginBottom: '4px' }}>
            Upload file — {importTypeDef.label}
          </div>
          <div style={{ fontSize: '13px', color: D.secondary, marginBottom: '24px' }}>
            Supported formats: .csv, .xlsx — max 10,000 rows per file.
          </div>

          <div style={{
            border: `2px dashed ${D.border}`, borderRadius: '8px', padding: '40px',
            textAlign: 'center', cursor: 'pointer', background: D.bg,
          }}
          onClick={() => fileInputRef.current?.click()}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📁</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark, marginBottom: '4px' }}>
              {parsing ? 'Parsing file…' : 'Click to select file'}
            </div>
            <div style={{ fontSize: '13px', color: D.secondary }}>CSV or Excel (.xlsx)</div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <div style={{ marginTop: '16px', padding: '12px', background: D.bg, borderRadius: '6px', fontSize: '13px', color: D.secondary }}>
            <strong>Expected fields for {importTypeDef.label}:</strong>{' '}
            {importTypeDef.fields.map(f => `${f.label}${f.required ? ' *' : ''}`).join(', ')}
          </div>

          <div style={{ marginTop: '16px' }}>
            <button onClick={reset} style={{ fontSize: '13px', color: D.secondary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              ← Back to type selection
            </button>
          </div>
        </Card>
      )}

      {/* ── Step: Mapping ─────────────────────────────────────────────────── */}
      {step === 'mapping' && importTypeDef && (
        <div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark }}>Map columns — {fileName}</div>
              <div style={{ fontSize: '13px', color: D.secondary }}>{rows.length} rows · {headers.length} columns detected</div>
            </div>
            {templates.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: D.secondary, alignSelf: 'center' }}>Apply template:</span>
                {templates.map(t => (
                  <button key={t.id} onClick={() => applyTemplate(t)} style={{
                    fontSize: '13px', padding: '4px 12px', border: `1px solid ${D.border}`,
                    borderRadius: '4px', cursor: 'pointer', background: D.card, color: D.dark,
                  }}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: D.secondary, width: '30%' }}>SOURCE COLUMN</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: D.secondary, width: '30%' }}>TARGET FIELD</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: D.secondary, width: '10%' }}>REQUIRED</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: D.secondary }}>EXAMPLE VALUE</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((col, i) => {
                  const sugg = suggestions.find(s => s.sourceColumn === col)
                  const current = mapping[col] ?? IGNORE
                  const tgtDef = importTypeDef.fields.find(f => f.key === current)
                  const example = rows[0]?.[col] ?? ''
                  return (
                    <tr key={col} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? D.card : D.bg }}>
                      <td style={{ padding: '10px 16px', fontSize: '13px', fontFamily: 'monospace', color: D.dark }}>{col}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <select
                          value={current}
                          onChange={e => updateMapping(col, e.target.value)}
                          style={{
                            width: '100%', fontSize: '13px', padding: '4px 8px',
                            border: `1px solid ${current === IGNORE ? D.border : D.red}`,
                            borderRadius: '4px', background: D.card, color: D.dark,
                          }}
                        >
                          <option value={IGNORE}>— Ignore this column —</option>
                          {importTypeDef.fields.map(f => (
                            <option key={f.key} value={f.key}>
                              {f.label}{f.required ? ' *' : ''}
                            </option>
                          ))}
                        </select>
                        {sugg?.suggestedField && sugg.method !== 'none' && (
                          <div style={{ fontSize: '11px', color: D.secondary, marginTop: '2px' }}>
                            {sugg.method === 'dictionary_exact' ? '✓ Exact match' : '≈ Fuzzy match'} ({Math.round(sugg.confidence * 100)}%)
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', color: tgtDef?.required ? D.error : D.secondary }}>
                        {tgtDef?.required ? '✓ Required' : tgtDef ? 'Optional' : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '12px', fontFamily: 'monospace', color: D.secondary, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {example || <span style={{ color: D.border }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>

          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button onClick={() => setStep('upload')} style={{ fontSize: '14px', padding: '8px 20px', border: `1px solid ${D.border}`, borderRadius: '6px', cursor: 'pointer', background: D.card, color: D.dark }}>
              ← Back
            </button>
            <button onClick={handleValidate} disabled={validating} style={{ fontSize: '14px', padding: '8px 24px', background: D.red, color: '#fff', border: 'none', borderRadius: '6px', cursor: validating ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: validating ? 0.7 : 1 }}>
              {validating ? 'Validating…' : 'Validate →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Validation ──────────────────────────────────────────────── */}
      {step === 'validation' && validation && importTypeDef && (
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark, marginBottom: '20px' }}>Validation results</div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Total rows',    value: validation.totalRows,   color: D.dark    },
              { label: 'Valid',         value: validation.validRows,   color: D.success },
              { label: 'Warnings',      value: validation.warningRows, color: D.warning },
              { label: 'Errors',        value: validation.errorRows,   color: D.error   },
            ].map(stat => (
              <Card key={stat.label} style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: '12px', color: D.secondary, marginTop: '2px' }}>{stat.label}</div>
              </Card>
            ))}
          </div>

          {validation.errorRows > 0 && (
            <Card style={{ marginBottom: '20px', borderColor: '#FECACA', background: D.redLight }}>
              <div style={{ fontWeight: 600, color: D.error, marginBottom: '12px', fontSize: '14px' }}>
                {validation.errorRows} error{validation.errorRows !== 1 ? 's' : ''} found — sample:
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid #FECACA` }}>
                    <th style={{ padding: '4px 8px', textAlign: 'left', color: D.error, fontWeight: 600, width: '80px' }}>Row</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', color: D.error, fontWeight: 600 }}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.sampleErrors.map(e => (
                    <tr key={e.row}>
                      <td style={{ padding: '4px 8px', color: D.dark }}>#{e.row}</td>
                      <td style={{ padding: '4px 8px', color: D.dark }}>{e.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {importTypeDef.allOrNothing && validation.errorRows > 0 && (
            <div style={{ padding: '12px 16px', background: '#FFFBEB', border: `1px solid #FDE68A`, borderRadius: '6px', fontSize: '14px', color: '#92400E', marginBottom: '20px' }}>
              ⚠ {importTypeDef.label} uses all-or-nothing commit. Fix all {validation.errorRows} error{validation.errorRows !== 1 ? 's' : ''} before committing.
            </div>
          )}

          {/* Save template */}
          <Card style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: D.dark, marginBottom: '12px' }}>Save mapping as template</div>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: D.dark }}>
              <input type="checkbox" checked={saveTemplate} onChange={e => setSaveTemplate(e.target.checked)} />
              Save this column mapping for future imports
            </label>
            {saveTemplate && (
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Template name, e.g. Noris SKU Format"
                style={{ marginTop: '10px', width: '100%', padding: '8px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            )}
          </Card>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setStep('mapping')} style={{ fontSize: '14px', padding: '8px 20px', border: `1px solid ${D.border}`, borderRadius: '6px', cursor: 'pointer', background: D.card, color: D.dark }}>
              ← Back to mapping
            </button>
            <button
              onClick={handleCommit}
              disabled={committing || (importTypeDef.allOrNothing && validation.errorRows > 0)}
              style={{
                fontSize: '14px', padding: '8px 24px', background: D.red, color: '#fff',
                border: 'none', borderRadius: '6px', fontWeight: 600,
                cursor: (committing || (importTypeDef.allOrNothing && validation.errorRows > 0)) ? 'not-allowed' : 'pointer',
                opacity: (committing || (importTypeDef.allOrNothing && validation.errorRows > 0)) ? 0.5 : 1,
              }}
            >
              {committing ? 'Committing…' : `Commit ${validation.validRows + validation.warningRows} rows →`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Done ────────────────────────────────────────────────────── */}
      {step === 'done' && commitResult && (
        <Card style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>
            {commitResult.errors.length === 0 ? '✅' : '⚠️'}
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: D.dark, marginBottom: '8px' }}>
            Import complete
          </div>
          <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: D.success }}>{commitResult.committed}</div>
              <div style={{ fontSize: '13px', color: D.secondary }}>Committed</div>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: D.secondary }}>{commitResult.skipped}</div>
              <div style={{ fontSize: '13px', color: D.secondary }}>Skipped</div>
            </div>
            {commitResult.errors.length > 0 && (
              <div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: D.error }}>{commitResult.errors.length}</div>
                <div style={{ fontSize: '13px', color: D.secondary }}>Errors</div>
              </div>
            )}
          </div>
          {commitResult.errors.length > 0 && (
            <div style={{ marginBottom: '24px', textAlign: 'left', background: D.redLight, border: `1px solid #FECACA`, borderRadius: '6px', padding: '12px 16px' }}>
              {commitResult.errors.slice(0, 5).map((e, i) => (
                <div key={i} style={{ fontSize: '13px', color: D.error }}>Row #{e.row}: {e.error}</div>
              ))}
              {commitResult.errors.length > 5 && <div style={{ fontSize: '12px', color: D.secondary, marginTop: '4px' }}>…and {commitResult.errors.length - 5} more. See Audit Log for full details.</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button onClick={reset} style={{ fontSize: '14px', padding: '8px 24px', background: D.red, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
              New import
            </button>
            <a href="/audit" style={{ fontSize: '14px', padding: '8px 24px', border: `1px solid ${D.border}`, borderRadius: '6px', cursor: 'pointer', background: D.card, color: D.dark, textDecoration: 'none', display: 'inline-block' }}>
              View audit log
            </a>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Import History sub-component ─────────────────────────────────────────────

function ImportHistory() {
  const [jobs, setJobs] = useState<Array<{
    id: string; import_type: string; file_name: string | null;
    status: string; total_rows: number; valid_rows: number;
    error_rows: number; created_at: string;
  }> | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    if (loaded) return
    setLoading(true)
    try {
      const res = await fetch('/api/imports?limit=20')
      const data = await res.json()
      setJobs(data.data ?? [])
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  const TYPE_LABELS: Record<string, string> = {
    sku_master: 'SKU Master', bom_lines: 'BOM Lines',
    costs: 'Costs', inventory_snapshot: 'Inventory',
  }
  const STATUS_COLORS: Record<string, string> = {
    committed: D.success, validated: D.warning, failed: D.error,
    pending: D.secondary, cancelled: D.secondary,
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontWeight: 600, fontSize: '14px', color: D.dark }}>Recent imports</span>
        <button onClick={load} disabled={loading} style={{ fontSize: '13px', color: D.red, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {loading ? 'Loading…' : loaded ? 'Refresh' : 'Load history'}
        </button>
      </div>
      {jobs !== null && (
        jobs.length === 0 ? (
          <div style={{ fontSize: '13px', color: D.secondary }}>No imports yet.</div>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                  {['Type', 'File', 'Status', 'Rows', 'Valid', 'Errors', 'Date'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: D.secondary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((j, i) => (
                  <tr key={j.id} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? D.card : D.bg }}>
                    <td style={{ padding: '8px 14px', fontSize: '13px', color: D.dark }}>{TYPE_LABELS[j.import_type] ?? j.import_type}</td>
                    <td style={{ padding: '8px 14px', fontSize: '12px', color: D.secondary, fontFamily: 'monospace' }}>{j.file_name ?? '—'}</td>
                    <td style={{ padding: '8px 14px', fontSize: '12px', color: STATUS_COLORS[j.status] ?? D.secondary, fontWeight: 600, textTransform: 'capitalize' }}>{j.status}</td>
                    <td style={{ padding: '8px 14px', fontSize: '13px', color: D.dark }}>{j.total_rows}</td>
                    <td style={{ padding: '8px 14px', fontSize: '13px', color: D.success }}>{j.valid_rows}</td>
                    <td style={{ padding: '8px 14px', fontSize: '13px', color: j.error_rows > 0 ? D.error : D.secondary }}>{j.error_rows}</td>
                    <td style={{ padding: '8px 14px', fontSize: '12px', color: D.secondary }}>{new Date(j.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}
    </div>
  )
}

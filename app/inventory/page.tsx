'use client'
import { useState, useEffect, useCallback } from 'react'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  green: '#2e7d32', amber: '#e65100',
}

const SNAP_STATUS_COLORS: Record<string, string> = {
  draft: D.secondary, under_review: D.amber, approved: D.green, superseded: D.secondary, archived: D.secondary,
}
const VR_STATUS_COLORS: Record<string, string> = {
  draft: D.secondary, running: D.amber, complete: D.green,
  approved: '#1565c0', locked: '#4a148c', failed: D.red,
}
const SCENARIO_LABELS: Record<string, string> = {
  month_end: 'Month End', audit: 'Audit', management: 'Management', budget: 'Budget', forecast: 'Forecast',
}

type Snapshot = {
  id: string; snapshot_name: string; snapshot_date: string; snapshot_type: string
  status: string; total_value: number | null; total_quantity: number | null
  line_count: number | null; missing_cost_count: number | null; base_currency: string
}
type VReport = {
  id: string; snapshot_id: string; valuation_currency: string; valuation_scenario: string
  exchange_rate_source: string; fx_snapshot_name: string | null; status: string
  total_value: number | null; line_count: number | null; missing_cost_count: number | null
  created_at: string; completed_at: string | null
  inventory_snapshots: { snapshot_name: string; snapshot_date: string }
  cost_sets: { name: string }
}
type CostSet = { id: string; name: string; base_currency: string }
type Warehouse = { id: string; code: string; name: string; sites?: { name: string } | null }

type WizardStep = 1 | 2 | 3 | 4

type WizardState = {
  snapshotId: string
  costSetId: string
  valuationCurrency: string
  valuationScenario: string
  exchangeRateSource: string
  fxSnapshotName: string
  warehouseFilter: 'all' | 'selected'
  notes: string
  warehouseFilters: Record<string, { included: boolean; reason: string }>
  exchangeRates: Array<{ fromCurrency: string; toCurrency: string; rate: string }>
}

const INIT_WIZARD: WizardState = {
  snapshotId: '', costSetId: '', valuationCurrency: 'EUR', valuationScenario: 'management',
  exchangeRateSource: 'manual', fxSnapshotName: '', warehouseFilter: 'all', notes: '',
  warehouseFilters: {},
  exchangeRates: [{ fromCurrency: 'USD', toCurrency: 'EUR', rate: '' }],
}

export default function InventoryPage() {
  const [tab, setTab]                 = useState<'snapshots' | 'reports'>('snapshots')
  const [snapshots, setSnapshots]     = useState<Snapshot[]>([])
  const [reports, setReports]         = useState<VReport[]>([])
  const [costSets, setCostSets]       = useState<CostSet[]>([])
  const [warehouses, setWarehouses]   = useState<Warehouse[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [showWizard, setShowWizard]   = useState(false)
  const [wizardStep, setWizardStep]   = useState<WizardStep>(1)
  const [wizard, setWizard]           = useState<WizardState>(INIT_WIZARD)
  const [running, setRunning]         = useState(false)
  const [runResult, setRunResult]     = useState<{ id: string; totalValue: number; lineCount: number; missingCostCount: number } | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [valuationResult, setValuationResult] = useState<{ totalValue: number; lineCount: number; missingCostCount: number; currency: string; durationMs: number } | null>(null)
  const [form, setForm]               = useState({
    snapshot_name: '', snapshot_date: new Date().toISOString().slice(0, 10),
    snapshot_type: 'full', cost_set_id: '', base_currency: 'EUR',
  })

  const loadSnapshots = useCallback(async () => {
    setLoading(true)
    const [sRes, rRes, csRes, whRes] = await Promise.all([
      fetch('/api/inventory'),
      fetch('/api/valuation-reports'),
      fetch('/api/cost-sets'),
      fetch('/api/warehouses'),
    ])
    const [sJson, rJson, csJson, whJson] = await Promise.all([sRes.json(), rRes.json(), csRes.json(), whRes.json()])
    setLoading(false)
    if (sRes.ok) setSnapshots(sJson.data ?? [])
    if (rRes.ok) setReports(rJson.data ?? [])
    if (csRes.ok) setCostSets(csJson.data ?? [])
    if (whRes.ok) setWarehouses(whJson.data ?? [])
  }, [])

  useEffect(() => { loadSnapshots() }, [loadSnapshots])

  async function handleCreateSnapshot(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const json = await res.json()
    if (res.ok) { setShowForm(false); loadSnapshots() }
    else setError(json.error)
  }

  async function runLegacyValuation(snapshotId: string) {
    setSelectedId(snapshotId); setRunning(true); setError(null); setValuationResult(null)
    const res = await fetch(`/api/inventory/${snapshotId}/value`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const json = await res.json()
    setRunning(false)
    if (res.ok) { setValuationResult(json.data); loadSnapshots() }
    else setError(json.error)
  }

  function openWizard() {
    setWizard({ ...INIT_WIZARD, snapshotId: snapshots[0]?.id ?? '', costSetId: costSets[0]?.id ?? '' })
    const whDefaults: Record<string, { included: boolean; reason: string }> = {}
    for (const wh of warehouses) whDefaults[wh.id] = { included: true, reason: '' }
    setWizard(w => ({ ...w, warehouseFilters: whDefaults }))
    setWizardStep(1)
    setRunResult(null)
    setError(null)
    setShowWizard(true)
  }

  function setWh(id: string, field: 'included' | 'reason', value: boolean | string) {
    setWizard(w => ({ ...w, warehouseFilters: { ...w.warehouseFilters, [id]: { ...w.warehouseFilters[id], [field]: value } } }))
  }

  function addFxRate() {
    setWizard(w => ({ ...w, exchangeRates: [...w.exchangeRates, { fromCurrency: '', toCurrency: wizard.valuationCurrency, rate: '' }] }))
  }

  function removeFxRate(i: number) {
    setWizard(w => ({ ...w, exchangeRates: w.exchangeRates.filter((_, idx) => idx !== i) }))
  }

  function updateFxRate(i: number, field: keyof WizardState['exchangeRates'][0], value: string) {
    setWizard(w => { const rates = [...w.exchangeRates]; rates[i] = { ...rates[i], [field]: value }; return { ...w, exchangeRates: rates } })
  }

  async function submitWizard() {
    setRunning(true); setError(null)
    const payload = {
      snapshotId:         wizard.snapshotId,
      costSetId:          wizard.costSetId,
      valuationCurrency:  wizard.valuationCurrency,
      valuationScenario:  wizard.valuationScenario,
      exchangeRateSource: wizard.exchangeRateSource,
      fxSnapshotName:     wizard.fxSnapshotName || undefined,
      warehouseFilter:    wizard.warehouseFilter,
      notes:              wizard.notes || undefined,
      warehouseFilters:   wizard.warehouseFilter === 'selected'
        ? Object.entries(wizard.warehouseFilters).map(([warehouseId, v]) => ({
            warehouseId, included: v.included, exclusionReason: v.included ? undefined : v.reason,
          }))
        : [],
      exchangeRates: wizard.exchangeRateSource !== 'stored'
        ? wizard.exchangeRates.filter(r => r.fromCurrency && r.toCurrency && r.rate).map(r => ({
            fromCurrency: r.fromCurrency.toUpperCase(),
            toCurrency: r.toCurrency.toUpperCase(),
            rate: parseFloat(r.rate),
          }))
        : [],
    }
    const res = await fetch('/api/valuation-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()
    setRunning(false)
    if (res.ok) {
      setRunResult(json.data)
      loadSnapshots()
    } else {
      setError(json.error)
    }
  }

  const fmtNum = (v: number | null) => v != null ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
  const btnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? D.red : D.card, color: active ? '#fff' : D.dark,
    border: `1px solid ${active ? D.red : D.border}`,
    padding: '7px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
  })
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: `1px solid ${D.border}`, borderRadius: '6px',
    fontSize: '13px', boxSizing: 'border-box', background: D.card, color: D.dark,
  }
  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '4px' }

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: D.dark, margin: 0 }}>Inventory Valuation</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tab === 'snapshots' && (
            <button onClick={() => setShowForm(!showForm)} style={{ ...btnStyle(false) }}>
              {showForm ? 'Cancel' : '+ New Snapshot'}
            </button>
          )}
          {tab === 'reports' && (
            <button onClick={openWizard} style={{ ...btnStyle(true), background: D.red }}>
              + New Valuation Report
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: `2px solid ${D.border}` }}>
        {(['snapshots', 'reports'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', borderBottom: tab === t ? `2px solid ${D.red}` : '2px solid transparent',
            padding: '8px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginBottom: '-2px',
            color: tab === t ? D.red : D.secondary,
          }}>
            {t === 'snapshots' ? 'Snapshots' : 'Valuation Reports'}
            {t === 'reports' && reports.length > 0 && (
              <span style={{ marginLeft: '6px', background: D.red, color: '#fff', fontSize: '11px', padding: '1px 6px', borderRadius: '10px' }}>{reports.length}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: `1px solid #fecaca`, borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '14px', color: D.red }}>{error}</div>
      )}

      {/* ── SNAPSHOTS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'snapshots' && (
        <>
          {showForm && (
            <form onSubmit={handleCreateSnapshot} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
              <h3 style={{ marginTop: 0, fontSize: '15px', fontWeight: 700 }}>Create Inventory Snapshot</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  { label: 'Snapshot Name', key: 'snapshot_name', type: 'text' },
                  { label: 'Snapshot Date', key: 'snapshot_date', type: 'date' },
                  { label: 'Cost Set ID', key: 'cost_set_id', type: 'text' },
                  { label: 'Base Currency', key: 'base_currency', type: 'text' },
                ].map(({ label, key, type }) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <input type={type} value={form[key as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} required style={inputStyle} />
                  </div>
                ))}
                <div>
                  <label style={labelStyle}>Snapshot Type</label>
                  <select value={form.snapshot_type} onChange={e => setForm(f => ({ ...f, snapshot_type: e.target.value }))} style={inputStyle}>
                    {['full', 'site', 'warehouse', 'project'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" style={{ ...btnStyle(true), marginTop: '16px' }}>Create Snapshot</button>
            </form>
          )}

          {valuationResult && (
            <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
              <h3 style={{ marginTop: 0, fontSize: '15px', color: D.green }}>Valuation Complete</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '13px' }}>
                <div><div style={{ fontSize: '20px', fontWeight: 700 }}>{valuationResult.currency} {fmtNum(valuationResult.totalValue)}</div><div style={{ color: D.secondary }}>Total Value</div></div>
                <div><div style={{ fontSize: '20px', fontWeight: 700 }}>{valuationResult.lineCount}</div><div style={{ color: D.secondary }}>Lines</div></div>
                <div><div style={{ fontSize: '20px', fontWeight: 700, color: valuationResult.missingCostCount > 0 ? D.red : D.green }}>{valuationResult.missingCostCount}</div><div style={{ color: D.secondary }}>Missing Costs</div></div>
                <div><div style={{ fontSize: '20px', fontWeight: 700 }}>{valuationResult.durationMs}ms</div><div style={{ color: D.secondary }}>Duration</div></div>
              </div>
            </div>
          )}

          {loading ? <p style={{ color: D.secondary, fontSize: '14px' }}>Loading...</p> : (
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                    {['Name', 'Date', 'Type', 'Status', 'Lines', 'Total Value', 'Missing Costs', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: D.secondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshots.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: D.secondary }}>No snapshots yet</td></tr>
                  ) : snapshots.map(snap => (
                    <tr key={snap.id} style={{ borderBottom: `1px solid ${D.border}`, background: selectedId === snap.id ? '#f8f9ff' : undefined }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{snap.snapshot_name}</td>
                      <td style={{ padding: '10px 14px', color: D.secondary }}>{snap.snapshot_date}</td>
                      <td style={{ padding: '10px 14px', color: D.secondary }}>{snap.snapshot_type}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ color: SNAP_STATUS_COLORS[snap.status] ?? D.secondary, fontWeight: 500 }}>{snap.status}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>{snap.line_count ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>
                        {snap.total_value != null ? `${snap.base_currency} ${fmtNum(snap.total_value)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: (snap.missing_cost_count ?? 0) > 0 ? D.red : D.secondary }}>
                        {snap.missing_cost_count ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', display: 'flex', gap: '6px' }}>
                        {snap.status !== 'approved' && (
                          <button onClick={() => runLegacyValuation(snap.id)} disabled={running && selectedId === snap.id}
                            style={{ background: D.green, color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                            {running && selectedId === snap.id ? 'Running…' : 'Run'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── VALUATION REPORTS TAB ─────────────────────────────────────────────── */}
      {tab === 'reports' && (
        <>
          {runResult && (
            <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', color: D.green }}>
                <strong>Report created.</strong> Total: {wizard.valuationCurrency} {fmtNum(runResult.totalValue)} · {runResult.lineCount} lines · {runResult.missingCostCount} missing costs
              </div>
              <a href={`/valuation-reports/${runResult.id}`} style={{ background: D.red, color: '#fff', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', textDecoration: 'none', fontWeight: 600 }}>
                View Report
              </a>
            </div>
          )}

          {loading ? <p style={{ color: D.secondary, fontSize: '14px' }}>Loading...</p> : (
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                    {['Snapshot', 'Date', 'Scenario', 'Cost Set', 'Currency', 'FX Source', 'Status', 'Total Value', 'Missing', 'Created', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: D.secondary, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reports.length === 0 ? (
                    <tr><td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: D.secondary }}>
                      No valuation reports yet. Click <strong>+ New Valuation Report</strong> to create one.
                    </td></tr>
                  ) : reports.map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${D.border}` }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r.inventory_snapshots?.snapshot_name}</td>
                      <td style={{ padding: '10px 14px', color: D.secondary }}>{r.inventory_snapshots?.snapshot_date}</td>
                      <td style={{ padding: '10px 14px' }}>{SCENARIO_LABELS[r.valuation_scenario] ?? r.valuation_scenario}</td>
                      <td style={{ padding: '10px 14px', color: D.secondary }}>{r.cost_sets?.name}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.valuation_currency}</td>
                      <td style={{ padding: '10px 14px', color: D.secondary }}>{r.exchange_rate_source}{r.fx_snapshot_name ? ` (${r.fx_snapshot_name})` : ''}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ color: VR_STATUS_COLORS[r.status] ?? D.secondary, fontWeight: 500 }}>{r.status}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>
                        {r.total_value != null ? `${r.valuation_currency} ${fmtNum(r.total_value)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: (r.missing_cost_count ?? 0) > 0 ? D.red : D.secondary }}>
                        {r.missing_cost_count ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: D.secondary, fontSize: '12px' }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <a href={`/valuation-reports/${r.id}`} style={{ color: D.red, fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>View →</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── WIZARD MODAL ──────────────────────────────────────────────────────── */}
      {showWizard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: D.card, borderRadius: '12px', width: '680px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            {/* Wizard Header */}
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: D.dark }}>New Valuation Report</h2>
              <button onClick={() => setShowWizard(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: D.secondary }}>×</button>
            </div>

            {/* Step indicators */}
            <div style={{ padding: '16px 24px', display: 'flex', gap: '0', borderBottom: `1px solid ${D.border}` }}>
              {[['1', 'Setup'], ['2', 'FX Rates'], ['3', 'Warehouses'], ['4', 'Review']].map(([n, label], i) => {
                const step = (i + 1) as WizardStep
                const active = wizardStep === step
                const done = wizardStep > step
                return (
                  <div key={n} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0, background: active ? D.red : done ? '#e8f5e9' : D.bg, color: active ? '#fff' : done ? D.green : D.secondary, border: `2px solid ${active ? D.red : done ? D.green : D.border}` }}>
                      {done ? '✓' : n}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: active ? D.dark : D.secondary, whiteSpace: 'nowrap' }}>{label}</span>
                    {i < 3 && <div style={{ flex: 1, height: '1px', background: D.border, margin: '0 8px' }} />}
                  </div>
                )
              })}
            </div>

            <div style={{ padding: '24px' }}>

              {/* ── Step 1: Setup ── */}
              {wizardStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={labelStyle}>Snapshot *</label>
                      <select value={wizard.snapshotId} onChange={e => setWizard(w => ({ ...w, snapshotId: e.target.value }))} style={inputStyle}>
                        <option value="">— select —</option>
                        {snapshots.map(s => <option key={s.id} value={s.id}>{s.snapshot_name} ({s.snapshot_date})</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Cost Set *</label>
                      <select value={wizard.costSetId} onChange={e => setWizard(w => ({ ...w, costSetId: e.target.value }))} style={inputStyle}>
                        <option value="">— select —</option>
                        {costSets.map(cs => <option key={cs.id} value={cs.id}>{cs.name} ({cs.base_currency})</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Valuation Scenario *</label>
                      <select value={wizard.valuationScenario} onChange={e => setWizard(w => ({ ...w, valuationScenario: e.target.value }))} style={inputStyle}>
                        {Object.entries(SCENARIO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Valuation Currency *</label>
                      <input value={wizard.valuationCurrency} maxLength={3} onChange={e => setWizard(w => ({ ...w, valuationCurrency: e.target.value.toUpperCase() }))} style={inputStyle} placeholder="EUR" />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Notes (optional)</label>
                    <input value={wizard.notes} onChange={e => setWizard(w => ({ ...w, notes: e.target.value }))} style={inputStyle} placeholder="e.g., June 2026 month-end valuation" />
                  </div>
                </div>
              )}

              {/* ── Step 2: Exchange Rates ── */}
              {wizardStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={labelStyle}>Exchange Rate Source *</label>
                      <select value={wizard.exchangeRateSource} onChange={e => setWizard(w => ({ ...w, exchangeRateSource: e.target.value }))} style={inputStyle}>
                        <option value="manual">Manual (enter rates below)</option>
                        <option value="corporate">Corporate (from saved rates)</option>
                        <option value="stored">Stored (pre-loaded)</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>FX Snapshot Label</label>
                      <input value={wizard.fxSnapshotName} onChange={e => setWizard(w => ({ ...w, fxSnapshotName: e.target.value }))} style={inputStyle} placeholder="e.g., June 2026 ECB Rates" />
                    </div>
                  </div>

                  {wizard.exchangeRateSource !== 'stored' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <label style={{ ...labelStyle, margin: 0 }}>Exchange Rates (From → To)</label>
                        <button onClick={addFxRate} style={{ background: 'none', border: `1px solid ${D.border}`, padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: D.dark }}>+ Add Rate</button>
                      </div>
                      {wizard.exchangeRates.map((r, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1.5fr auto', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                          <input value={r.fromCurrency} maxLength={3} onChange={e => updateFxRate(i, 'fromCurrency', e.target.value.toUpperCase())} style={{ ...inputStyle }} placeholder="USD" />
                          <span style={{ color: D.secondary, fontSize: '13px', textAlign: 'center' }}>→</span>
                          <input value={r.toCurrency} maxLength={3} onChange={e => updateFxRate(i, 'toCurrency', e.target.value.toUpperCase())} style={{ ...inputStyle }} placeholder={wizard.valuationCurrency || 'EUR'} />
                          <span style={{ color: D.secondary, fontSize: '13px' }}>=</span>
                          <input value={r.rate} type="number" step="0.0001" onChange={e => updateFxRate(i, 'rate', e.target.value)} style={{ ...inputStyle }} placeholder="0.9200" />
                          <button onClick={() => removeFxRate(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.red, fontSize: '16px', padding: '0 4px' }}>×</button>
                        </div>
                      ))}
                      <p style={{ fontSize: '12px', color: D.secondary, marginTop: '8px' }}>
                        Same-currency pairs (e.g., EUR→EUR) are handled automatically. Only enter cross-currency rates.
                      </p>
                    </div>
                  )}

                  {wizard.exchangeRateSource === 'corporate' && (
                    <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '6px', padding: '12px', fontSize: '13px', color: D.green }}>
                      Corporate rates will be loaded from the most recent entries in your Corporate Exchange Rates table. Any rates entered above will be added on top.
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 3: Warehouse Filter ── */}
              {wizardStep === 3 && (
                <div>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    {(['all', 'selected'] as const).map(v => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                        <input type="radio" name="whFilter" value={v} checked={wizard.warehouseFilter === v} onChange={() => setWizard(w => ({ ...w, warehouseFilter: v }))} />
                        {v === 'all' ? 'Include all warehouses' : 'Select warehouses to include/exclude'}
                      </label>
                    ))}
                  </div>

                  {wizard.warehouseFilter === 'selected' && (
                    <div style={{ border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: D.secondary, fontWeight: 600 }}>Warehouse</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center', color: D.secondary, fontWeight: 600, width: '80px' }}>Include</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: D.secondary, fontWeight: 600 }}>Exclusion Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {warehouses.length === 0 ? (
                            <tr><td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: D.secondary }}>No warehouses found</td></tr>
                          ) : warehouses.map(wh => {
                            const wf = wizard.warehouseFilters[wh.id] ?? { included: true, reason: '' }
                            return (
                              <tr key={wh.id} style={{ borderBottom: `1px solid ${D.border}`, background: !wf.included ? '#fff8f8' : undefined }}>
                                <td style={{ padding: '8px 12px', fontWeight: 500 }}>{wh.name}<span style={{ color: D.secondary, marginLeft: '6px', fontSize: '11px' }}>{wh.code}</span></td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  <input type="checkbox" checked={wf.included} onChange={e => setWh(wh.id, 'included', e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  {!wf.included && (
                                    <input value={wf.reason} onChange={e => setWh(wh.id, 'reason', e.target.value)} style={{ ...inputStyle }} placeholder="Required: reason for exclusion" />
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 4: Review & Run ── */}
              {wizardStep === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {runResult ? (
                    <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: D.green }}>Report Created</div>
                      <div style={{ fontSize: '13px', color: D.secondary, marginTop: '8px' }}>
                        {wizard.valuationCurrency} {fmtNum(runResult.totalValue)} · {runResult.lineCount} lines · {runResult.missingCostCount} missing costs
                      </div>
                      <a href={`/valuation-reports/${runResult.id}`} style={{ display: 'inline-block', marginTop: '16px', background: D.red, color: '#fff', padding: '10px 24px', borderRadius: '6px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
                        View Full Report →
                      </a>
                    </div>
                  ) : (
                    <>
                      <div style={{ background: D.bg, borderRadius: '8px', padding: '16px', fontSize: '13px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          {[
                            ['Snapshot', snapshots.find(s => s.id === wizard.snapshotId)?.snapshot_name ?? '—'],
                            ['Cost Set', costSets.find(cs => cs.id === wizard.costSetId)?.name ?? '—'],
                            ['Scenario', SCENARIO_LABELS[wizard.valuationScenario] ?? wizard.valuationScenario],
                            ['Valuation Currency', wizard.valuationCurrency],
                            ['FX Source', wizard.exchangeRateSource],
                            ['FX Label', wizard.fxSnapshotName || '—'],
                            ['Warehouse Filter', wizard.warehouseFilter === 'all' ? 'All warehouses' : `Selected (${Object.values(wizard.warehouseFilters).filter(w => !w.included).length} excluded)`],
                            ['Exchange Rates', wizard.exchangeRates.filter(r => r.fromCurrency && r.rate).length > 0 ? `${wizard.exchangeRates.filter(r => r.fromCurrency && r.rate).length} rate(s) defined` : 'None'],
                          ].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', gap: '8px' }}>
                              <span style={{ color: D.secondary, minWidth: '130px' }}>{k}:</span>
                              <span style={{ fontWeight: 600, color: D.dark }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {wizard.warehouseFilter === 'selected' && Object.entries(wizard.warehouseFilters).some(([, v]) => !v.included) && (
                        <div style={{ background: '#fff8f8', border: `1px solid #fecaca`, borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
                          <strong style={{ color: D.red }}>Excluded Warehouses:</strong>
                          <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
                            {Object.entries(wizard.warehouseFilters).filter(([, v]) => !v.included).map(([whId, v]) => {
                              const wh = warehouses.find(w => w.id === whId)
                              return <li key={whId} style={{ marginBottom: '4px' }}><strong>{wh?.name ?? whId}</strong>: {v.reason || '(no reason)'}</li>
                            })}
                          </ul>
                        </div>
                      )}

                      {error && (
                        <div style={{ background: '#fef2f2', border: `1px solid #fecaca`, borderRadius: '6px', padding: '10px', fontSize: '13px', color: D.red }}>{error}</div>
                      )}

                      <button onClick={submitWizard} disabled={running || !wizard.snapshotId || !wizard.costSetId}
                        style={{ ...btnStyle(true), padding: '12px 24px', fontSize: '14px', width: '100%', opacity: running || !wizard.snapshotId || !wizard.costSetId ? 0.6 : 1, cursor: running ? 'wait' : 'pointer' }}>
                        {running ? 'Running valuation…' : 'Create & Run Report'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Wizard Footer */}
            {!runResult && (
              <div style={{ padding: '16px 24px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => wizardStep > 1 ? setWizardStep(s => (s - 1) as WizardStep) : setShowWizard(false)}
                  style={{ background: D.card, border: `1px solid ${D.border}`, padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: D.dark }}>
                  {wizardStep === 1 ? 'Cancel' : '← Back'}
                </button>
                {wizardStep < 4 && (
                  <button onClick={() => setWizardStep(s => (s + 1) as WizardStep)}
                    disabled={wizardStep === 1 && (!wizard.snapshotId || !wizard.costSetId || !wizard.valuationCurrency)}
                    style={{ ...btnStyle(true), opacity: wizardStep === 1 && (!wizard.snapshotId || !wizard.costSetId || !wizard.valuationCurrency) ? 0.5 : 1 }}>
                    Next →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

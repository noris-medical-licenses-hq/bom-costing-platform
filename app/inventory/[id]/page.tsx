'use client'
import { useState, useEffect, useCallback } from 'react'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', warning: '#d97706', error: '#dc2626',
  blue: '#1565c0', purple: '#4a148c', redLight: '#FEF2F2',
}

const SNAP_STATUS_COLOR: Record<string, string> = {
  draft: D.secondary, under_review: D.warning, approved: D.success, superseded: D.secondary,
}
const VR_STATUS_COLOR: Record<string, string> = {
  draft: D.secondary, running: D.warning, complete: D.success, approved: D.blue, locked: D.purple, failed: D.error,
}
const SCENARIO_LABELS: Record<string, string> = {
  month_end: 'Month End', audit: 'Audit', management: 'Management', budget: 'Budget', forecast: 'Forecast',
}

type SnapInfo = {
  id: string; snapshot_name: string; snapshot_date: string; snapshot_type: string
  status: string; base_currency: string; line_count: number | null
  cost_set_id: string | null; cost_sets?: { name: string } | null
}
type InvLine = {
  id: string; sku_id: string; quantity: number
  skus: { part_number: string; name: string; sku_type: string; item_cost_type: string | null } | null
  warehouses: { code: string; name: string } | null
}
type VReport = {
  id: string; status: string; valuation_currency: string; valuation_scenario: string
  total_value: number | null; missing_cost_count: number | null; created_at: string
  cost_sets: { name: string } | null
}
type CostBuild = {
  id: string; name: string; default_strategy: string; status: string
  cost_sets: { id: string; name: string; base_currency: string } | null
  sites: { name: string } | null
}

function fmtNum(v: number | null, ccy?: string) {
  if (v == null) return '—'
  const n = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return ccy ? `${ccy} ${n}` : n
}

export default function SnapshotDetailPage({ params }: { params: { id: string } }) {
  const snapshotId = params.id

  const [snap,         setSnap]         = useState<SnapInfo | null>(null)
  const [lines,        setLines]        = useState<InvLine[]>([])
  const [reports,      setReports]      = useState<VReport[]>([])
  const [costBuilds,   setCostBuilds]   = useState<CostBuild[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [showValForm,  setShowValForm]  = useState(false)
  const [creating,     setCreating]     = useState(false)
  const [lineSearch,   setLineSearch]   = useState('')

  // Valuation form state
  const [valBuildId,   setValBuildId]   = useState('')
  const [valCurrency,  setValCurrency]  = useState('EUR')
  const [valScenario,  setValScenario]  = useState('management')
  const [valFxRates,   setValFxRates]   = useState([{ from: 'USD', to: 'EUR', rate: '' }])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [snapRes, linesRes, reportsRes, buildsRes] = await Promise.all([
      fetch(`/api/inventory/${snapshotId}`),
      fetch(`/api/inventory/${snapshotId}/lines?limit=200`),
      fetch(`/api/valuation-reports?snapshotId=${snapshotId}`),
      fetch('/api/cost-builds'),
    ])
    const [snapJson, linesJson, reportsJson, buildsJson] = await Promise.all([
      snapRes.json(), linesRes.json(), reportsRes.json(), buildsRes.json(),
    ])
    setLoading(false)
    if (!snapRes.ok) { setError(snapJson.error ?? 'Snapshot not found'); return }
    setSnap(snapJson.data)
    setLines(linesJson.data ?? [])
    setReports(reportsJson.data ?? [])
    // Only show builds that have a frozen cost set (complete, approved, or locked)
    const usable = (buildsJson.data ?? []).filter((b: any) =>
      ['complete', 'approved', 'locked'].includes(b.status)
    )
    setCostBuilds(usable)
  }, [snapshotId])

  useEffect(() => { load() }, [load])

  async function createValuation(e: React.FormEvent) {
    e.preventDefault(); setCreating(true); setError(null)
    const build = costBuilds.find(b => b.id === valBuildId)
    if (!build?.cost_sets?.id) { setError('Selected Cost Build has no frozen Cost Set'); setCreating(false); return }

    const fxRates = valFxRates.filter(r => r.from && r.to && r.rate && r.from !== r.to)
    const payload = {
      snapshotId:         snapshotId,
      costSetId:          build.cost_sets.id,
      valuationCurrency:  valCurrency,
      valuationScenario:  valScenario,
      exchangeRateSource: fxRates.length > 0 ? 'manual' : 'stored',
      warehouseFilter:    'all',
      exchangeRates:      fxRates.map(r => ({ fromCurrency: r.from.toUpperCase(), toCurrency: r.to.toUpperCase(), rate: parseFloat(r.rate) })),
      warehouseFilters:   [],
    }
    const res = await fetch('/api/valuation-reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    setCreating(false)
    if (!res.ok) { setError(json.error ?? 'Failed to create report'); return }
    setShowValForm(false)
    load()
  }

  const filteredLines = lines.filter(l => {
    const q = lineSearch.toLowerCase()
    return !q || (l.skus?.part_number ?? '').toLowerCase().includes(q) || (l.skus?.name ?? '').toLowerCase().includes(q)
  })

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: D.secondary }}>Loading snapshot…</div>
  if (!snap) return (
    <div style={{ padding: '40px', textAlign: 'center', color: D.error }}>
      {error ?? 'Snapshot not found.'}
      <div style={{ marginTop: '12px' }}>
        <a href="/inventory" style={{ color: D.red, textDecoration: 'none', fontWeight: 600 }}>← Back to Inventory</a>
      </div>
    </div>
  )

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '16px', fontSize: '13px', color: D.secondary }}>
        <a href="/inventory" style={{ color: D.red, textDecoration: 'none' }}>Inventory</a>
        {' → '}
        <span style={{ color: D.dark }}>{snap.snapshot_name}</span>
      </div>

      {/* Snapshot header */}
      <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '20px 24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: '0 0 6px' }}>{snap.snapshot_name}</h1>
            <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: D.secondary, flexWrap: 'wrap' }}>
              <span>Date: <strong style={{ color: D.dark }}>{snap.snapshot_date}</strong></span>
              <span>Type: <strong style={{ color: D.dark }}>{snap.snapshot_type}</strong></span>
              <span>Currency: <strong style={{ color: D.dark }}>{snap.base_currency}</strong></span>
              <span>Lines: <strong style={{ color: D.dark }}>{(snap.line_count ?? lines.length).toLocaleString()}</strong></span>
              <span>Status: <strong style={{ color: SNAP_STATUS_COLOR[snap.status] ?? D.secondary }}>{snap.status}</strong></span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {snap.cost_sets && (
              <div style={{ fontSize: '12px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '6px', padding: '6px 12px', color: D.blue }}>
                Cost Set: <strong>{snap.cost_sets.name}</strong>
              </div>
            )}
            <a
              href={`/api/inventory/${snapshotId}/export-issues`}
              download
              style={{ fontSize: '12px', color: '#666666', background: '#F8F9FA', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '6px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              Export Issues .xlsx
            </a>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: D.redLight, border: `1px solid ${D.error}`, borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: D.error }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>

        {/* Left: Inventory Lines */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: D.dark, margin: 0 }}>
              Inventory Lines ({filteredLines.length.toLocaleString()})
            </h2>
            <input
              value={lineSearch}
              onChange={e => setLineSearch(e.target.value)}
              placeholder="Search part number…"
              style={{ padding: '6px 10px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '13px', width: '200px', background: D.bg }}
            />
          </div>
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, background: D.bg, zIndex: 1 }}>
                  <tr style={{ borderBottom: `1px solid ${D.border}` }}>
                    {['Part Number', 'Name', 'Warehouse', 'Type', 'Quantity'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: D.secondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: D.secondary }}>
                      {lines.length === 0 ? 'No inventory lines in this snapshot.' : 'No lines match search.'}
                    </td></tr>
                  ) : filteredLines.map((line, i) => (
                    <tr key={line.id} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? D.card : D.bg }}>
                      <td style={{ padding: '7px 14px', fontFamily: 'monospace', color: D.dark }}>{line.skus?.part_number ?? '—'}</td>
                      <td style={{ padding: '7px 14px', color: D.secondary }}>{line.skus?.name ?? '—'}</td>
                      <td style={{ padding: '7px 14px', fontSize: '12px', color: D.secondary }}>{line.warehouses?.code ?? '—'}</td>
                      <td style={{ padding: '7px 14px', fontSize: '11px', fontWeight: 700, color: D.secondary }}>{line.skus?.item_cost_type ?? line.skus?.sku_type ?? '—'}</td>
                      <td style={{ padding: '7px 14px', fontFamily: 'monospace', textAlign: 'right' }}>{Number(line.quantity).toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lines.length > 200 && (
              <div style={{ padding: '8px 14px', borderTop: `1px solid ${D.border}`, fontSize: '12px', color: D.secondary }}>
                Showing first 200 lines.
              </div>
            )}
          </div>
        </div>

        {/* Right: Valuation Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Valuation Reports */}
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: D.dark }}>Valuation Reports</span>
              <button
                onClick={() => { setShowValForm(!showValForm); setError(null) }}
                style={{ fontSize: '12px', fontWeight: 600, color: showValForm ? D.secondary : D.red, background: 'none', border: `1px solid ${showValForm ? D.border : D.red}`, padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}
              >
                {showValForm ? 'Cancel' : '+ New Valuation'}
              </button>
            </div>

            {/* Inline new valuation form */}
            {showValForm && (
              <form onSubmit={createValuation} style={{ padding: '16px', borderBottom: `1px solid ${D.border}`, background: '#F9FAFB' }}>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '3px' }}>Cost Build *</label>
                  <select value={valBuildId} onChange={e => setValBuildId(e.target.value)} required style={{ width: '100%', padding: '6px 8px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '12px', background: D.card }}>
                    <option value="">— select an approved or completed Cost Build —</option>
                    {costBuilds.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.sites?.name ?? '?'} / {b.name} [{b.cost_sets?.name ?? 'no cost set'}]
                      </option>
                    ))}
                  </select>
                  {costBuilds.length === 0 && (
                    <div style={{ fontSize: '11px', color: D.warning, marginTop: '4px' }}>
                      No approved Cost Builds found for any site. <a href="/cost-builds" style={{ color: D.red }}>Create and approve one →</a>
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '3px' }}>Scenario</label>
                    <select value={valScenario} onChange={e => setValScenario(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '12px', background: D.card }}>
                      {Object.entries(SCENARIO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '3px' }}>Currency</label>
                    <input value={valCurrency} onChange={e => setValCurrency(e.target.value.toUpperCase())} maxLength={3} style={{ width: '100%', padding: '6px 8px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '12px', background: D.card, boxSizing: 'border-box' }} placeholder="EUR" />
                  </div>
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '3px' }}>FX Rate (optional)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr auto 2fr auto 2fr', gap: '4px', alignItems: 'center' }}>
                    <input value={valFxRates[0].from} onChange={e => setValFxRates([{ ...valFxRates[0], from: e.target.value.toUpperCase() }])} style={{ padding: '5px 6px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} placeholder="USD" maxLength={3} />
                    <span style={{ fontSize: '11px', color: D.secondary, textAlign: 'center' }}>→</span>
                    <input value={valFxRates[0].to} onChange={e => setValFxRates([{ ...valFxRates[0], to: e.target.value.toUpperCase() }])} style={{ padding: '5px 6px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} placeholder="EUR" maxLength={3} />
                    <span style={{ fontSize: '11px', color: D.secondary }}>=</span>
                    <input value={valFxRates[0].rate} onChange={e => setValFxRates([{ ...valFxRates[0], rate: e.target.value }])} type="number" step="0.0001" style={{ padding: '5px 6px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} placeholder="0.9200" />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={creating || !valBuildId}
                  style={{ width: '100%', background: D.red, color: '#fff', border: 'none', padding: '8px', borderRadius: '4px', cursor: (creating || !valBuildId) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, opacity: (creating || !valBuildId) ? 0.6 : 1 }}
                >
                  {creating ? 'Running…' : 'Create & Run Valuation'}
                </button>
              </form>
            )}

            {/* Reports list */}
            {reports.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: D.secondary }}>
                No valuation reports yet.
              </div>
            ) : (
              reports.map(r => (
                <div key={r.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${D.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: D.dark }}>{SCENARIO_LABELS[r.valuation_scenario] ?? r.valuation_scenario}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: VR_STATUS_COLOR[r.status] ?? D.secondary, textTransform: 'uppercase' }}>{r.status}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: D.secondary, marginBottom: '4px' }}>
                    {r.cost_sets?.name ?? '—'} · {r.valuation_currency}
                  </div>
                  {r.total_value != null && (
                    <div style={{ fontSize: '14px', fontWeight: 700, color: D.dark, fontFamily: 'monospace', marginBottom: '4px' }}>
                      {r.valuation_currency} {fmtNum(r.total_value)}
                    </div>
                  )}
                  {(r.missing_cost_count ?? 0) > 0 && (
                    <div style={{ fontSize: '11px', color: D.error }}>⚠ {r.missing_cost_count} missing costs</div>
                  )}
                  <div style={{ marginTop: '6px' }}>
                    <a href={`/valuation-reports/${r.id}`} style={{ fontSize: '12px', color: D.red, fontWeight: 600, textDecoration: 'none' }}>View full report →</a>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Available Cost Builds */}
          {costBuilds.length > 0 && (
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${D.border}`, fontSize: '13px', fontWeight: 700, color: D.dark }}>
                Available Cost Builds
              </div>
              {costBuilds.slice(0, 5).map(b => (
                <div key={b.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${D.border}`, fontSize: '12px' }}>
                  <div style={{ fontWeight: 600, color: D.dark, marginBottom: '2px' }}>{b.name}</div>
                  <div style={{ color: D.secondary }}>
                    {b.sites?.name ?? '—'} · {b.default_strategy.replace(/_/g, ' ')}
                  </div>
                  {b.cost_sets && (
                    <div style={{ color: D.secondary, marginTop: '2px' }}>Cost Set: {b.cost_sets.name}</div>
                  )}
                </div>
              ))}
              {costBuilds.length > 5 && (
                <div style={{ padding: '8px 16px', fontSize: '12px', color: D.secondary }}>
                  + {costBuilds.length - 5} more. <a href="/cost-builds" style={{ color: D.red }}>View all →</a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  green: '#2e7d32', amber: '#e65100',
}

const STATUS_COLORS: Record<string, string> = {
  draft: D.secondary, running: D.amber, complete: D.green,
  approved: '#1565c0', locked: '#4a148c', failed: D.red,
}

const SCENARIO_LABELS: Record<string, string> = {
  month_end: 'Month End', audit: 'Audit', management: 'Management',
  budget: 'Budget', forecast: 'Forecast',
}

type Report = {
  id: string
  valuation_currency: string
  valuation_scenario: string
  exchange_rate_source: string
  fx_snapshot_name: string | null
  warehouse_filter: string
  status: string
  total_value: number | null
  line_count: number | null
  missing_cost_count: number | null
  notes: string | null
  approved_at: string | null
  created_at: string
  completed_at: string | null
  parameters_snapshot: Record<string, unknown> | null
  inventory_snapshots: { snapshot_name: string; snapshot_date: string; base_currency: string }
  cost_sets: { name: string; base_currency: string }
  profiles: { full_name: string; email: string }
  approved_profile: { full_name: string; email: string } | null
  exchangeRates: Array<{ from_currency: string; to_currency: string; rate: number; source: string }>
  warehouseFilters: Array<{ warehouse_id: string; included: boolean; exclusion_reason: string | null; warehouses: { code: string; name: string } }>
  lines: Array<{
    id: string; quantity: number; source_currency: string
    unit_cost_source_currency: number | null
    exchange_rate_used: number
    unit_cost_valuation_currency: number | null
    line_total_valuation_currency: number | null
    cost_source: string; has_missing_cost: boolean; notes: string | null
    skus: { part_number: string; name: string }
    warehouses: { code: string; name: string } | null
  }>
  linesTotal:      number
  linesPage:       number
  linesPageSize:   number
  linesTotalPages: number
}

export default function ValuationReportDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [report, setReport]       = useState<Report | null>(null)
  const [loading, setLoading]     = useState(true)
  const [linesLoading, setLinesLoading] = useState(false)
  const [linesPage, setLinesPage] = useState(1)
  const [error, setError]         = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const loadLines = useCallback(async (page: number) => {
    if (!report) return
    setLinesLoading(true)
    const res  = await fetch(`/api/valuation-reports/${id}?page=${page}&pageSize=500`)
    const json = await res.json()
    setLinesLoading(false)
    if (res.ok) {
      setReport(prev => prev ? {
        ...prev,
        lines:           json.data.lines,
        linesTotal:      json.data.linesTotal,
        linesPage:       json.data.linesPage,
        linesTotalPages: json.data.linesTotalPages,
      } : null)
      setLinesPage(page)
    }
  }, [id, report])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/valuation-reports/${id}?page=1&pageSize=500`)
    const json = await res.json()
    setLoading(false)
    if (res.ok) { setReport(json.data); setLinesPage(1) }
    else setError(json.error)
  }, [id])

  useEffect(() => { load() }, [load])

  async function doAction(action: 'approve' | 'lock') {
    setActionLoading(true)
    setError(null)
    const res = await fetch(`/api/valuation-reports/${id}/${action}`, { method: 'POST' })
    const json = await res.json()
    setActionLoading(false)
    if (res.ok) load()
    else setError(json.error)
  }

  function fmtNum(v: number | null, decimals = 2) {
    if (v == null) return '—'
    return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }

  if (loading) return <p style={{ color: D.secondary, fontSize: '14px' }}>Loading report...</p>
  if (error) return <div style={{ color: D.red, background: '#fef2f2', border: `1px solid #fecaca`, borderRadius: '8px', padding: '16px' }}>{error}</div>
  if (!report) return null

  const ccy = report.valuation_currency
  const totalFmt = report.total_value != null ? `${ccy} ${fmtNum(report.total_value)}` : '—'
  const statusColor = STATUS_COLORS[report.status] ?? D.secondary
  const excludedWarehouses = report.warehouseFilters.filter(w => !w.included)

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '12px', color: D.secondary, marginBottom: '4px' }}>
            <a href="/inventory" style={{ color: D.secondary, textDecoration: 'none' }}>Inventory</a>
            {' / '}
            <span style={{ color: D.dark }}>Valuation Report</span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>
            {report.inventory_snapshots.snapshot_name} — {SCENARIO_LABELS[report.valuation_scenario] ?? report.valuation_scenario}
          </h1>
          <div style={{ marginTop: '6px', fontSize: '13px', color: D.secondary }}>
            {report.inventory_snapshots.snapshot_date} · Cost Set: {report.cost_sets.name} · Currency: <strong>{ccy}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: statusColor, background: `${statusColor}15`, border: `1px solid ${statusColor}40`, padding: '4px 10px', borderRadius: '20px' }}>
            {report.status.toUpperCase()}
          </span>
          {report.status === 'complete' && (
            <button onClick={() => doAction('approve')} disabled={actionLoading}
              style={{ background: '#1565c0', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              Approve
            </button>
          )}
          {report.status === 'approved' && (
            <button onClick={() => doAction('lock')} disabled={actionLoading}
              style={{ background: '#4a148c', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              Lock
            </button>
          )}
          {['complete', 'approved', 'locked'].includes(report.status) && (
            <a href={`/api/valuation-reports/${id}/export`}
              style={{ background: D.card, color: D.dark, border: `1px solid ${D.border}`, padding: '7px 16px', borderRadius: '6px', fontSize: '13px', textDecoration: 'none', fontWeight: 500 }}>
              Export CSV
            </a>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: `1px solid #fecaca`, borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '14px', color: D.red }}>{error}</div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Value', value: totalFmt, color: D.dark },
          { label: 'Lines Valued', value: String(report.line_count ?? 0), color: D.dark },
          { label: 'Missing Costs', value: String(report.missing_cost_count ?? 0), color: (report.missing_cost_count ?? 0) > 0 ? D.red : D.green },
          { label: 'Run Time', value: report.parameters_snapshot?.durationMs != null ? `${report.parameters_snapshot.durationMs}ms` : '—', color: D.secondary },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '12px', color: D.secondary, marginTop: '4px' }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Parameters */}
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginTop: 0, marginBottom: '14px', color: D.dark }}>Parameters</h3>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['Scenario', SCENARIO_LABELS[report.valuation_scenario] ?? report.valuation_scenario],
                ['Valuation Currency', ccy],
                ['FX Source', report.exchange_rate_source],
                ['FX Snapshot Label', report.fx_snapshot_name ?? '—'],
                ['Warehouse Filter', report.warehouse_filter === 'all' ? 'All warehouses' : 'Selected warehouses'],
                ['Created', new Date(report.created_at).toLocaleString()],
                ['Completed', report.completed_at ? new Date(report.completed_at).toLocaleString() : '—'],
                ['Approved', report.approved_at ? new Date(report.approved_at).toLocaleString() : '—'],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom: `1px solid ${D.border}` }}>
                  <td style={{ padding: '6px 0', color: D.secondary, width: '45%' }}>{k}</td>
                  <td style={{ padding: '6px 0', color: D.dark, fontWeight: 500 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Exchange Rates */}
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginTop: 0, marginBottom: '14px', color: D.dark }}>Exchange Rates Used</h3>
          {report.exchangeRates.length === 0 ? (
            <p style={{ fontSize: '13px', color: D.secondary }}>No FX conversion required (single currency)</p>
          ) : (
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${D.border}` }}>
                  <th style={{ textAlign: 'left', padding: '4px 0', color: D.secondary, fontWeight: 600 }}>From</th>
                  <th style={{ textAlign: 'left', padding: '4px 0', color: D.secondary, fontWeight: 600 }}>To</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', color: D.secondary, fontWeight: 600 }}>Rate</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: D.secondary, fontWeight: 600 }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {report.exchangeRates.map((fx, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${D.border}` }}>
                    <td style={{ padding: '6px 0', fontWeight: 600 }}>{fx.from_currency}</td>
                    <td style={{ padding: '6px 0', fontWeight: 600 }}>{fx.to_currency}</td>
                    <td style={{ padding: '6px 0', fontFamily: 'monospace', textAlign: 'right' }}>{fx.rate}</td>
                    <td style={{ padding: '6px 8px', color: D.secondary }}>{fx.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {excludedWarehouses.length > 0 && (
            <>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginTop: '20px', marginBottom: '10px', color: D.dark }}>Excluded Warehouses</h3>
              {excludedWarehouses.map(w => (
                <div key={w.warehouse_id} style={{ background: '#fff8f8', border: `1px solid #fecaca`, borderRadius: '6px', padding: '8px 12px', marginBottom: '6px', fontSize: '13px' }}>
                  <strong>{w.warehouses?.name ?? w.warehouse_id}</strong>
                  <span style={{ color: D.secondary, marginLeft: '8px' }}>— {w.exclusion_reason}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Lines Table */}
      <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: D.dark }}>
            Line Items
            <span style={{ fontWeight: 400, color: D.secondary, marginLeft: '6px', fontSize: '13px' }}>
              ({(report.linesTotal ?? report.line_count ?? 0).toLocaleString()} total
              {(report.linesTotalPages ?? 1) > 1 && ` · page ${linesPage} of ${report.linesTotalPages}`})
            </span>
          </h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {(report.missing_cost_count ?? 0) > 0 && (
              <span style={{ fontSize: '12px', color: D.red, background: '#fef2f2', border: `1px solid #fecaca`, padding: '4px 10px', borderRadius: '12px' }}>
                {report.missing_cost_count} missing costs
              </span>
            )}
            {(report.linesTotalPages ?? 1) > 1 && (
              <>
                <button
                  onClick={() => loadLines(linesPage - 1)}
                  disabled={linesPage <= 1 || linesLoading}
                  style={{ padding: '4px 10px', fontSize: '12px', border: `1px solid ${D.border}`, borderRadius: '5px', background: D.bg, cursor: 'pointer', opacity: linesPage <= 1 ? 0.5 : 1 }}
                >← Prev</button>
                <button
                  onClick={() => loadLines(linesPage + 1)}
                  disabled={linesPage >= (report.linesTotalPages ?? 1) || linesLoading}
                  style={{ padding: '4px 10px', fontSize: '12px', border: `1px solid ${D.border}`, borderRadius: '5px', background: D.bg, cursor: 'pointer', opacity: linesPage >= (report.linesTotalPages ?? 1) ? 0.5 : 1 }}
                >Next →</button>
              </>
            )}
          </div>
        </div>
        {linesLoading && (
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${D.border}`, fontSize: '12px', color: D.secondary }}>Loading lines…</div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                {['Part #', 'Description', 'Warehouse', 'Qty', 'Source Ccy', 'Unit Cost (Src)', 'FX Rate', `Unit Cost (${ccy})`, `Line Total (${ccy})`, 'Cost Source', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: h === '' || h.includes('Cost') || h.includes('Total') || h === 'Qty' || h === 'FX Rate' ? 'right' : 'left', fontWeight: 600, color: D.secondary, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.lines.length === 0 ? (
                <tr><td colSpan={11} style={{ padding: '20px', textAlign: 'center', color: D.secondary }}>No lines</td></tr>
              ) : report.lines.map(line => (
                <tr key={line.id} style={{ borderBottom: `1px solid ${D.border}`, background: line.has_missing_cost ? '#fff8f8' : undefined }}>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 600, color: D.dark }}>{line.skus?.part_number}</td>
                  <td style={{ padding: '9px 12px', color: D.dark, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.skus?.name}</td>
                  <td style={{ padding: '9px 12px', color: D.secondary }}>{line.warehouses?.name ?? line.warehouses?.code ?? '—'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>{fmtNum(line.quantity, 0)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: D.secondary }}>{line.source_currency}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', textAlign: 'right' }}>{fmtNum(line.unit_cost_source_currency)}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', textAlign: 'right', color: D.secondary }}>{line.exchange_rate_used}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', textAlign: 'right' }}>{fmtNum(line.unit_cost_valuation_currency)}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', textAlign: 'right', fontWeight: 600 }}>{fmtNum(line.line_total_valuation_currency)}</td>
                  <td style={{ padding: '9px 12px', color: D.secondary, fontSize: '11px' }}>{line.cost_source}</td>
                  <td style={{ padding: '9px 12px' }}>
                    {line.has_missing_cost && <span style={{ color: D.red, fontSize: '11px', fontWeight: 600 }}>MISSING</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {report.notes && (
        <div style={{ marginTop: '16px', background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '16px', fontSize: '13px', color: D.secondary }}>
          <strong style={{ color: D.dark }}>Notes: </strong>{report.notes}
        </div>
      )}
    </div>
  )
}

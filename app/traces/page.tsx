'use client'
import { useState } from 'react'

type TraceHeader = {
  id: string
  bom_version_id: string
  cost_set_id: string
  valuation_date: string
  total_unit_cost: number
  currency: string
  engine_version: string
  has_warnings: boolean
  warning_count: number
  missing_cost_count: number
  duration_ms: number
  created_at: string
  created_by: string | null
}

type TraceLine = {
  id: string
  sku_id: string | null
  depth: number
  quantity: number
  resolved_unit_cost: number | null
  adjusted_unit_cost: number | null
  line_total: number | null
  cost_source_type: string | null
  has_missing_cost: boolean
  warnings: unknown
}

type RuleExecTrace = {
  id: string
  cost_rule_id: string
  rule_name_snapshot: string
  condition_result: boolean
  was_applied: boolean
  value_before: number | null
  value_after: number | null
  delta: number | null
}

const SOURCE_COLORS: Record<string, string> = {
  manual_adjustment: '#6a1b9a',
  cost_set_item_sku: '#1565c0',
  cost_set_item_subfamily: '#1976d2',
  cost_set_item_family: '#0288d1',
  cost_set_item_supplier: '#0277bd',
  cost_set_item_global: '#01579b',
  supplier_price: '#558b2f',
  none: '#c62828',
}

export default function TracesPage() {
  const [traceId, setTraceId] = useState('')
  const [header, setHeader] = useState<TraceHeader | null>(null)
  const [lines, setLines] = useState<TraceLine[]>([])
  const [ruleTraces, setRuleTraces] = useState<RuleExecTrace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadTrace() {
    if (!traceId.trim()) return
    setLoading(true)
    setError(null)
    setHeader(null)
    setLines([])
    setRuleTraces([])

    const [hRes, lRes, rRes] = await Promise.all([
      fetch(`/api/traces/${traceId}`),
      fetch(`/api/traces/${traceId}/lines`),
      fetch(`/api/traces/${traceId}/rules`),
    ])

    const [hJson, lJson, rJson] = await Promise.all([hRes.json(), lRes.json(), rRes.json()])
    setLoading(false)

    if (!hRes.ok) { setError(hJson.error ?? 'Trace not found'); return }
    setHeader(hJson.data)
    setLines(lJson.data ?? [])
    setRuleTraces(rJson.data ?? [])
  }

  const appliedRules = ruleTraces.filter(r => r.was_applied)

  return (
    <div>
      <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>Calculation Trace Viewer</h1>

      {error && <div style={{ background: '#fee', border: '1px solid #fcc', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px', color: '#c00' }}>{error}</div>}

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', gap: '12px' }}>
        <input
          type="text"
          placeholder="Paste Trace ID (UUID from a calculation result)..."
          value={traceId}
          onChange={e => setTraceId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadTrace()}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace' }}
        />
        <button onClick={loadTrace} disabled={loading || !traceId} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
          {loading ? 'Loading...' : 'Load Trace'}
        </button>
      </div>

      {header && (
        <>
          {/* Summary */}
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e' }}>{header.currency} {header.total_unit_cost.toFixed(4)}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>Unit Cost · {header.valuation_date} · {header.duration_ms}ms · v{header.engine_version}</div>
              </div>
              {header.has_warnings && (
                <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '6px', padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#e65100' }}>{header.warning_count}</div>
                  <div style={{ fontSize: '11px', color: '#e65100' }}>Warnings</div>
                  {header.missing_cost_count > 0 && <div style={{ fontSize: '11px', color: '#c62828', marginTop: '4px' }}>{header.missing_cost_count} missing costs</div>}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
              <div><span style={{ color: '#888' }}>BOM Version: </span><code style={{ background: '#f5f5f5', padding: '1px 4px', borderRadius: '2px' }}>{header.bom_version_id}</code></div>
              <div><span style={{ color: '#888' }}>Cost Set: </span><code style={{ background: '#f5f5f5', padding: '1px 4px', borderRadius: '2px' }}>{header.cost_set_id}</code></div>
              <div><span style={{ color: '#888' }}>Trace ID: </span><code style={{ background: '#f5f5f5', padding: '1px 4px', borderRadius: '2px' }}>{header.id}</code></div>
              <div><span style={{ color: '#888' }}>Calculated: </span>{new Date(header.created_at).toLocaleString('de-DE')}</div>
            </div>
          </div>

          {/* BOM breakdown table */}
          {lines.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', background: '#f8f8f8', fontSize: '13px', fontWeight: 600 }}>
                BOM Cost Breakdown ({lines.length} lines)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8f8f8', borderBottom: '1px solid #e0e0e0' }}>
                    {['Depth', 'SKU', 'Qty', 'Unit Cost', 'Adjusted', 'Line Total', 'Source'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#444' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => (
                    <tr key={line.id} style={{ borderBottom: '1px solid #f0f0f0', background: line.has_missing_cost ? '#fff8e1' : undefined }}>
                      <td style={{ padding: '8px 12px', color: '#888' }}>{'···'.repeat(Math.max(0, line.depth - 1))}L{line.depth}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 500 }}>{line.sku_id?.slice(0, 8) ?? '—'}</td>
                      <td style={{ padding: '8px 12px' }}>{line.quantity}</td>
                      <td style={{ padding: '8px 12px' }}>{line.resolved_unit_cost != null ? line.resolved_unit_cost.toFixed(4) : '—'}</td>
                      <td style={{ padding: '8px 12px' }}>{line.adjusted_unit_cost != null ? line.adjusted_unit_cost.toFixed(4) : '—'}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{line.line_total != null ? line.line_total.toFixed(4) : '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {line.cost_source_type ? (
                          <span style={{ background: SOURCE_COLORS[line.cost_source_type] ?? '#888', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>
                            {line.cost_source_type.replace('cost_set_item_', '')}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Rules evaluated */}
          {ruleTraces.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', background: '#f8f8f8', fontSize: '13px', fontWeight: 600 }}>
                Rule Evaluations ({ruleTraces.length} evaluated, {appliedRules.length} applied)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8f8f8', borderBottom: '1px solid #e0e0e0' }}>
                    {['Rule', 'Conditions', 'Applied', 'Before', 'After', 'Δ'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#444' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ruleTraces.map(rt => (
                    <tr key={rt.id} style={{ borderBottom: '1px solid #f0f0f0', background: rt.was_applied ? '#f1f8e9' : undefined }}>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{rt.rule_name_snapshot}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ color: rt.condition_result ? '#2e7d32' : '#c62828', fontWeight: 500 }}>{rt.condition_result ? '✓ Met' : '✗ Not met'}</span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ color: rt.was_applied ? '#2e7d32' : '#888' }}>{rt.was_applied ? '✓' : '—'}</span>
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{rt.value_before != null ? rt.value_before.toFixed(4) : '—'}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{rt.value_after != null ? rt.value_after.toFixed(4) : '—'}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: (rt.delta ?? 0) > 0 ? '#2e7d32' : (rt.delta ?? 0) < 0 ? '#c62828' : '#888' }}>
                        {rt.delta != null ? `${rt.delta > 0 ? '+' : ''}${rt.delta.toFixed(4)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lines.length === 0 && ruleTraces.length === 0 && (
            <p style={{ color: '#888', fontSize: '14px', padding: '16px 0' }}>Trace header found but no detail lines available. This may be a summary-level trace.</p>
          )}
        </>
      )}
    </div>
  )
}

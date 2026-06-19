'use client'
import { useState } from 'react'

type Finding = {
  rule_code: string
  severity: 'error' | 'warning' | 'info'
  entity_type: string
  entity_id: string | null
  message: string
  suggested_fix: string | null
}

type ValidationResult = {
  runId: string
  errorCount: number
  warningCount: number
  infoCount: number
  findings: Finding[]
  autoResolvedCount: number
}

const SCOPE_TYPES = ['bom_version', 'sku', 'cost_set', 'rule', 'inventory_snapshot']
const RUN_TYPES = ['on_demand', 'pre_calculation', 'pre_approval', 'scheduled']
const SEVERITY_COLORS: Record<string, string> = { error: '#c62828', warning: '#e65100', info: '#1565c0' }
const SEVERITY_BG: Record<string, string> = { error: '#ffebee', warning: '#fff8e1', info: '#e3f2fd' }

export default function ValidationPage() {
  const [scopeType, setScopeType] = useState('bom_version')
  const [scopeId, setScopeId] = useState('')
  const [runType, setRunType] = useState('on_demand')
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterSeverity, setFilterSeverity] = useState<string>('all')

  async function runValidation() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope_type: scopeType, scope_id: scopeId || null, run_type: runType }),
    })
    const json = await res.json()
    setLoading(false)
    if (res.ok) setResult(json.data)
    else setError(json.error)
  }

  const filtered = result?.findings.filter(f => filterSeverity === 'all' || f.severity === filterSeverity) ?? []

  return (
    <div>
      <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>Validation Center</h1>

      {error && <div style={{ background: '#fee', border: '1px solid #fcc', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px', color: '#c00' }}>{error}</div>}

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, fontSize: '15px' }}>Run Validation</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Scope Type</label>
            <select value={scopeType} onChange={e => setScopeType(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}>
              {SCOPE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Run Type</label>
            <select value={runType} onChange={e => setRunType(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}>
              {RUN_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Scope ID (UUID)</label>
            <input type="text" placeholder="Leave blank for org-wide..." value={scopeId} onChange={e => setScopeId(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
          </div>
        </div>
        <button onClick={runValidation} disabled={loading} style={{ background: '#C62839', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600 }}>
          {loading ? 'Running...' : 'Run Validation'}
        </button>
      </div>

      {result && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Errors', value: result.errorCount, color: '#c62828', bg: '#ffebee' },
              { label: 'Warnings', value: result.warningCount, color: '#e65100', bg: '#fff8e1' },
              { label: 'Info', value: result.infoCount, color: '#1565c0', bg: '#e3f2fd' },
              { label: 'Auto-resolved', value: result.autoResolvedCount, color: '#2e7d32', bg: '#e6f4ea' },
            ].map(stat => (
              <div key={stat.label} style={{ background: stat.bg, border: `1px solid ${stat.color}22`, borderRadius: '8px', padding: '16px' }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: '12px', color: stat.color, marginTop: '4px' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {(['all', 'error', 'warning', 'info'] as const).map(s => (
              <button key={s} onClick={() => setFilterSeverity(s)} style={{ padding: '5px 14px', border: '1px solid #ccc', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', background: filterSeverity === s ? '#1a1a2e' : '#fff', color: filterSeverity === s ? '#fff' : '#444' }}>
                {s === 'all' ? `All (${result.findings.length})` : `${s} (${result.findings.filter(f => f.severity === s).length})`}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ background: '#e6f4ea', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '20px', textAlign: 'center', color: '#2e7d32', fontSize: '14px' }}>
              {result.findings.length === 0 ? '✓ All validation checks passed' : 'No findings match the selected filter'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map((f, i) => (
                <div key={i} style={{ background: SEVERITY_BG[f.severity], border: `1px solid ${SEVERITY_COLORS[f.severity]}33`, borderRadius: '6px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ background: SEVERITY_COLORS[f.severity], color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{f.severity.toUpperCase()}</span>
                      <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '3px', fontSize: '11px' }}>{f.rule_code}</code>
                      <span style={{ fontSize: '12px', color: '#666' }}>{f.entity_type}{f.entity_id ? ` · ${f.entity_id.slice(0, 8)}...` : ''}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', color: '#333', marginBottom: f.suggested_fix ? '6px' : 0 }}>{f.message}</div>
                  {f.suggested_fix && (
                    <div style={{ fontSize: '12px', color: '#555', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '6px', marginTop: '6px' }}>
                      <span style={{ fontWeight: 600 }}>Fix: </span>{f.suggested_fix}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'
import { useState } from 'react'

type BomResult = {
  bom: { id: string; sku_id: string }
  version: { id: string; version_number: number; status: string }
}

type CalcResult = {
  traceId: string
  totalUnitCost: number
  currency: string
  durationMs: number
  warnings: { code: string; message: string }[]
  breakdown: {
    bomLineId: string
    skuId: string | null
    partNumber: string | null
    name: string
    quantity: number
    unitCost: number
    totalCost: number
    rolledUpCost: number
    depth: number
    costSource: { type: string; value: number | null }
  }[]
}

export default function BomPage() {
  const [skuId, setSkuId] = useState('')
  const [costSetId, setCostSetId] = useState('')
  const [bomResult, setBomResult] = useState<BomResult | null>(null)
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function lookupBom() {
    if (!skuId) return
    setLoading(true)
    setError(null)
    setCalcResult(null)
    const res = await fetch(`/api/boms?sku_id=${skuId}`)
    const json = await res.json()
    setLoading(false)
    if (res.ok && json.data) setBomResult(json.data)
    else if (json.error) setError(json.error)
    else setError('No BOM found for this SKU')
  }

  async function runCalculation() {
    if (!bomResult || !costSetId) return
    setLoading(true)
    setError(null)
    const res = await fetch('/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bom_id: bomResult.bom.id, cost_set_id: costSetId, trace_level: 'detailed' }),
    })
    const json = await res.json()
    setLoading(false)
    if (res.ok) setCalcResult(json.data)
    else setError(json.error)
  }

  return (
    <div>
      <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>BOM Explorer</h1>

      {error && <div style={{ background: '#fee', border: '1px solid #fcc', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px', color: '#c00' }}>{error}</div>}

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, fontSize: '15px' }}>Lookup BOM by SKU ID</h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            placeholder="SKU UUID..."
            value={skuId}
            onChange={e => setSkuId(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace' }}
          />
          <button onClick={lookupBom} disabled={loading || !skuId} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
            {loading ? 'Loading...' : 'Look Up'}
          </button>
        </div>
      </div>

      {bomResult && (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '15px' }}>BOM Found</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', fontSize: '13px' }}>
            <div><span style={{ color: '#888' }}>BOM ID:</span> <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: '3px' }}>{bomResult.bom.id}</code></div>
            <div><span style={{ color: '#888' }}>SKU ID:</span> <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: '3px' }}>{bomResult.bom.sku_id}</code></div>
            <div><span style={{ color: '#888' }}>Version:</span> v{bomResult.version.version_number}</div>
            <div><span style={{ color: '#888' }}>Status:</span> <span style={{ color: bomResult.version.status === 'approved' ? '#2e7d32' : '#888' }}>{bomResult.version.status}</span></div>
          </div>

          <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Calculate Cost</h4>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              placeholder="Cost Set UUID..."
              value={costSetId}
              onChange={e => setCostSetId(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace' }}
            />
            <button onClick={runCalculation} disabled={loading || !costSetId} style={{ background: '#2e7d32', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
              {loading ? 'Calculating...' : 'Calculate Cost'}
            </button>
          </div>
        </div>
      )}

      {calcResult && (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
            <div>
              <h3 style={{ marginTop: 0, fontSize: '15px' }}>Cost Calculation Result</h3>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e' }}>
                {calcResult.currency} {calcResult.totalUnitCost.toFixed(4)}
              </div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                Calculated in {calcResult.durationMs}ms ·{' '}
                <a href={`/traces?id=${calcResult.traceId}`} style={{ color: '#1a1a2e', fontFamily: 'monospace' }}>
                  View trace {calcResult.traceId.slice(0, 8)}...
                </a>
              </div>
            </div>
            {calcResult.warnings.length > 0 && (
              <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '6px', padding: '12px', maxWidth: '300px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#e65100' }}>{calcResult.warnings.length} Warning{calcResult.warnings.length > 1 ? 's' : ''}</div>
                {calcResult.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#555', marginBottom: '4px' }}>{w.message}</div>
                ))}
              </div>
            )}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8f8f8', borderBottom: '1px solid #e0e0e0' }}>
                {['Depth', 'Component', 'Qty', 'Unit Cost', 'Line Total', 'Rolled Cost', 'Source'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#444' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calcResult.breakdown.map(line => (
                <tr key={line.bomLineId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 12px', color: '#888' }}>{'  '.repeat(line.depth)}L{line.depth}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{line.partNumber ?? line.name}</td>
                  <td style={{ padding: '8px 12px' }}>{line.quantity}</td>
                  <td style={{ padding: '8px 12px' }}>{line.unitCost.toFixed(4)}</td>
                  <td style={{ padding: '8px 12px' }}>{line.totalCost.toFixed(4)}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{line.rolledUpCost.toFixed(4)}</td>
                  <td style={{ padding: '8px 12px', fontSize: '11px', color: '#888' }}>{line.costSource.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

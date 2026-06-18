'use client'
import { useState, useEffect } from 'react'

type Snapshot = {
  id: string
  snapshot_name: string
  snapshot_date: string
  snapshot_type: string
  status: string
  total_value: number | null
  total_quantity: number | null
  line_count: number | null
  missing_cost_count: number | null
  base_currency: string
}

type ValuationResult = {
  snapshotId: string
  totalValue: number
  totalQuantity: number
  lineCount: number
  missingCostCount: number
  currency: string
  durationMs: number
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#888',
  under_review: '#e65100',
  approved: '#2e7d32',
  superseded: '#888',
  archived: '#888',
}

export default function InventoryPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [valuationResult, setValuationResult] = useState<ValuationResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    snapshot_name: '',
    snapshot_date: new Date().toISOString().slice(0, 10),
    snapshot_type: 'full',
    cost_set_id: '',
    base_currency: 'EUR',
  })

  async function loadSnapshots() {
    setLoading(true)
    const res = await fetch('/api/inventory')
    const json = await res.json()
    setLoading(false)
    if (res.ok) setSnapshots(json.data ?? [])
  }

  useEffect(() => { loadSnapshots() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (res.ok) {
      setShowForm(false)
      loadSnapshots()
    } else {
      setError(json.error)
    }
  }

  async function runValuation(snapshotId: string) {
    setSelectedId(snapshotId)
    setRunning(true)
    setError(null)
    setValuationResult(null)
    const res = await fetch(`/api/inventory/${snapshotId}/value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const json = await res.json()
    setRunning(false)
    if (res.ok) {
      setValuationResult(json.data)
      loadSnapshots()
    } else {
      setError(json.error)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Inventory Valuation</h1>
        <button onClick={() => setShowForm(!showForm)} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ New Snapshot'}
        </button>
      </div>

      {error && <div style={{ background: '#fee', border: '1px solid #fcc', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px', color: '#c00' }}>{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '15px' }}>Create Inventory Snapshot</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { label: 'Snapshot Name', key: 'snapshot_name', type: 'text' },
              { label: 'Snapshot Date', key: 'snapshot_date', type: 'date' },
              { label: 'Cost Set ID', key: 'cost_set_id', type: 'text' },
              { label: 'Base Currency', key: 'base_currency', type: 'text' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>{label}</label>
                <input type={type} value={form[key as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} required style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Snapshot Type</label>
              <select value={form.snapshot_type} onChange={e => setForm(f => ({ ...f, snapshot_type: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}>
                {['full', 'site', 'warehouse', 'project'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" style={{ marginTop: '16px', background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Create Snapshot</button>
        </form>
      )}

      {valuationResult && (
        <div style={{ background: '#e6f4ea', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '15px', color: '#2e7d32' }}>Valuation Complete</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '13px' }}>
            <div><div style={{ fontSize: '20px', fontWeight: 700 }}>{valuationResult.currency} {valuationResult.totalValue.toFixed(2)}</div><div style={{ color: '#666' }}>Total Value</div></div>
            <div><div style={{ fontSize: '20px', fontWeight: 700 }}>{valuationResult.lineCount}</div><div style={{ color: '#666' }}>Lines</div></div>
            <div><div style={{ fontSize: '20px', fontWeight: 700, color: valuationResult.missingCostCount > 0 ? '#c62828' : '#2e7d32' }}>{valuationResult.missingCostCount}</div><div style={{ color: '#666' }}>Missing Costs</div></div>
            <div><div style={{ fontSize: '20px', fontWeight: 700 }}>{valuationResult.durationMs}ms</div><div style={{ color: '#666' }}>Duration</div></div>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#888', fontSize: '14px' }}>Loading snapshots...</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8f8f8', borderBottom: '1px solid #e0e0e0' }}>
                {['Name', 'Date', 'Type', 'Status', 'Lines', 'Total Value', 'Missing Costs', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#444' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshots.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No snapshots yet</td></tr>
              ) : snapshots.map(snap => (
                <tr key={snap.id} style={{ borderBottom: '1px solid #f0f0f0', background: selectedId === snap.id ? '#f8f9ff' : undefined }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{snap.snapshot_name}</td>
                  <td style={{ padding: '10px 14px', color: '#666' }}>{snap.snapshot_date}</td>
                  <td style={{ padding: '10px 14px', color: '#666' }}>{snap.snapshot_type}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ color: STATUS_COLORS[snap.status] ?? '#888', fontWeight: 500 }}>{snap.status}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>{snap.line_count ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>
                    {snap.total_value != null ? `${snap.base_currency} ${snap.total_value.toFixed(2)}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: (snap.missing_cost_count ?? 0) > 0 ? '#c62828' : '#888' }}>
                    {snap.missing_cost_count ?? '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {snap.status !== 'approved' && (
                      <button onClick={() => runValuation(snap.id)} disabled={running && selectedId === snap.id} style={{ background: '#2e7d32', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        {running && selectedId === snap.id ? 'Running...' : 'Run Valuation'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

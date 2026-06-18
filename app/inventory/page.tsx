'use client'
import { useState, useEffect, useCallback } from 'react'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', warning: '#d97706', error: '#dc2626',
}

const STATUS_COLOR: Record<string, string> = {
  draft: D.secondary, under_review: D.warning, approved: D.success, superseded: D.secondary, archived: D.secondary,
}

type Snapshot = {
  id: string; snapshot_name: string; snapshot_date: string; snapshot_type: string
  status: string; total_value: number | null; total_quantity: number | null
  line_count: number | null; missing_cost_count: number | null; base_currency: string
}
type CostSet = { id: string; name: string; base_currency: string }

export default function InventoryPage() {
  const [snapshots,  setSnapshots]  = useState<Snapshot[]>([])
  const [costSets,   setCostSets]   = useState<CostSet[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [form, setForm] = useState({
    snapshot_name: '', snapshot_date: new Date().toISOString().slice(0, 10),
    snapshot_type: 'full', cost_set_id: '', base_currency: 'EUR',
  })

  const fmtNum = (v: number | null, ccy?: string) =>
    v != null ? `${ccy ? ccy + ' ' : ''}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

  const load = useCallback(async () => {
    setLoading(true)
    const [sRes, csRes] = await Promise.all([
      fetch('/api/inventory'),
      fetch('/api/cost-sets'),
    ])
    const [sJson, csJson] = await Promise.all([sRes.json(), csRes.json()])
    setSnapshots(sJson.data ?? [])
    setCostSets(csJson.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    const res = await fetch('/api/inventory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (res.ok) { setShowCreate(false); load() }
    else setError(json.error)
  }

  const iStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: `1px solid ${D.border}`,
    borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: D.card,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '12px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '4px',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>Inventory Snapshots</h1>
          <p style={{ color: D.secondary, fontSize: '14px', margin: '4px 0 0' }}>
            Open a snapshot to view lines, run valuations, and link to a Cost Build.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setError(null) }}
          style={{ background: showCreate ? D.card : D.red, color: showCreate ? D.dark : '#fff', border: `1px solid ${showCreate ? D.border : D.red}`, padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
        >
          {showCreate ? 'Cancel' : '+ New Snapshot'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: `1px solid ${D.error}`, borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: D.error }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: 700, color: D.dark }}>New Inventory Snapshot</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Snapshot Name *</label>
              <input value={form.snapshot_name} onChange={e => setForm(f => ({ ...f, snapshot_name: e.target.value }))} required style={iStyle} placeholder="e.g. Germany Jun 2026" />
            </div>
            <div>
              <label style={labelStyle}>Date *</label>
              <input type="date" value={form.snapshot_date} onChange={e => setForm(f => ({ ...f, snapshot_date: e.target.value }))} required style={iStyle} />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={form.snapshot_type} onChange={e => setForm(f => ({ ...f, snapshot_type: e.target.value }))} style={iStyle}>
                {['full', 'site', 'warehouse', 'project'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Cost Set *</label>
              <select value={form.cost_set_id} onChange={e => setForm(f => ({ ...f, cost_set_id: e.target.value }))} required style={iStyle}>
                <option value="">— select —</option>
                {costSets.map(cs => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Base Currency</label>
              <input value={form.base_currency} onChange={e => setForm(f => ({ ...f, base_currency: e.target.value.toUpperCase() }))} maxLength={3} style={iStyle} placeholder="EUR" />
            </div>
          </div>
          <button type="submit" style={{ background: D.red, color: '#fff', border: 'none', padding: '8px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
            Create Snapshot
          </button>
        </form>
      )}

      {/* Snapshot list */}
      {loading ? (
        <p style={{ color: D.secondary, fontSize: '14px' }}>Loading…</p>
      ) : (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                {['Name', 'Date', 'Type', 'Status', 'Lines', 'Total Value', 'Missing Costs', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: D.secondary, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: D.secondary }}>
                    No snapshots yet. Click <strong>+ New Snapshot</strong> to create one.
                  </td>
                </tr>
              ) : snapshots.map((snap, i) => (
                <tr key={snap.id} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? D.card : D.bg }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: D.dark }}>{snap.snapshot_name}</td>
                  <td style={{ padding: '10px 14px', color: D.secondary }}>{snap.snapshot_date}</td>
                  <td style={{ padding: '10px 14px', color: D.secondary }}>{snap.snapshot_type}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ color: STATUS_COLOR[snap.status] ?? D.secondary, fontWeight: 500 }}>{snap.status}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>{snap.line_count ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>
                    {fmtNum(snap.total_value, snap.base_currency)}
                  </td>
                  <td style={{ padding: '10px 14px', color: (snap.missing_cost_count ?? 0) > 0 ? D.error : D.secondary }}>
                    {snap.missing_cost_count ?? '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <a href={`/inventory/${snap.id}`} style={{ fontSize: '13px', fontWeight: 600, color: D.red, textDecoration: 'none' }}>
                      Open →
                    </a>
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

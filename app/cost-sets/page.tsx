'use client'
import { useState, useEffect } from 'react'

const D = {
  dark: '#222222', secondary: '#666666', bg: '#F8F9FA', card: '#FFFFFF',
  border: '#E5E7EB', red: '#C62839', success: '#16a34a', warning: '#d97706',
  blue: '#1565c0', blueLight: '#EFF6FF', error: '#dc2626', redLight: '#FEF2F2',
}

// Matches DB enum exactly
const COST_SET_TYPES = ['standard', 'budget', 'quote', 'actual', 'simulation'] as const

type CostSet = {
  id: string
  name: string                // DB field is `name`
  description: string | null
  cost_set_type: typeof COST_SET_TYPES[number]
  base_currency: string
  status: string
  effective_from: string | null   // DB field is `effective_from`
  effective_to: string | null     // DB field is `effective_to`
  is_locked: boolean
  is_default: boolean
  created_at: string
}

type CostItem = {
  id: string
  item_type: string
  scope_type: string
  scope_id: string | null
  value: number
  value_unit: string
  currency: string | null
  effective_from: string | null
  effective_to: string | null
}

const iStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${D.border}`,
  borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: D.card,
}
const labelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '4px',
}

export default function CostSetsPage() {
  const [costSets,    setCostSets]    = useState<CostSet[]>([])
  const [loading,     setLoading]     = useState(true)
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [items,       setItems]       = useState<CostItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [showForm,    setShowForm]    = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [form,        setForm]        = useState({
    name: '',
    description: '',
    cost_set_type: 'standard' as typeof COST_SET_TYPES[number],
    base_currency: 'EUR',
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: '',
  })

  async function loadCostSets() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/cost-sets')
    const json = await res.json()
    setLoading(false)
    if (res.ok) setCostSets(json.data ?? [])
    else setError(json.error ?? 'Failed to load cost sets')
  }

  async function loadItems(id: string) {
    setSelectedId(id)
    setItemsLoading(true)
    const res = await fetch(`/api/cost-sets/${id}/items`)
    const json = await res.json()
    setItemsLoading(false)
    if (res.ok) setItems(json.data ?? [])
  }

  useEffect(() => { loadCostSets() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const body = {
      name: form.name,
      description: form.description || undefined,
      cost_set_type: form.cost_set_type,
      base_currency: form.base_currency.toUpperCase(),
      effective_from: form.effective_from || undefined,
      effective_to: form.effective_to || undefined,
    }
    const res = await fetch('/api/cost-sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    setSubmitting(false)
    if (res.ok) {
      setShowForm(false)
      setForm({ name: '', description: '', cost_set_type: 'standard', base_currency: 'EUR', effective_from: new Date().toISOString().slice(0, 10), effective_to: '' })
      loadCostSets()
    } else {
      setError(json.error ?? (json.details ? JSON.stringify(json.details) : 'Failed to create cost set'))
    }
  }

  const selected = costSets.find(c => c.id === selectedId)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: D.dark }}>Cost Sets</h1>
          <p style={{ fontSize: '13px', color: D.secondary, margin: '4px 0 0' }}>
            Frozen cost snapshots used as input for inventory valuation
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(null) }}
          style={{ background: D.red, color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
        >
          {showForm ? 'Cancel' : '+ New Cost Set'}
        </button>
      </div>

      {error && (
        <div style={{ background: D.redLight, border: `1px solid ${D.error}`, padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px', color: D.error }}>
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '24px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '15px', fontWeight: 700, color: D.dark }}>Create Cost Set</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Name *</label>
              <input style={iStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. DE Cost Set H1 2026" required />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Description</label>
              <input style={iStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>
            <div>
              <label style={labelStyle}>Type *</label>
              <select style={iStyle} value={form.cost_set_type} onChange={e => setForm(f => ({ ...f, cost_set_type: e.target.value as typeof COST_SET_TYPES[number] }))}>
                {COST_SET_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Base Currency *</label>
              <input style={iStyle} value={form.base_currency} onChange={e => setForm(f => ({ ...f, base_currency: e.target.value.toUpperCase() }))} placeholder="EUR" maxLength={3} required />
            </div>
            <div>
              <label style={labelStyle}>Effective From</label>
              <input style={iStyle} type="date" value={form.effective_from} onChange={e => setForm(f => ({ ...f, effective_from: e.target.value })) } />
            </div>
            <div>
              <label style={labelStyle}>Effective To (optional)</label>
              <input style={iStyle} type="date" value={form.effective_to} onChange={e => setForm(f => ({ ...f, effective_to: e.target.value }))} />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting || !form.name}
            style={{ background: submitting ? D.secondary : D.red, color: '#fff', border: 'none', padding: '9px 22px', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600 }}
          >
            {submitting ? 'Creating…' : 'Create Cost Set'}
          </button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '16px' }}>
        {/* List */}
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${D.border}`, fontSize: '12px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.05em', background: D.bg }}>
            Cost Sets
          </div>
          {loading ? (
            <p style={{ padding: '16px', color: D.secondary, fontSize: '13px' }}>Loading…</p>
          ) : costSets.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: D.secondary, marginBottom: '8px' }}>No cost sets yet</div>
              <div style={{ fontSize: '12px', color: D.secondary }}>Create a cost set to store resolved unit costs for inventory valuation.</div>
            </div>
          ) : costSets.map(cs => (
            <div
              key={cs.id}
              onClick={() => loadItems(cs.id)}
              style={{ padding: '12px 14px', borderBottom: `1px solid ${D.border}`, cursor: 'pointer', background: cs.id === selectedId ? D.blueLight : undefined }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', color: D.dark, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {cs.name}
                {cs.is_locked && <span style={{ fontSize: '10px', background: D.secondary, color: '#fff', borderRadius: '3px', padding: '1px 5px' }}>LOCKED</span>}
              </div>
              <div style={{ fontSize: '11px', color: D.secondary, marginTop: '2px' }}>
                {cs.cost_set_type} · {cs.base_currency} · <span style={{ color: cs.status === 'active' ? D.success : D.secondary }}>{cs.status}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
                {cs.effective_from ?? '—'} → {cs.effective_to ?? 'open'}
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div>
          {selected ? (
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${D.border}`, background: D.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: D.dark }}>{selected.name} — Cost Items</span>
                <code style={{ fontSize: '11px', color: D.secondary }}>{selected.id.slice(0, 8)}…</code>
              </div>
              {itemsLoading ? (
                <p style={{ padding: '16px', color: D.secondary, fontSize: '13px' }}>Loading items…</p>
              ) : items.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: D.secondary, marginBottom: '4px' }}>No cost items in this set</div>
                  <div style={{ fontSize: '12px', color: '#aaa' }}>Cost items are added via the cost engine or via direct API calls.</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                        {['Type', 'Scope', 'Scope ID', 'Value', 'Unit', 'Currency', 'Effective From', 'To'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: D.secondary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.id} style={{ borderBottom: `1px solid ${D.border}` }}>
                          <td style={{ padding: '8px 12px' }}>{item.item_type}</td>
                          <td style={{ padding: '8px 12px', color: D.secondary }}>{item.scope_type}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px', color: D.secondary }}>{item.scope_id ? `${item.scope_id.slice(0, 8)}…` : '—'}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.value}</td>
                          <td style={{ padding: '8px 12px', color: D.secondary }}>{item.value_unit}</td>
                          <td style={{ padding: '8px 12px' }}>{item.currency ?? selected.base_currency}</td>
                          <td style={{ padding: '8px 12px', color: D.secondary }}>{item.effective_from ?? '—'}</td>
                          <td style={{ padding: '8px 12px', color: D.secondary }}>{item.effective_to ?? 'open'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: D.bg, border: `1px dashed ${D.border}`, borderRadius: '8px', padding: '40px', textAlign: 'center', color: D.secondary, fontSize: '13px' }}>
              Select a cost set from the list to view its cost items
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

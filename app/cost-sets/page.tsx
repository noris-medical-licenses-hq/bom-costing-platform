'use client'
import { useState, useEffect } from 'react'

type CostSet = {
  id: string
  cost_set_name: string
  cost_set_type: string
  status: string
  base_currency: string
  valid_from: string
  valid_to: string | null
}

type CostItem = {
  id: string
  item_type: string
  scope_type: string
  scope_id: string | null
  value: number
  currency: string | null
  effective_from: string
  effective_to: string | null
}

export default function CostSetsPage() {
  const [costSets, setCostSets] = useState<CostSet[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<CostItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    cost_set_name: '',
    cost_set_type: 'standard',
    base_currency: 'EUR',
    valid_from: new Date().toISOString().slice(0, 10),
    valid_to: '',
  })

  async function loadCostSets() {
    setLoading(true)
    const res = await fetch('/api/cost-sets')
    const json = await res.json()
    setLoading(false)
    if (res.ok) setCostSets(json.data ?? [])
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
    const res = await fetch('/api/cost-sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, valid_to: form.valid_to || null }),
    })
    const json = await res.json()
    if (res.ok) {
      setShowForm(false)
      setForm({ cost_set_name: '', cost_set_type: 'standard', base_currency: 'EUR', valid_from: new Date().toISOString().slice(0, 10), valid_to: '' })
      loadCostSets()
    } else {
      setError(json.error)
    }
  }

  const selected = costSets.find(c => c.id === selectedId)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Cost Sets</h1>
        <button onClick={() => setShowForm(!showForm)} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ New Cost Set'}
        </button>
      </div>

      {error && <div style={{ background: '#fee', border: '1px solid #fcc', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px', color: '#c00' }}>{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '15px' }}>Create Cost Set</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { label: 'Name', key: 'cost_set_name', type: 'text' },
              { label: 'Base Currency', key: 'base_currency', type: 'text' },
              { label: 'Valid From', key: 'valid_from', type: 'date' },
              { label: 'Valid To (optional)', key: 'valid_to', type: 'date' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>{label}</label>
                <input type={type} value={form[key as keyof typeof form] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} required={key !== 'valid_to'} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Type</label>
              <select value={form.cost_set_type} onChange={e => setForm(f => ({ ...f, cost_set_type: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}>
                {['standard', 'budget', 'project', 'transfer'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" style={{ marginTop: '16px', background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Create</button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #e0e0e0', fontSize: '13px', fontWeight: 600, background: '#f8f8f8' }}>Cost Sets</div>
          {loading ? <p style={{ padding: '16px', color: '#888', fontSize: '14px' }}>Loading...</p> : costSets.length === 0 ? (
            <p style={{ padding: '16px', color: '#888', fontSize: '14px' }}>No cost sets yet</p>
          ) : costSets.map(cs => (
            <div key={cs.id} onClick={() => loadItems(cs.id)} style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: cs.id === selectedId ? '#f0f4ff' : undefined }}>
              <div style={{ fontWeight: 500, fontSize: '13px' }}>{cs.cost_set_name}</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                {cs.cost_set_type} · {cs.base_currency} · {cs.status}
              </div>
              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
                {cs.valid_from} → {cs.valid_to ?? 'open'}
              </div>
            </div>
          ))}
        </div>

        <div>
          {selected ? (
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #e0e0e0', background: '#f8f8f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{selected.cost_set_name} — Cost Items</span>
                <code style={{ fontSize: '11px', color: '#888' }}>{selected.id}</code>
              </div>
              {itemsLoading ? (
                <p style={{ padding: '16px', color: '#888', fontSize: '14px' }}>Loading items...</p>
              ) : items.length === 0 ? (
                <p style={{ padding: '16px', color: '#888', fontSize: '14px' }}>No cost items in this set yet</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f8f8f8', borderBottom: '1px solid #e0e0e0' }}>
                      {['Type', 'Scope', 'Scope ID', 'Value', 'Currency', 'Effective From', 'To'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#444' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '8px 12px' }}>{item.item_type}</td>
                        <td style={{ padding: '8px 12px', color: '#888' }}>{item.scope_type}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px', color: '#888' }}>{item.scope_id ? `${item.scope_id.slice(0, 8)}...` : '—'}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.value}</td>
                        <td style={{ padding: '8px 12px' }}>{item.currency ?? selected.base_currency}</td>
                        <td style={{ padding: '8px 12px', color: '#888' }}>{item.effective_from}</td>
                        <td style={{ padding: '8px 12px', color: '#888' }}>{item.effective_to ?? 'open'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div style={{ background: '#f8f8f8', border: '1px dashed #ccc', borderRadius: '8px', padding: '40px', textAlign: 'center', color: '#888', fontSize: '14px' }}>
              Select a cost set to view its items
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

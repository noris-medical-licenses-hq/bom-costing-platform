'use client'
import { useState, useEffect } from 'react'

type Sku = {
  id: string
  part_number: string
  name: string
  item_type: string
  make_buy: string
  status: string
  family_id: string | null
  import_job_row_id: string | null
}

type CreateSkuForm = {
  part_number: string
  name: string
  item_type: string
  make_buy: string
  unit_of_measure: string
}

export default function SkuPage() {
  const [skus, setSkus] = useState<Sku[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<CreateSkuForm>({
    part_number: '',
    name: '',
    item_type: 'purchased_part',
    make_buy: 'buy',
    unit_of_measure: 'pcs',
  })

  async function loadSkus() {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ status: statusFilter })
    if (search) params.set('q', search)
    const res = await fetch(`/api/skus?${params}`)
    const json = await res.json()
    if (res.ok) setSkus(json.data ?? [])
    else setError(json.error)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSkus() }, [statusFilter])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/skus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setSubmitting(false)
    if (res.ok) {
      setShowForm(false)
      setForm({ part_number: '', name: '', item_type: 'purchased_part', make_buy: 'buy', unit_of_measure: 'pcs' })
      loadSkus()
    } else {
      setError(json.error)
    }
  }

  async function handleArchive(id: string) {
    if (!confirm('Archive this SKU?')) return
    const res = await fetch(`/api/skus/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (res.ok) loadSkus()
    else setError(json.error)
  }

  const filtered = skus.filter(s =>
    !search || s.part_number.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700 }}>SKU Management</h1>
        <button onClick={() => setShowForm(!showForm)} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ New SKU'}
        </button>
      </div>

      {error && <div style={{ background: '#fee', border: '1px solid #fcc', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px', color: '#c00' }}>{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '15px' }}>Create SKU</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { label: 'Part Number', key: 'part_number', type: 'text' },
              { label: 'Name', key: 'name', type: 'text' },
              { label: 'Unit of Measure', key: 'unit_of_measure', type: 'text' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>{label}</label>
                <input
                  type={type}
                  value={form[key as keyof CreateSkuForm]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  required
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Item Type</label>
              <select value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}>
                {['purchased_part', 'sub_assembly', 'finished_good', 'service', 'virtual'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Make/Buy</label>
              <select value={form.make_buy} onChange={e => setForm(f => ({ ...f, make_buy: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}>
                {['make', 'buy', 'make_or_buy'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={submitting} style={{ marginTop: '16px', background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
            {submitting ? 'Creating...' : 'Create SKU'}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Search part number or name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px' }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px' }}>
          {['active', 'draft', 'discontinued', 'archived'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={loadSkus} style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Refresh</button>
      </div>

      {loading ? (
        <p style={{ color: '#888', fontSize: '14px' }}>Loading...</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8f8f8', borderBottom: '1px solid #e0e0e0' }}>
                {['Part Number', 'Name', 'Type', 'Make/Buy', 'Status', 'Source', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#444' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No SKUs found</td></tr>
              ) : filtered.map(sku => (
                <tr key={sku.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600 }}>{sku.part_number}</td>
                  <td style={{ padding: '10px 14px' }}>{sku.name}</td>
                  <td style={{ padding: '10px 14px', color: '#666' }}>{sku.item_type}</td>
                  <td style={{ padding: '10px 14px', color: '#666' }}>{sku.make_buy}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: sku.status === 'active' ? '#e6f4ea' : '#f5f5f5', color: sku.status === 'active' ? '#2e7d32' : '#666', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                      {sku.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {sku.import_job_row_id ? (
                      <a
                        href={`/api/import-trace/${sku.import_job_row_id}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`Import row: ${sku.import_job_row_id}`}
                        style={{ fontSize: '11px', color: '#0369a1', textDecoration: 'none', background: '#e0f2fe', padding: '2px 7px', borderRadius: '4px', fontWeight: 500 }}
                      >
                        Imported
                      </a>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#999' }}>Manual</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {sku.status !== 'archived' && (
                      <button onClick={() => handleArchive(sku.id)} style={{ background: 'none', border: '1px solid #ccc', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: '#666' }}>
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0', fontSize: '12px', color: '#888' }}>
            {filtered.length} SKU{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}

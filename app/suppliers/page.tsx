'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRole } from '../hooks/useRole'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', error: '#dc2626', warning: '#d97706',
  teal: '#0d9488',
}

type Supplier = {
  id: string; name: string; country: string | null
  contact_email: string | null; contact_name: string | null
  status: 'active' | 'inactive' | 'disqualified'; notes: string | null
  created_at: string
}

type LinkedSku = { id: string; part_number: string; name: string; item_type: string }

const STATUS_COLOR: Record<string, string> = {
  active: D.success, inactive: D.secondary, disqualified: D.error,
}

const iStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${D.border}`,
  borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: D.card,
}
const labelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '4px',
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName]   = useState('')
  const [country, setCountry] = useState('')
  const [email, setEmail] = useState('')
  const [contact, setContact] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name || !country) return
    setLoading(true); setError(null)
    const res  = await fetch('/api/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, country: country.toUpperCase(), contact_email: email || null, contact_name: contact || null, notes: notes || null }),
    })
    const json = await res.json()
    setLoading(false)
    if (res.ok) onDone()
    else setError(json.error ?? 'Failed to create supplier')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: D.card, borderRadius: '12px', padding: '28px', width: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: D.dark }}>Add Supplier</h2>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: D.error }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>Supplier Name *</label>
            <input style={iStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Acme Components GmbH" />
          </div>
          <div>
            <label style={labelStyle}>Country Code *</label>
            <input style={iStyle} value={country} onChange={e => setCountry(e.target.value.toUpperCase())} placeholder="DE" maxLength={2} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>Contact Name</label>
            <input style={iStyle} value={contact} onChange={e => setContact(e.target.value)} placeholder="Hans Müller" />
          </div>
          <div>
            <label style={labelStyle}>Contact Email</label>
            <input style={iStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="hans@acme.de" />
          </div>
        </div>
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...iStyle, height: '70px', resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={loading || !name || !country}
            style={{ background: D.teal, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: !name || !country ? 0.6 : 1 }}>
            {loading ? 'Creating…' : 'Create Supplier'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailModal({ supplier, onClose, onChanged }: { supplier: Supplier; onClose: () => void; onChanged: () => void }) {
  const [linkedSkus, setLinkedSkus] = useState<LinkedSku[]>([])
  const [editing, setEditing]       = useState(false)
  const [name, setName]             = useState(supplier.name)
  const [email, setEmail]           = useState(supplier.contact_email ?? '')
  const [contact, setContact]       = useState(supplier.contact_name ?? '')
  const [status, setStatus]         = useState<Supplier['status']>(supplier.status)
  const [notes, setNotes]           = useState(supplier.notes ?? '')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/suppliers/${supplier.id}`).then(r => r.json()).then(j => setLinkedSkus(j.data?.linked_skus ?? []))
  }, [supplier.id])

  async function save() {
    setSaving(true); setError(null)
    const res  = await fetch(`/api/suppliers/${supplier.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contact_email: email || null, contact_name: contact || null, status, notes: notes || null }),
    })
    const json = await res.json()
    setSaving(false)
    if (res.ok) { setEditing(false); onChanged() }
    else setError(json.error ?? 'Failed to save')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: D.card, borderRadius: '12px', padding: '28px', width: '600px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: D.dark }}>{supplier.name}</h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: D.secondary }}>{supplier.country} · Supplier</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setEditing(!editing)} style={{ fontSize: '12px', background: D.bg, border: `1px solid ${D.border}`, borderRadius: '5px', padding: '6px 12px', cursor: 'pointer' }}>
              {editing ? 'Cancel Edit' : 'Edit'}
            </button>
            <button onClick={onClose} style={{ fontSize: '12px', background: D.bg, border: `1px solid ${D.border}`, borderRadius: '5px', padding: '6px 12px', cursor: 'pointer' }}>Close</button>
          </div>
        </div>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: D.error }}>{error}</div>}

        {editing ? (
          <div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Name</label>
              <input style={iStyle} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Contact Name</label>
                <input style={iStyle} value={contact} onChange={e => setContact(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Contact Email</label>
                <input style={iStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Status</label>
              <select style={iStyle} value={status} onChange={e => setStatus(e.target.value as Supplier['status'])}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="disqualified">Disqualified</option>
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Notes</label>
              <textarea style={{ ...iStyle, height: '70px', resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <button onClick={save} disabled={saving}
              style={{ background: D.teal, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px', marginBottom: '24px' }}>
            {[
              ['Country', supplier.country ?? '—'],
              ['Status', supplier.status],
              ['Contact', supplier.contact_name ?? '—'],
              ['Email', supplier.contact_email ?? '—'],
            ].map(([l, v]) => (
              <div key={l} style={{ background: D.bg, borderRadius: '6px', padding: '10px 14px' }}>
                <div style={{ fontSize: '11px', color: D.secondary, fontWeight: 600, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
                <div style={{ color: D.dark }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {linkedSkus.length > 0 && (
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: D.dark, marginBottom: '10px' }}>Linked SKUs ({linkedSkus.length})</h3>
            <div style={{ background: D.bg, borderRadius: '6px', overflow: 'hidden' }}>
              {linkedSkus.map(sku => (
                <div key={sku.id} style={{ padding: '8px 14px', borderBottom: `1px solid ${D.border}`, fontSize: '12px', color: D.dark, display: 'flex', justifyContent: 'space-between' }}>
                  <span><code style={{ fontFamily: 'monospace', color: D.secondary }}>{sku.part_number}</code> {sku.name}</span>
                  <span style={{ color: D.secondary }}>{sku.item_type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SuppliersPage() {
  const { isViewer }                = useRole()
  const [suppliers, setSuppliers]   = useState<Supplier[]>([])
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [detail, setDetail]         = useState<Supplier | null>(null)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus] = useState<'active' | 'inactive' | 'disqualified' | ''>('active')

  const load = useCallback(async () => {
    setLoading(true)
    const url = `/api/suppliers${filterStatus ? `?status=${filterStatus}` : '?status=active'}`
    const res  = await fetch(url)
    const json = await res.json()
    setLoading(false)
    setSuppliers(json.data ?? [])
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  const filtered = search
    ? suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.country?.toLowerCase().includes(search.toLowerCase()))
    : suppliers

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>Suppliers</h1>
          <p style={{ fontSize: '13px', color: D.secondary, margin: '4px 0 0' }}>Manage supplier master data</p>
        </div>
        {!isViewer && (
          <button onClick={() => setShowCreate(true)}
            style={{ background: D.teal, color: '#fff', border: 'none', borderRadius: '7px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            + Add Supplier
          </button>
        )}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load() }} />}
      {detail && <DetailModal supplier={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); load() }} />}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <input style={{ ...iStyle, width: '260px' }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or country…" />
        <select style={{ ...iStyle, width: '160px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="disqualified">Disqualified</option>
          <option value="">All</option>
        </select>
      </div>

      {loading ? (
        <p style={{ color: D.secondary, fontSize: '14px' }}>Loading suppliers…</p>
      ) : filtered.length === 0 ? (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '40px', textAlign: 'center', color: D.secondary, fontSize: '14px' }}>
          {suppliers.length === 0 ? 'No suppliers found. Click "Add Supplier" to create the first one, or import via the Import Center.' : 'No suppliers match your search.'}
        </div>
      ) : (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: D.bg }}>
                {['Name', 'Country', 'Contact', 'Status', ''].map(h => (
                  <th key={h || 'action'} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ borderTop: `1px solid ${D.border}`, cursor: 'pointer' }} onClick={() => setDetail(s)}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: D.dark }}>{s.name}</td>
                  <td style={{ padding: '12px 16px', color: D.secondary }}>{s.country ?? '—'}</td>
                  <td style={{ padding: '12px 16px', color: D.secondary }}>{s.contact_name ?? s.contact_email ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: STATUS_COLOR[s.status], background: `${STATUS_COLOR[s.status]}12`, border: `1px solid ${STATUS_COLOR[s.status]}30`, borderRadius: '12px', padding: '2px 8px' }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', color: D.secondary }}>View →</span>
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

'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRole } from '../hooks/useRole'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', error: '#dc2626', warning: '#d97706',
  teal: '#0d9488', tealLight: '#F0FDFA',
}

const TYPES = ['raw_materials', 'work_in_progress', 'finished_goods', 'quarantine', 'consignment'] as const
type WHType = typeof TYPES[number]
const TYPE_LABEL: Record<WHType, string> = {
  raw_materials: 'Raw Materials', work_in_progress: 'WIP',
  finished_goods: 'Finished Goods', quarantine: 'Quarantine', consignment: 'Consignment',
}
const TYPE_COLOR: Record<WHType, string> = {
  raw_materials: '#7c3aed', work_in_progress: '#d97706', finished_goods: D.success,
  quarantine: D.red, consignment: D.secondary,
}

type Site      = { id: string; code: string; name: string; country: string | null }
type Warehouse = {
  id: string; code: string; name: string; warehouse_type: WHType; site_id: string
  is_active: boolean; created_at: string; sites: Site
}

const iStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${D.border}`,
  borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: D.card,
}
const labelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '4px',
}

function CreateModal({ sites, onClose, onDone }: { sites: Site[]; onClose: () => void; onDone: () => void }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '')
  const [code, setCode]     = useState('')
  const [name, setName]     = useState('')
  const [type, setType]     = useState<WHType>('finished_goods')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function submit() {
    if (!siteId || !code || !name) return
    setLoading(true); setError(null)
    const res  = await fetch('/api/warehouses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, code: code.toUpperCase(), name, warehouse_type: type }),
    })
    const json = await res.json()
    setLoading(false)
    if (res.ok) onDone()
    else setError(json.error ?? 'Failed to create warehouse')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: D.card, borderRadius: '12px', padding: '28px', width: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: D.dark }}>Create Warehouse</h2>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: D.error }}>{error}</div>}

        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Site</label>
          <select style={iStyle} value={siteId} onChange={e => setSiteId(e.target.value)}>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code}){s.country ? ` · ${s.country}` : ''}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>Code</label>
            <input style={iStyle} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="WH01" maxLength={50} />
          </div>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={iStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Main Warehouse" />
          </div>
        </div>
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>Warehouse Type</label>
          <select style={iStyle} value={type} onChange={e => setType(e.target.value as WHType)}>
            {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <p style={{ fontSize: '11px', color: D.secondary, margin: '6px 0 0' }}>
            raw_materials = purchased components · wip = in-process · finished_goods = complete products · quarantine = QC hold · consignment = customer-owned
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={loading || !siteId || !code || !name}
            style={{ background: D.teal, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: loading || !siteId || !code || !name ? 0.6 : 1 }}>
            {loading ? 'Creating…' : 'Create Warehouse'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditModal({ wh, sites, onClose, onDone }: { wh: Warehouse; sites: Site[]; onClose: () => void; onDone: () => void }) {
  const [name, setName]     = useState(wh.name)
  const [type, setType]     = useState<WHType>(wh.warehouse_type)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function submit() {
    setLoading(true); setError(null)
    const res  = await fetch(`/api/warehouses/${wh.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, warehouse_type: type }),
    })
    const json = await res.json()
    setLoading(false)
    if (res.ok) onDone()
    else setError(json.error ?? 'Failed to update')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: D.card, borderRadius: '12px', padding: '28px', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: D.dark }}>Edit Warehouse — {wh.code}</h2>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: D.error }}>{error}</div>}

        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Name</label>
          <input style={iStyle} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>Warehouse Type</label>
          <select style={iStyle} value={type} onChange={e => setType(e.target.value as WHType)}>
            {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={loading}
            style={{ background: D.teal, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function WarehousesPage() {
  const { isViewer }                = useRole()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [sites, setSites]           = useState<Site[]>([])
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing]       = useState<Warehouse | null>(null)
  const [filterSite, setFilterSite] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'archived'>('active')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [whRes, siteRes] = await Promise.all([
      fetch('/api/warehouses'),
      fetch('/api/sites'),
    ])
    const [whJson, siteJson] = await Promise.all([whRes.json(), siteRes.json()])
    setLoading(false)
    setWarehouses(whJson.data ?? [])
    setSites(siteJson.data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActive(wh: Warehouse) {
    setActionLoading(wh.id)
    await fetch(`/api/warehouses/${wh.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !wh.is_active }),
    })
    setActionLoading(null)
    load()
  }

  const filtered = warehouses.filter(w => {
    if (filterSite && w.site_id !== filterSite) return false
    if (filterActive === 'active' && !w.is_active) return false
    if (filterActive === 'archived' && w.is_active) return false
    return true
  })

  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>Warehouses</h1>
          <p style={{ fontSize: '13px', color: D.secondary, margin: '4px 0 0' }}>Manage storage zones within each site</p>
        </div>
        {!isViewer && (
          <button onClick={() => setShowCreate(true)} disabled={sites.length === 0}
            style={{ background: D.teal, color: '#fff', border: 'none', borderRadius: '7px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            + Create Warehouse
          </button>
        )}
      </div>

      {showCreate && <CreateModal sites={sites} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load() }} />}
      {editing && <EditModal wh={editing} sites={sites} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load() }} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <select style={{ ...iStyle, width: '220px' }} value={filterSite} onChange={e => setFilterSite(e.target.value)}>
          <option value="">All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select style={{ ...iStyle, width: '160px' }} value={filterActive} onChange={e => setFilterActive(e.target.value as typeof filterActive)}>
          <option value="active">Active Only</option>
          <option value="all">All</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {sites.length === 0 && !loading && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '20px', fontSize: '14px', color: '#92400E' }}>
          No sites found. <a href="/sites" style={{ color: D.red }}>Create a site first</a> before adding warehouses.
        </div>
      )}

      {loading ? (
        <p style={{ color: D.secondary, fontSize: '14px' }}>Loading warehouses…</p>
      ) : filtered.length === 0 ? (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '40px', textAlign: 'center', color: D.secondary, fontSize: '14px' }}>
          {warehouses.length === 0 ? 'No warehouses yet. Click "Create Warehouse" to add your first.' : 'No warehouses match the selected filters.'}
        </div>
      ) : (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: D.bg }}>
                {['Code', 'Name', 'Site', 'Type', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(wh => (
                <tr key={wh.id} style={{ borderTop: `1px solid ${D.border}`, opacity: wh.is_active ? 1 : 0.55 }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: D.dark }}>{wh.code}</td>
                  <td style={{ padding: '12px 16px', color: D.dark }}>{wh.name}</td>
                  <td style={{ padding: '12px 16px', color: D.secondary }}>
                    {wh.sites?.name ?? '—'}
                    {wh.sites?.country && <span style={{ marginLeft: '6px', fontSize: '11px', color: D.secondary }}>({wh.sites.country})</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: TYPE_COLOR[wh.warehouse_type], background: `${TYPE_COLOR[wh.warehouse_type]}12`, border: `1px solid ${TYPE_COLOR[wh.warehouse_type]}30`, borderRadius: '12px', padding: '2px 8px' }}>
                      {TYPE_LABEL[wh.warehouse_type]}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: wh.is_active ? D.success : D.secondary }}>
                      {wh.is_active ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {!isViewer && (
                        <>
                          <button onClick={() => setEditing(wh)}
                            style={{ fontSize: '12px', color: D.dark, background: D.bg, border: `1px solid ${D.border}`, borderRadius: '5px', padding: '4px 10px', cursor: 'pointer' }}>
                            Edit
                          </button>
                          <button onClick={() => toggleActive(wh)} disabled={actionLoading === wh.id}
                            style={{ fontSize: '12px', color: wh.is_active ? D.warning : D.success, background: wh.is_active ? '#FFFBEB' : '#F0FDF4', border: `1px solid ${wh.is_active ? '#FDE68A' : '#86EFAC'}`, borderRadius: '5px', padding: '4px 10px', cursor: 'pointer' }}>
                            {actionLoading === wh.id ? '…' : wh.is_active ? 'Archive' : 'Restore'}
                          </button>
                        </>
                      )}
                    </div>
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

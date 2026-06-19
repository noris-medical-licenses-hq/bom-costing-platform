'use client'
import { useState, useEffect, useCallback } from 'react'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', warning: '#d97706', error: '#dc2626',
  redLight: '#FEF2F2', warnLight: '#FFFBEB', successLight: '#F0FDF4',
}

type SiteStatus = 'active' | 'archived'

type Site = {
  id: string; code: string; name: string; country: string | null
  default_currency: string; status: SiteStatus; is_active: boolean
  notes: string | null; created_at: string; archived_at: string | null
}

type LinkedCounts = { warehouses: number; cost_builds: number; cost_sets: number; inventory_snapshots: number }

const STATUS_LABEL: Record<SiteStatus, string> = {
  active: 'Active', archived: 'Archived',
}
const STATUS_COLOR: Record<SiteStatus, string> = {
  active: D.success, archived: D.secondary,
}

const iStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${D.border}`,
  borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: D.card,
}
const labelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '4px',
}

// ─── Link count banner ────────────────────────────────────────────────────────

function LinkedEntitiesWarning({ counts }: { counts: LinkedCounts }) {
  const hasLinks = Object.values(counts).some(c => c > 0)
  if (!hasLinks) return null
  return (
    <div style={{ background: D.warnLight, border: '1px solid #FDE68A', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#92400E' }}>
      <strong>This site has linked data:</strong>
      <ul style={{ margin: '6px 0 0', paddingLeft: '16px', lineHeight: 1.8 }}>
        {counts.warehouses > 0         && <li>{counts.warehouses} warehouse{counts.warehouses !== 1 ? 's' : ''}</li>}
        {counts.cost_builds > 0        && <li>{counts.cost_builds} cost build{counts.cost_builds !== 1 ? 's' : ''}</li>}
        {counts.cost_sets > 0          && <li>{counts.cost_sets} cost set{counts.cost_sets !== 1 ? 's' : ''}</li>}
        {counts.inventory_snapshots > 0 && <li>{counts.inventory_snapshots} inventory snapshot{counts.inventory_snapshots !== 1 ? 's' : ''}</li>}
      </ul>
      <p style={{ margin: '6px 0 0' }}>Archiving this site hides it from active views but preserves all historical data.</p>
    </div>
  )
}

// ─── Archive confirmation modal ───────────────────────────────────────────────

function ArchiveModal({ site, onClose, onDone }: { site: Site; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<1|2>(1)
  const [typedCode, setTypedCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState<LinkedCounts | null>(null)

  useEffect(() => {
    fetch(`/api/sites/${site.id}`).then(r => r.json()).then(d => {
      setCounts(d.linkedCounts ?? { warehouses: 0, cost_builds: 0, cost_sets: 0, inventory_snapshots: 0 })
    })
  }, [site.id])

  async function handleArchive() {
    if (typedCode.toUpperCase() !== site.code.toUpperCase()) {
      setError('Site code does not match'); return
    }
    setLoading(true); setError(null)
    const res = await fetch(`/api/sites/${site.id}/archive`, { method: 'POST' })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    onDone()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: D.card, borderRadius: '10px', padding: '28px', width: '480px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: '17px', fontWeight: 700, color: D.dark, marginBottom: '4px' }}>Archive Site</div>
        <div style={{ fontSize: '13px', color: D.secondary, marginBottom: '20px' }}>
          <strong>{site.name}</strong> ({site.code}) — archiving hides it from active views but preserves all data.
        </div>

        {error && <div style={{ background: D.redLight, border: `1px solid ${D.error}`, borderRadius: '6px', padding: '10px 14px', fontSize: '13px', color: D.error, marginBottom: '16px' }}>{error}</div>}

        {step === 1 && (
          <>
            {counts && <LinkedEntitiesWarning counts={counts} />}
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '6px', padding: '12px 16px', fontSize: '13px', color: '#0369a1', marginBottom: '20px' }}>
              The site will be moved to <strong>Archived</strong> status. It can be restored at any time from this admin page.
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 18px', border: `1px solid ${D.border}`, borderRadius: '6px', cursor: 'pointer', background: D.card, fontSize: '13px' }}>Cancel</button>
              <button onClick={() => setStep(2)} style={{ padding: '8px 18px', background: D.warning, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
                Continue →
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Type the site code <strong>{site.code}</strong> to confirm</label>
              <input
                value={typedCode}
                onChange={e => setTypedCode(e.target.value)}
                placeholder={site.code}
                style={{ ...iStyle, borderColor: typedCode && typedCode.toUpperCase() !== site.code.toUpperCase() ? D.error : D.border }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setStep(1)} style={{ padding: '8px 18px', border: `1px solid ${D.border}`, borderRadius: '6px', cursor: 'pointer', background: D.card, fontSize: '13px' }}>← Back</button>
              <button
                onClick={handleArchive}
                disabled={loading || typedCode.toUpperCase() !== site.code.toUpperCase()}
                style={{ padding: '8px 18px', background: D.warning, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '13px', opacity: typedCode.toUpperCase() !== site.code.toUpperCase() ? 0.4 : 1 }}
              >
                {loading ? 'Archiving…' : 'Archive Site'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// DeleteRequestModal removed — M-032 business correction:
// Sites with ANY historical data must never be physically deleted.
// Only Archive / Restore is allowed. Statuses: active | archived.

// ─── Create / Edit form ───────────────────────────────────────────────────────

const EMPTY_FORM = { code: '', name: '', country: '', default_currency: 'USD', notes: '' }

function SiteForm({
  initial, onSave, onCancel, isEdit,
}: { initial?: typeof EMPTY_FORM; onSave: (data: typeof EMPTY_FORM) => Promise<string | null>; onCancel: () => void; isEdit?: boolean }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    const err = await onSave(form)
    setSaving(false)
    if (err) setError(err)
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '24px', marginBottom: '24px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: D.dark, marginBottom: '20px' }}>
        {isEdit ? 'Edit Site' : 'New Site'}
      </div>
      {error && <div style={{ background: D.redLight, border: `1px solid ${D.error}`, borderRadius: '6px', padding: '10px 14px', fontSize: '13px', color: D.error, marginBottom: '16px' }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>Site Code *</label>
          <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} required disabled={isEdit} maxLength={20} placeholder="DE-HQ" style={{ ...iStyle, fontFamily: 'monospace', opacity: isEdit ? 0.6 : 1 }} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={labelStyle}>Site Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required maxLength={200} placeholder="Germany HQ" style={iStyle} />
        </div>
        <div>
          <label style={labelStyle}>Country (ISO 2-letter)</label>
          <input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value.toUpperCase().slice(0, 2) }))} maxLength={2} placeholder="DE" style={{ ...iStyle, fontFamily: 'monospace' }} />
        </div>
        <div>
          <label style={labelStyle}>Default Currency</label>
          <input value={form.default_currency} onChange={e => setForm(f => ({ ...f, default_currency: e.target.value.toUpperCase().slice(0, 3) }))} maxLength={3} placeholder="EUR" style={{ ...iStyle, fontFamily: 'monospace' }} />
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} maxLength={500} placeholder="Optional description" style={iStyle} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="submit" disabled={saving} style={{ background: D.red, color: '#fff', border: 'none', padding: '8px 24px', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Site'}
        </button>
        <button type="button" onClick={onCancel} style={{ background: D.card, color: D.dark, border: `1px solid ${D.border}`, padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
      </div>
    </form>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SitesPage() {
  const [sites,          setSites]         = useState<Site[]>([])
  const [loading,        setLoading]       = useState(true)
  const [showCreate,     setShowCreate]    = useState(false)
  const [editSite,       setEditSite]      = useState<Site | null>(null)
  const [archiveTarget,  setArchiveTarget] = useState<Site | null>(null)
  const [showArchived,   setShowArchived]  = useState(true)
  const [error,          setError]         = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/sites?includeArchived=true')
    const data = await res.json()
    setSites(data.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(form: typeof EMPTY_FORM): Promise<string | null> {
    const res = await fetch('/api/sites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, country: form.country || null }),
    })
    const data = await res.json()
    if (!res.ok) return data.error ?? 'Failed to create site'
    setShowCreate(false); load()
    return null
  }

  async function handleEdit(form: typeof EMPTY_FORM): Promise<string | null> {
    if (!editSite) return null
    const res = await fetch(`/api/sites/${editSite.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, country: form.country || null }),
    })
    const data = await res.json()
    if (!res.ok) return data.error ?? 'Failed to update site'
    setEditSite(null); load()
    return null
  }

  async function handleRestore(site: Site) {
    const res = await fetch(`/api/sites/${site.id}/restore`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }
    load()
  }

  const filteredSites = showArchived ? sites : sites.filter(s => s.status === 'active')

  return (
    <div>
      {archiveTarget && (
        <ArchiveModal
          site={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onDone={() => { setArchiveTarget(null); load() }}
        />
      )}
      {editSite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: '600px', maxWidth: '100%' }}>
            <SiteForm
              initial={{ code: editSite.code, name: editSite.name, country: editSite.country ?? '', default_currency: editSite.default_currency, notes: editSite.notes ?? '' }}
              onSave={handleEdit}
              onCancel={() => setEditSite(null)}
              isEdit
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>Sites</h1>
          <p style={{ color: D.secondary, fontSize: '14px', margin: '4px 0 0' }}>
            Physical sites — manufacturing, storage, or distribution locations. Each site scopes Cost Builds and Inventory.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setError(null) }}
          style={{ background: showCreate ? D.card : D.red, color: showCreate ? D.dark : '#fff', border: `1px solid ${showCreate ? D.border : D.red}`, padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
        >
          {showCreate ? 'Cancel' : '+ New Site'}
        </button>
      </div>

      {error && <div style={{ background: D.redLight, border: `1px solid ${D.error}`, borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: D.error }}>{error}</div>}

      {showCreate && <SiteForm onSave={handleCreate} onCancel={() => setShowCreate(false)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', color: D.secondary }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Show archived sites
        </label>
        <span style={{ fontSize: '13px', color: D.secondary }}>
          {filteredSites.length} site{filteredSites.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <p style={{ color: D.secondary, fontSize: '14px' }}>Loading…</p>
      ) : (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                {['Code', 'Name', 'Country', 'Currency', 'Status', 'Created', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: D.secondary, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSites.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: D.secondary }}>No sites found.</td></tr>
              ) : filteredSites.map((site, i) => (
                <tr key={site.id} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? D.card : D.bg, opacity: site.status !== 'active' ? 0.8 : 1 }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: D.dark }}>{site.code}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500, color: D.dark }}>{site.name}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: D.secondary }}>{site.country ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: D.secondary }}>{site.default_currency}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ color: STATUS_COLOR[site.status], fontWeight: 500 }}>{STATUS_LABEL[site.status]}</span>
                  </td>
                  <td style={{ padding: '10px 14px', color: D.secondary }}>{new Date(site.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '8px 14px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {site.status === 'active' && (
                        <>
                          <button onClick={() => setEditSite(site)} style={{ fontSize: '12px', padding: '4px 10px', border: `1px solid ${D.border}`, borderRadius: '4px', cursor: 'pointer', background: D.card, color: D.dark }}>Edit</button>
                          <button onClick={() => setArchiveTarget(site)} style={{ fontSize: '12px', padding: '4px 10px', border: `1px solid ${D.warning}`, borderRadius: '4px', cursor: 'pointer', background: D.warnLight, color: D.warning, fontWeight: 600 }}>Archive</button>
                        </>
                      )}
                      {site.status === 'archived' && (
                        <button onClick={() => handleRestore(site)} style={{ fontSize: '12px', padding: '4px 10px', border: `1px solid ${D.success}`, borderRadius: '4px', cursor: 'pointer', background: D.successLight, color: D.success, fontWeight: 600 }}>Restore</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '32px', padding: '16px 20px', background: D.warnLight, border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '13px', color: '#92400E' }}>
        <strong>Governance policy:</strong> Sites may be set to <strong>Active</strong> or <strong>Archived</strong> only.
        Sites with historical Cost Builds, Inventory Snapshots, Cost Sets, or Audit Records are permanently protected from deletion — archiving is the only allowed action.
        Archived sites remain readable in all historical reports and Cost Builds.
      </div>
    </div>
  )
}

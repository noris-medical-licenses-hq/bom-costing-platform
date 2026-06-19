'use client'
import { useState, useEffect, useCallback } from 'react'
import { GuidancePanel } from '../components/GuidancePanel'
import { useRole } from '../hooks/useRole'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', error: '#dc2626', warning: '#d97706',
  blue: '#1565c0', blueLight: '#EFF6FF',
  purple: '#7c3aed',
}

type BomVersion = {
  id: string; version_number: number; version_label: string | null; status: string
  is_locked: boolean; effective_from: string | null; change_summary: string | null
  approved_at: string | null; created_at: string
  approved_by_profile: { full_name: string; email: string } | null
  boms: {
    id: string; sku_id: string
    skus: { id: string; part_number: string; name: string; item_type: string }
  }
}

const STATUS_COLOR: Record<string, string> = {
  draft: D.warning, under_review: D.blue, approved: D.success, superseded: D.secondary, archived: D.error,
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', under_review: 'Under Review', approved: 'Approved', superseded: 'Superseded', archived: 'Archived',
}

function ApproveModal({ version, onClose, onDone }: { version: BomVersion; onClose: () => void; onDone: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function approve() {
    setLoading(true); setError(null)
    const res  = await fetch(`/api/boms/versions/${version.id}/approve`, { method: 'POST' })
    const json = await res.json()
    setLoading(false)
    if (res.ok) onDone()
    else setError(json.error ?? 'Failed to approve')
  }

  const sku = version.boms?.skus
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: D.card, borderRadius: '12px', padding: '28px', width: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 700, color: D.dark }}>Approve BOM Version</h2>
        <p style={{ fontSize: '13px', color: D.secondary, margin: '0 0 16px' }}>
          You are about to approve <strong>{sku?.part_number}</strong> BOM v{version.version_number}.
          Any currently approved version for this BOM will be automatically superseded.
        </p>
        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: D.error }}>{error}</div>}
        <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '13px', color: '#15803d' }}>
          After approval, this version will be used by the BOM_ROLLUP costing strategy for <strong>{sku?.name}</strong>.
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={approve} disabled={loading}
            style={{ background: D.success, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Approving…' : 'Approve Version'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RejectModal({ version, onClose, onDone }: { version: BomVersion; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function reject() {
    setLoading(true); setError(null)
    const res  = await fetch(`/api/boms/versions/${version.id}/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const json = await res.json()
    setLoading(false)
    if (res.ok) onDone()
    else setError(json.error ?? 'Failed to reject')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: D.card, borderRadius: '12px', padding: '28px', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 700, color: D.dark }}>Reject BOM Version</h2>
        <p style={{ fontSize: '13px', color: D.secondary, margin: '0 0 16px' }}>
          This will archive v{version.version_number} and prevent it from being used in cost builds.
        </p>
        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: D.error }}>{error}</div>}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '4px' }}>Rejection Reason (optional)</label>
          <textarea
            style={{ width: '100%', padding: '8px 10px', border: `1px solid ${D.border}`, borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', height: '80px', resize: 'vertical' }}
            value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Component quantities incorrect — awaiting engineering revision" />
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={reject} disabled={loading}
            style={{ background: D.error, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Rejecting…' : 'Reject Version'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cost Calculator (advanced — collapsed by default) ─────────────────────────
function CostCalculator({ bomId, skuName }: { bomId: string; skuName: string }) {
  const [open, setOpen]       = useState(false)
  const [costSetId, setCostSetId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<any>(null)
  const [error, setError]     = useState<string | null>(null)

  async function run() {
    setLoading(true); setError(null); setResult(null)
    const res  = await fetch('/api/calculate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bom_id: bomId, cost_set_id: costSetId, trace_level: 'detailed' }),
    })
    const json = await res.json()
    setLoading(false)
    if (res.ok) setResult(json.data)
    else setError(json.error)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ fontSize: '12px', color: D.blue, background: D.blueLight, border: '1px solid #BFDBFE', borderRadius: '5px', padding: '5px 12px', cursor: 'pointer', marginTop: '12px' }}>
        Calculate BOM Cost…
      </button>
    )
  }

  return (
    <div style={{ marginTop: '12px', background: D.bg, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: D.dark }}>Calculate BOM Cost — {skuName}</span>
        <button onClick={() => setOpen(false)} style={{ fontSize: '12px', color: D.secondary, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
        <input
          style={{ flex: 1, padding: '7px 10px', border: `1px solid ${D.border}`, borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace' }}
          placeholder="Cost Set UUID…" value={costSetId} onChange={e => setCostSetId(e.target.value)}
        />
        <button onClick={run} disabled={loading || !costSetId}
          style={{ background: D.success, color: '#fff', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
          {loading ? 'Running…' : 'Calculate'}
        </button>
      </div>
      {error && <div style={{ fontSize: '12px', color: D.error, marginBottom: '8px' }}>{error}</div>}
      {result && (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: D.dark, marginBottom: '8px' }}>
            {result.currency} {result.totalUnitCost.toFixed(4)}
            <span style={{ fontSize: '12px', fontWeight: 400, color: D.secondary, marginLeft: '8px' }}>in {result.durationMs}ms</span>
          </div>
          {result.warnings?.length > 0 && (
            <div style={{ fontSize: '12px', color: D.warning, marginBottom: '8px' }}>
              ⚠ {result.warnings.length} warning(s): {result.warnings.map((w: any) => w.message).join('; ')}
            </div>
          )}
          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: D.bg }}>
                {['Component', 'Qty', 'Unit Cost', 'Source'].map(h => (
                  <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600, color: D.secondary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.breakdown?.map((line: any) => (
                <tr key={line.bomLineId} style={{ borderTop: `1px solid ${D.border}` }}>
                  <td style={{ padding: '5px 8px', paddingLeft: `${8 + line.depth * 16}px`, fontFamily: 'monospace', color: D.dark }}>{line.partNumber ?? line.name}</td>
                  <td style={{ padding: '5px 8px' }}>{line.quantity}</td>
                  <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{line.unitCost.toFixed(4)}</td>
                  <td style={{ padding: '5px 8px', color: D.secondary }}>{line.costSource?.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function BomPage() {
  const { canApprove }            = useRole()
  const [versions, setVersions]   = useState<BomVersion[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [approving, setApproving] = useState<BomVersion | null>(null)
  const [rejecting, setRejecting] = useState<BomVersion | null>(null)

  const load = useCallback(async (q: string, status: string) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (status) params.set('status', status)
    const res  = await fetch(`/api/boms/versions?${params}`)
    const json = await res.json()
    setLoading(false)
    setVersions(json.data ?? [])
  }, [])

  useEffect(() => { load(search, filterStatus) }, []) // eslint-disable-line

  function doSearch(q: string, status: string) {
    setSearch(q); setFilterStatus(status); load(q, status)
  }

  // Group versions by SKU
  const grouped = versions.reduce<Record<string, BomVersion[]>>((acc, v) => {
    const key = v.boms?.skus?.part_number ?? v.boms?.sku_id ?? 'unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(v)
    return acc
  }, {})

  const needsApproval = versions.filter(v => v.status === 'draft' || v.status === 'under_review').length
  const approvedCount = versions.filter(v => v.status === 'approved').length

  return (
    <div style={{ maxWidth: '1100px' }}>
      <GuidancePanel moduleKey="boms" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>BOM Management</h1>
          <p style={{ fontSize: '13px', color: D.secondary, margin: '4px 0 0' }}>Approve BOM versions for use in cost builds · Only approved versions are used by BOM_ROLLUP strategy</p>
        </div>
        <a href="/imports" style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: '7px', padding: '9px 18px', fontSize: '13px', fontWeight: 500, color: D.dark, textDecoration: 'none' }}>
          Import BOM Lines →
        </a>
      </div>

      {/* Status summary cards */}
      {versions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Needs Approval', value: needsApproval, color: D.warning, bg: '#FFFBEB' },
            { label: 'Approved (Active)', value: approvedCount, color: D.success, bg: '#F0FDF4' },
            { label: 'Total BOMs', value: Object.keys(grouped).length, color: D.dark, bg: D.bg },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{ background: bg, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '14px 16px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: '12px', color: D.secondary, marginTop: '2px' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {needsApproval > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#92400E' }}>
          <strong>{needsApproval} BOM version{needsApproval !== 1 ? 's' : ''} waiting for approval.</strong> BOM_ROLLUP cost builds will use zero cost for BOMs without an approved version.
        </div>
      )}

      {approving && <ApproveModal version={approving} onClose={() => setApproving(null)} onDone={() => { setApproving(null); load(search, filterStatus) }} />}
      {rejecting && <RejectModal  version={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); load(search, filterStatus) }} />}

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <input
          style={{ padding: '8px 12px', border: `1px solid ${D.border}`, borderRadius: '7px', fontSize: '13px', flex: 1, maxWidth: '320px' }}
          placeholder="Search by part number or description…"
          value={search}
          onChange={e => doSearch(e.target.value, filterStatus)}
        />
        <select
          style={{ padding: '8px 10px', border: `1px solid ${D.border}`, borderRadius: '7px', fontSize: '13px', width: '180px' }}
          value={filterStatus}
          onChange={e => doSearch(search, e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="superseded">Superseded</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {loading ? (
        <p style={{ color: D.secondary, fontSize: '14px' }}>Loading BOMs…</p>
      ) : Object.keys(grouped).length === 0 ? (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '48px', textAlign: 'center', color: D.secondary }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: D.dark, marginBottom: '8px' }}>No BOMs found</div>
          <div style={{ fontSize: '13px', marginBottom: '20px' }}>Import BOM lines via the Import Center to build your BOM library.</div>
          <a href="/imports" style={{ background: D.blue, color: '#fff', border: 'none', borderRadius: '7px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
            Go to Import Center →
          </a>
        </div>
      ) : (
        Object.entries(grouped).map(([partNumber, vlist]) => {
          const sku            = vlist[0]?.boms?.skus
          const approvedVersion = vlist.find(v => v.status === 'approved')
          const pendingVersions = vlist.filter(v => v.status === 'draft' || v.status === 'under_review')

          return (
            <div key={partNumber} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', marginBottom: '12px' }}>
              {/* SKU header */}
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <code style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', color: D.dark, background: D.bg, padding: '2px 8px', borderRadius: '4px' }}>{sku?.part_number ?? partNumber}</code>
                <span style={{ fontSize: '13px', color: D.secondary }}>{sku?.name}</span>
                <span style={{ fontSize: '11px', color: D.secondary, background: D.bg, padding: '2px 8px', borderRadius: '12px', marginLeft: '4px' }}>{sku?.item_type?.replace(/_/g, ' ')}</span>
                {approvedVersion && (
                  <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 600, color: D.success, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '12px', padding: '3px 10px' }}>
                    v{approvedVersion.version_number} approved
                  </span>
                )}
                {!approvedVersion && (
                  <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 600, color: D.warning, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '3px 10px' }}>
                    No approved version — BOM_ROLLUP will return zero cost
                  </span>
                )}
              </div>

              {/* Version list */}
              <div style={{ padding: '12px 20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {['Version', 'Status', 'Effective From', 'Notes', 'Approved By', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vlist.map(v => (
                      <tr key={v.id} style={{ borderTop: `1px solid ${D.border}` }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: D.dark }}>v{v.version_number}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: STATUS_COLOR[v.status] ?? D.secondary, background: `${STATUS_COLOR[v.status] ?? D.secondary}12`, border: `1px solid ${STATUS_COLOR[v.status] ?? D.secondary}30`, borderRadius: '12px', padding: '2px 8px' }}>
                            {STATUS_LABEL[v.status] ?? v.status}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', color: D.secondary }}>{v.effective_from ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: D.secondary, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.change_summary ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: D.secondary, fontSize: '12px' }}>
                          {v.approved_by_profile ? `${v.approved_by_profile.full_name} · ${v.approved_at ? new Date(v.approved_at).toLocaleDateString() : ''}` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {canApprove && (v.status === 'draft' || v.status === 'under_review') && (
                              <>
                                <button onClick={() => setApproving(v)}
                                  style={{ fontSize: '12px', color: D.success, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '5px', padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
                                  Approve
                                </button>
                                <button onClick={() => setRejecting(v)}
                                  style={{ fontSize: '12px', color: D.error, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '5px', padding: '4px 10px', cursor: 'pointer' }}>
                                  Reject
                                </button>
                              </>
                            )}
                            {v.status === 'approved' && (
                              <span style={{ fontSize: '11px', color: D.success }}>✓ Current</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Cost Calculator for the approved BOM */}
                {approvedVersion && (
                  <CostCalculator bomId={approvedVersion.boms.id} skuName={sku?.name ?? partNumber} />
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

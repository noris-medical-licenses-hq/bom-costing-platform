'use client'
import { useState, useEffect, useCallback } from 'react'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', warning: '#d97706', error: '#dc2626',
  redLight: '#FEF2F2', blue: '#1565c0', purple: '#4a148c',
  teal: '#0d9488',
}

// Only operational strategies shown in UI — stubs (LAST_PURCHASE, etc.) are hidden.
const STRATEGIES = [
  { value: 'PRICE_LIST', label: 'Price List', desc: 'Read from imported country price list version' },
  { value: 'BOM_ROLLUP', label: 'BOM Rollup', desc: 'Recursively roll up component costs from approved BOMs' },
]

const STRATEGY_LABEL: Record<string, string> = {
  PRICE_LIST: 'Price List', BOM_ROLLUP: 'BOM Rollup',
  MAKE_OR_BUY: 'Make or Buy', LAST_PURCHASE: 'Last Purchase',
  STANDARD_COST: 'Standard Cost', CONTRACT_PRICE: 'Contract Price',
}

const STATUS_COLOR: Record<string, string> = {
  draft: D.secondary, running: D.warning, complete: D.blue,
  approved: D.teal, locked: D.dark, failed: D.error, archived: D.secondary,
}
const ITEM_TYPE_COLOR: Record<string, string> = {
  PURCHASED: D.blue, MANUFACTURED: D.success, MAKE_OR_BUY: D.warning, SERVICE: D.purple, MANUAL: D.secondary,
}

type Site = { id: string; name: string; code: string }
type Build = {
  id: string; name: string; description: string | null; default_strategy: string
  status: string; line_count: number; error_count: number; built_at: string | null; created_at: string; notes: string | null
  sites: { id: string; name: string; code: string } | null
  cost_sets: { id: string; name: string; base_currency: string; is_frozen: boolean } | null
}
type BuildLine = {
  id: string; sku_id: string; item_cost_type: string; cost_strategy_used: string
  source_record_type: string | null; source_reference: string | null
  fallback_path: Array<{ strategy: string; reason: string }>
  resolved_cost: number; currency: string
  skus: { part_number: string | null; name: string | null; sku_type: string } | null
}

function fmtCost(v: number, ccy: string) {
  return `${ccy} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}
function fmtDate(s: string) { return new Date(s).toLocaleDateString() }

const iStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${D.border}`,
  borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: D.card,
}
const labelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '4px',
}

export default function CostBuildsPage() {
  const [builds,       setBuilds]       = useState<Build[]>([])
  const [sites,        setSites]        = useState<Site[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showCreate,   setShowCreate]   = useState(false)
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [buildDetail,  setBuildDetail]  = useState<{ build: Build; lines: BuildLine[]; zeroCostCount: number } | null>(null)
  const [loadingLines, setLoadingLines] = useState(false)
  const [running,      setRunning]      = useState(false)
  const [actioning,    setActioning]    = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [filterSite,   setFilterSite]   = useState('')
  const [form, setForm] = useState({
    siteId: '', name: '', description: '', defaultStrategy: 'BOM_ROLLUP', notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [bRes, sRes] = await Promise.all([
      fetch('/api/cost-builds'),
      fetch('/api/sites'),
    ])
    const [bJson, sJson] = await Promise.all([bRes.json(), sRes.json()])
    setBuilds(bJson.data ?? [])
    setSites(sJson.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function openDetail(buildId: string) {
    setSelectedId(buildId)
    setBuildDetail(null)
    setLoadingLines(true)
    setError(null)
    const res = await fetch(`/api/cost-builds/${buildId}`)
    const json = await res.json()
    setLoadingLines(false)
    if (res.ok) setBuildDetail({ build: json.data, lines: json.lines ?? [], zeroCostCount: json.zeroCostCount ?? 0 })
    else setError(json.error)
  }

  async function createBuild(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/cost-builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: form.siteId,
        name: form.name,
        description: form.description || undefined,
        defaultStrategy: form.defaultStrategy,
        notes: form.notes || undefined,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error); return }
    setShowCreate(false)
    setForm({ siteId: '', name: '', description: '', defaultStrategy: 'BOM_ROLLUP', notes: '' })
    await load()
    openDetail(json.data.id)
  }

  async function runBuild(buildId: string) {
    setRunning(true); setError(null)
    const res = await fetch(`/api/cost-builds/${buildId}/run`, { method: 'POST' })
    const json = await res.json()
    setRunning(false)
    if (!res.ok) { setError(json.error ?? 'Build failed'); return }
    await load()
    openDetail(buildId)
  }

  async function approveBuild(buildId: string) {
    setActioning(true); setError(null)
    const res = await fetch(`/api/cost-builds/${buildId}/approve`, { method: 'POST' })
    const json = await res.json()
    setActioning(false)
    if (!res.ok) { setError(json.error ?? 'Approve failed'); return }
    await load()
    openDetail(buildId)
  }

  async function lockBuild(buildId: string) {
    if (!confirm('Lock this build? Locking is permanent — the build and its Cost Set cannot be modified after locking.')) return
    setActioning(true); setError(null)
    const res = await fetch(`/api/cost-builds/${buildId}/lock`, { method: 'POST' })
    const json = await res.json()
    setActioning(false)
    if (!res.ok) { setError(json.error ?? 'Lock failed'); return }
    await load()
    openDetail(buildId)
  }

  const filtered = filterSite
    ? builds.filter(b => b.sites?.id === filterSite)
    : builds

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>Cost Builds</h1>
          <p style={{ color: D.secondary, fontSize: '14px', margin: '4px 0 0' }}>
            Site → Cost Build → frozen Cost Set → Inventory Valuation
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setError(null) }}
          style={{ background: D.red, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
        >
          + New Cost Build
        </button>
      </div>

      {error && (
        <div style={{ background: D.redLight, border: `1px solid ${D.error}`, borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: D.error }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: D.dark }}>New Cost Build</h3>
          <form onSubmit={createBuild}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Site *</label>
                <select value={form.siteId} onChange={e => setForm(f => ({ ...f, siteId: e.target.value }))} required style={iStyle}>
                  <option value="">— select site —</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Germany Price List Jun 2026" style={iStyle} />
              </div>
              <div>
                <label style={labelStyle}>Default Strategy *</label>
                <select value={form.defaultStrategy} onChange={e => setForm(f => ({ ...f, defaultStrategy: e.target.value }))} style={iStyle}>
                  {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label} — {s.desc}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" style={iStyle} />
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" style={iStyle} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" style={{ background: D.red, color: '#fff', border: 'none', padding: '8px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
                Create Build
              </button>
              <button type="button" onClick={() => setShowCreate(false)} style={{ background: D.card, border: `1px solid ${D.border}`, padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', color: D.dark }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Site filter */}
      {sites.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button onClick={() => setFilterSite('')} style={{ fontSize: '13px', padding: '4px 14px', borderRadius: '20px', border: `1px solid ${!filterSite ? D.red : D.border}`, background: !filterSite ? D.redLight : D.card, color: !filterSite ? D.red : D.secondary, cursor: 'pointer' }}>
            All sites
          </button>
          {sites.map(s => (
            <button key={s.id} onClick={() => setFilterSite(s.id)} style={{ fontSize: '13px', padding: '4px 14px', borderRadius: '20px', border: `1px solid ${filterSite === s.id ? D.red : D.border}`, background: filterSite === s.id ? D.redLight : D.card, color: filterSite === s.id ? D.red : D.secondary, cursor: 'pointer' }}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Two-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedId ? '380px 1fr' : '1fr', gap: '20px', alignItems: 'start' }}>

        {/* Build list */}
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: D.secondary, fontSize: '14px' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚙️</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: D.dark, marginBottom: '8px' }}>No Cost Builds yet</div>
              <div style={{ fontSize: '14px', color: D.secondary, maxWidth: '400px', margin: '0 auto 20px', lineHeight: 1.5 }}>
                A Cost Build resolves prices for all SKUs using a Country Price List, then freezes the results into a Cost Set for Inventory Valuation.
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowCreate(true)}
                  style={{ background: D.red, color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
                >
                  + Create Cost Build
                </button>
                <a
                  href="/imports"
                  style={{ border: `1px solid ${D.border}`, padding: '10px 24px', borderRadius: '6px', fontSize: '14px', color: D.secondary, textDecoration: 'none', display: 'inline-block' }}
                >
                  Import Price List first →
                </a>
              </div>
            </div>
          ) : (
            filtered.map(build => (
              <div
                key={build.id}
                onClick={() => openDetail(build.id)}
                style={{ padding: '14px 16px', borderBottom: `1px solid ${D.border}`, cursor: 'pointer', background: selectedId === build.id ? '#FFF5F5' : D.card, borderLeft: selectedId === build.id ? `3px solid ${D.red}` : '3px solid transparent' }}
                onMouseEnter={e => { if (selectedId !== build.id) (e.currentTarget as HTMLElement).style.background = D.bg }}
                onMouseLeave={e => { if (selectedId !== build.id) (e.currentTarget as HTMLElement).style.background = D.card }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: D.dark, flex: 1, paddingRight: '8px' }}>{build.name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: STATUS_COLOR[build.status] ?? D.secondary, textTransform: 'uppercase', flexShrink: 0 }}>{build.status}</span>
                </div>
                <div style={{ fontSize: '12px', color: D.secondary, marginBottom: '6px' }}>
                  {build.sites?.name ?? '—'} · {STRATEGY_LABEL[build.default_strategy] ?? build.default_strategy}
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: D.secondary }}>
                  {build.status === 'complete' && (
                    <>
                      <span style={{ color: D.success }}>{build.line_count.toLocaleString()} lines</span>
                      {build.error_count > 0 && <span style={{ color: D.error }}>{build.error_count} errors</span>}
                    </>
                  )}
                  <span>{fmtDate(build.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div>
            {loadingLines ? (
              <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '32px', textAlign: 'center', color: D.secondary, fontSize: '14px' }}>
                Loading build detail…
              </div>
            ) : buildDetail ? (
              <BuildDetail
                build={buildDetail.build}
                lines={buildDetail.lines}
                zeroCostCount={buildDetail.zeroCostCount}
                running={running}
                actioning={actioning}
                onRun={() => runBuild(buildDetail.build.id)}
                onApprove={() => approveBuild(buildDetail.build.id)}
                onLock={() => lockBuild(buildDetail.build.id)}
                onClose={() => setSelectedId(null)}
                error={error}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Build Detail Panel ───────────────────────────────────────────────────────

function BuildDetail({
  build, lines, zeroCostCount, running, actioning, onRun, onApprove, onLock, onClose, error,
}: {
  build: Build; lines: BuildLine[]; zeroCostCount: number; running: boolean; actioning: boolean
  onRun: () => void; onApprove: () => void; onLock: () => void
  onClose: () => void; error: string | null
}) {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')

  const filteredLines = lines.filter(l => {
    const q = search.toLowerCase()
    const matchQ = !q || (l.skus?.part_number ?? '').toLowerCase().includes(q) || (l.source_reference ?? '').toLowerCase().includes(q)
    const matchType = !filterType || l.item_cost_type === filterType
    return matchQ && matchType
  })

  const typeGroups = [...new Set(lines.map(l => l.item_cost_type))].sort()

  const totalVal = lines.reduce((sum, l) => sum + Number(l.resolved_cost), 0)
  const missingLines = lines.filter(l => l.cost_strategy_used === 'none')

  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, paddingRight: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: D.dark, marginBottom: '4px' }}>{build.name}</div>
          <div style={{ fontSize: '13px', color: D.secondary }}>
            Site: <strong style={{ color: D.dark }}>{build.sites?.name ?? '—'}</strong>
            {' · '}Strategy: <strong style={{ color: D.dark }}>{STRATEGY_LABEL[build.default_strategy] ?? build.default_strategy}</strong>
            {build.cost_sets && (
              <>{' · '}Cost Set: <strong style={{ color: D.dark }}>{build.cost_sets.name}</strong></>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: D.secondary, lineHeight: 1 }}>×</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0', borderBottom: `1px solid ${D.border}` }}>
        {[
          { label: 'Status',      value: build.status.toUpperCase(), color: STATUS_COLOR[build.status] ?? D.secondary },
          { label: 'SKUs costed', value: (build.line_count).toLocaleString(), color: D.dark },
          { label: 'Zero-cost',   value: zeroCostCount.toLocaleString(), color: zeroCostCount > 0 ? D.warning : D.secondary },
          { label: 'Errors',      value: (build.error_count).toLocaleString(), color: build.error_count > 0 ? D.error : D.secondary },
          { label: 'Built',       value: build.built_at ? fmtDate(build.built_at) : '—', color: D.secondary },
        ].map(s => (
          <div key={s.label} style={{ padding: '12px 16px', borderRight: `1px solid ${D.border}` }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: D.secondary }}>{s.label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: '12px 20px', background: D.redLight, borderBottom: `1px solid ${D.border}`, fontSize: '13px', color: D.error }}>
          {error}
        </div>
      )}

      {/* Run button */}
      {(build.status === 'draft' || build.status === 'failed') && (
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}` }}>
          <button
            onClick={onRun}
            disabled={running}
            style={{ background: D.red, color: '#fff', border: 'none', padding: '10px 28px', borderRadius: '6px', cursor: running ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 600, opacity: running ? 0.7 : 1 }}
          >
            {running ? '⏳ Running build…' : '▶ Run Cost Build'}
          </button>
          <div style={{ fontSize: '12px', color: D.secondary, marginTop: '6px' }}>
            Resolves costs for all active SKUs and creates a frozen Cost Set.
          </div>
        </div>
      )}

      {/* Approve button — complete → approved */}
      {build.status === 'complete' && (
        <>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={onApprove}
              disabled={actioning}
              style={{ background: D.teal, color: '#fff', border: 'none', padding: '10px 28px', borderRadius: '6px', cursor: actioning ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 600, opacity: actioning ? 0.7 : 1 }}
            >
              {actioning ? '…' : '✓ Approve Build'}
            </button>
            <div style={{ fontSize: '12px', color: D.secondary }}>
              Approves this build for use in Inventory Valuation. After approval, the build can be locked.
            </div>
          </div>
          {/* Next step: import inventory while approving */}
          <div style={{ padding: '12px 20px', background: '#EFF6FF', borderBottom: `1px solid #BFDBFE`, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ color: '#1e40af' }}>
              Costs resolved. <strong>Next:</strong> import your on-hand inventory quantities, then run Inventory Valuation.
            </span>
            <a href="/imports" style={{ background: '#1565c0', color: '#fff', textDecoration: 'none', padding: '6px 14px', borderRadius: '5px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
              Import Inventory →
            </a>
          </div>
        </>
      )}

      {/* Lock button — approved → locked */}
      {build.status === 'approved' && (
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={onLock}
            disabled={actioning}
            style={{ background: D.dark, color: '#fff', border: 'none', padding: '10px 28px', borderRadius: '6px', cursor: actioning ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 600, opacity: actioning ? 0.7 : 1 }}
          >
            {actioning ? '…' : '🔒 Lock Build'}
          </button>
          <div style={{ fontSize: '12px', color: D.secondary }}>
            Permanently locks this build. The build and its Cost Set cannot be modified after locking.
          </div>
        </div>
      )}

      {build.status === 'locked' && (
        <div style={{ padding: '12px 20px', background: '#F1F5F9', borderBottom: `1px solid ${D.border}`, fontSize: '13px', color: D.secondary, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <span>🔒 This build is <strong>locked</strong> and immutable. Cost Set values are permanent.</span>
          <a href="/inventory" style={{ background: '#0d9488', color: '#fff', textDecoration: 'none', padding: '6px 14px', borderRadius: '5px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
            Run Inventory Valuation →
          </a>
        </div>
      )}

      {build.status === 'approved' && (
        <div style={{ padding: '12px 20px', background: '#F0FDF4', borderBottom: `1px solid #86EFAC`, fontSize: '13px', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <span>✓ Build is <strong>approved</strong>. You can now run Inventory Valuation or lock the build to make it permanent.</span>
          <a href="/inventory" style={{ background: '#16a34a', color: '#fff', textDecoration: 'none', padding: '6px 14px', borderRadius: '5px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
            Run Inventory Valuation →
          </a>
        </div>
      )}

      {/* Cost set link */}
      {build.cost_sets && (
        <div style={{ padding: '12px 20px', background: '#F0F9FF', borderBottom: `1px solid ${D.border}`, fontSize: '13px' }}>
          <span style={{ color: D.secondary }}>Frozen Cost Set: </span>
          <strong style={{ color: D.dark }}>{build.cost_sets.name}</strong>
          <span style={{ marginLeft: '8px', fontSize: '11px', background: D.success, color: '#fff', padding: '1px 6px', borderRadius: '3px' }}>FROZEN</span>
        </div>
      )}

      {/* Build lines */}
      {lines.length > 0 && (
        <div>
          {/* Filters */}
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search part number or source…"
              style={{ flex: 1, minWidth: '200px', padding: '6px 10px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '13px', background: D.bg }}
            />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '6px 10px', border: `1px solid ${D.border}`, borderRadius: '4px', fontSize: '13px', background: D.card }}>
              <option value="">All types</option>
              {typeGroups.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span style={{ fontSize: '12px', color: D.secondary, whiteSpace: 'nowrap' }}>
              {filteredLines.length.toLocaleString()} of {lines.length.toLocaleString()} lines
            </span>
          </div>

          {/* Missing cost warning */}
          {missingLines.length > 0 && (
            <div style={{ padding: '10px 20px', background: '#FFFBEB', borderBottom: `1px solid #FDE68A`, fontSize: '13px', color: '#92400E' }}>
              ⚠ {missingLines.length} SKU{missingLines.length !== 1 ? 's' : ''} could not be costed — no price or BOM found.
            </div>
          )}

          {/* Table */}
          <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ position: 'sticky', top: 0, background: D.bg, zIndex: 1 }}>
                <tr style={{ borderBottom: `1px solid ${D.border}` }}>
                  {['Part Number', 'Item Type', 'Strategy Used', 'Source', 'Fallback Path', 'Cost'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: D.secondary, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line, i) => (
                  <tr key={line.id} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? D.card : D.bg }}>
                    <td style={{ padding: '7px 14px', fontFamily: 'monospace', color: D.dark }}>
                      {line.skus?.part_number ?? line.sku_id.slice(0, 8)}
                      {line.skus?.name && <div style={{ fontSize: '11px', color: D.secondary, fontFamily: 'inherit' }}>{line.skus.name}</div>}
                    </td>
                    <td style={{ padding: '7px 14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: ITEM_TYPE_COLOR[line.item_cost_type] ?? D.secondary }}>{line.item_cost_type}</span>
                    </td>
                    <td style={{ padding: '7px 14px', color: line.cost_strategy_used === 'none' ? D.error : D.dark }}>
                      {line.cost_strategy_used === 'none' ? '— missing —' : line.cost_strategy_used}
                    </td>
                    <td style={{ padding: '7px 14px', fontSize: '12px', color: D.secondary, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {line.source_reference ?? '—'}
                    </td>
                    <td style={{ padding: '7px 14px', fontSize: '11px', color: D.secondary }}>
                      {line.fallback_path?.length
                        ? line.fallback_path.map((f: any) => f.strategy).join(' → ')
                        : '—'}
                    </td>
                    <td style={{ padding: '7px 14px', fontFamily: 'monospace', fontWeight: 600, color: line.cost_strategy_used === 'none' ? D.error : D.dark, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {line.cost_strategy_used !== 'none' ? fmtCost(Number(line.resolved_cost), line.currency) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '10px 20px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: D.secondary }}>
            <span>Sum of resolved costs (informational — not a total inventory value)</span>
            <span style={{ fontWeight: 700, color: D.dark, fontFamily: 'monospace' }}>
              {totalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {lines.length === 0 && build.status === 'complete' && (
        <div style={{ padding: '32px', textAlign: 'center', color: D.secondary, fontSize: '14px' }}>No lines in this build.</div>
      )}
      {lines.length === 0 && build.status !== 'complete' && build.status !== 'running' && (
        <div style={{ padding: '24px', textAlign: 'center', color: D.secondary, fontSize: '14px' }}>
          Run the build to compute costs for all active SKUs.
        </div>
      )}
    </div>
  )
}

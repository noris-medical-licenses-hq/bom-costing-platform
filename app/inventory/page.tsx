'use client'
import { useState, useEffect, useCallback } from 'react'
import { GuidancePanel } from '../components/GuidancePanel'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', warning: '#d97706', error: '#dc2626',
  blue: '#1565c0', teal: '#0d9488',
  successLight: '#F0FDF4', blueLight: '#EFF6FF', warnLight: '#FFFBEB',
}

const STATUS_COLOR: Record<string, string> = {
  draft: D.secondary, under_review: D.warning, approved: D.success, superseded: D.secondary, archived: D.secondary,
}
const VAL_STATUS_COLOR: Record<string, string> = {
  draft: D.secondary, running: D.warning, complete: D.success, approved: D.blue, locked: D.dark, failed: D.error,
}

type Site      = { id: string; name: string; code: string; country: string | null }
type BestBuild = { id: string; name: string; status: string; site_id: string; cost_sets: { id: string; name: string; base_currency: string } | null }
type LatestVal = { id: string; snapshot_id: string; status: string; total_value: number | null; valuation_currency: string; created_at: string }
type CostSet   = { id: string; name: string; base_currency: string }
type SiteBuild = { id: string; name: string; status: string; cost_sets: { id: string; name: string; base_currency: string } | null }

type EnrichedSnapshot = {
  id: string; snapshot_name: string; snapshot_date: string; snapshot_type: string
  status: string; base_currency: string; line_count: number | null
  total_value: number | null; missing_cost_count: number | null
  scope_site_id: string | null; cost_set_id: string
  site: Site | null
  best_build: BestBuild | null
  latest_valuation: LatestVal | null
}

// ─── Smart Valuation Wizard ───────────────────────────────────────────────────

type WizardState =
  | { phase: 'idle' }
  | { phase: 'confirm'; snap: EnrichedSnapshot }
  | { phase: 'running'; snap: EnrichedSnapshot }
  | { phase: 'done'; snap: EnrichedSnapshot; reportId: string; totalValue: number | null; lineCount: number | null; missingCostCount: number | null; currency: string }
  | { phase: 'error'; snap: EnrichedSnapshot; message: string }

function fmtVal(v: number | null, ccy?: string) {
  if (v == null) return '—'
  return (ccy ? ccy + ' ' : '') + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function WizardModal({ state, onConfirm, onClose, onRun, overrideCurrency, setOverrideCurrency }: {
  state: WizardState
  onConfirm: () => void
  onClose: () => void
  onRun: () => void
  overrideCurrency: string
  setOverrideCurrency: (c: string) => void
}) {
  if (state.phase === 'idle') return null
  const snap  = 'snap' in state ? state.snap : null
  const build = snap?.best_build ?? null
  const suggestedCcy = build?.cost_sets?.base_currency ?? snap?.base_currency ?? 'EUR'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: D.card, borderRadius: '10px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Step 4 of 4</div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: D.dark }}>Value Inventory</div>
          </div>
          {state.phase !== 'running' && (
            <button onClick={onClose} style={{ fontSize: '20px', color: D.secondary, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}>×</button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>

          {/* Confirm phase */}
          {state.phase === 'confirm' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: D.secondary, marginBottom: '4px' }}>SNAPSHOT</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: D.dark }}>{snap!.snapshot_name}</div>
                <div style={{ fontSize: '12px', color: D.secondary }}>{snap!.snapshot_date} · {snap!.line_count?.toLocaleString() ?? 0} lines</div>
              </div>

              {build ? (
                <div style={{ marginBottom: '16px', background: D.successLight, border: '1px solid #86EFAC', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: D.secondary, marginBottom: '4px' }}>COST BUILD (auto-detected)</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: D.dark }}>{build.name}</div>
                  <div style={{ fontSize: '12px', color: D.secondary }}>
                    {build.cost_sets?.name ?? '—'} · status: <span style={{ color: STATUS_COLOR[build.status] ?? D.secondary, fontWeight: 600 }}>{build.status}</span>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '16px', background: D.warnLight, border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#92400E' }}>
                  No approved Cost Build found for this site.{' '}
                  <a href="/cost-builds" style={{ color: D.red, fontWeight: 600 }}>Create one →</a>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '6px' }}>VALUATION CURRENCY</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    value={overrideCurrency}
                    onChange={e => setOverrideCurrency(e.target.value.toUpperCase().slice(0, 3))}
                    maxLength={3}
                    style={{ width: '80px', padding: '8px 10px', border: `1px solid ${D.border}`, borderRadius: '6px', fontSize: '14px', fontWeight: 600, textAlign: 'center', background: D.card }}
                  />
                  {overrideCurrency !== suggestedCcy && (
                    <button onClick={() => setOverrideCurrency(suggestedCcy)} style={{ fontSize: '12px', color: D.secondary, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                      Reset to {suggestedCcy}
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: D.secondary, marginTop: '4px' }}>Suggested from Cost Build · {suggestedCcy}</div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={onRun}
                  disabled={!build}
                  style={{ flex: 1, background: build ? D.teal : D.border, color: '#fff', border: 'none', padding: '12px', borderRadius: '6px', fontSize: '15px', fontWeight: 700, cursor: build ? 'pointer' : 'not-allowed' }}
                >
                  Run Valuation →
                </button>
                <button onClick={onClose} style={{ padding: '12px 16px', border: `1px solid ${D.border}`, borderRadius: '6px', fontSize: '14px', background: D.card, color: D.secondary, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {/* Running phase */}
          {state.phase === 'running' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '36px', marginBottom: '16px' }}>⚙️</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: D.dark, marginBottom: '8px' }}>Running valuation…</div>
              <div style={{ fontSize: '13px', color: D.secondary }}>Pricing {snap!.line_count?.toLocaleString() ?? 'all'} inventory lines against {build?.name ?? 'Cost Set'}.</div>
              <div style={{ marginTop: '16px', height: '4px', background: D.border, borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: D.teal, width: '60%', borderRadius: '2px', animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            </div>
          )}

          {/* Done phase */}
          {state.phase === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: D.dark, marginBottom: '6px' }}>Valuation complete</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: D.teal, fontFamily: 'monospace', marginBottom: '4px' }}>
                {fmtVal(state.totalValue, state.currency)}
              </div>
              <div style={{ fontSize: '13px', color: D.secondary, marginBottom: '20px' }}>
                {state.lineCount?.toLocaleString() ?? 0} lines
                {(state.missingCostCount ?? 0) > 0 && (
                  <span style={{ color: D.error }}> · ⚠ {state.missingCostCount} missing costs</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <a
                  href={`/valuation-reports/${state.reportId}`}
                  style={{ background: D.teal, color: '#fff', textDecoration: 'none', padding: '10px 24px', borderRadius: '6px', fontSize: '14px', fontWeight: 700 }}
                >
                  Open Report →
                </a>
                <button onClick={onClose} style={{ padding: '10px 20px', border: `1px solid ${D.border}`, borderRadius: '6px', fontSize: '14px', background: D.card, color: D.secondary, cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Error phase */}
          {state.phase === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>❌</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: D.error, marginBottom: '8px' }}>Valuation failed</div>
              <div style={{ fontSize: '13px', color: D.secondary, marginBottom: '20px', lineHeight: 1.5 }}>{state.message}</div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button onClick={onConfirm} style={{ background: D.red, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                  Try Again
                </button>
                <button onClick={onClose} style={{ padding: '10px 16px', border: `1px solid ${D.border}`, borderRadius: '6px', fontSize: '14px', background: D.card, color: D.secondary, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [snapshots,  setSnapshots]  = useState<EnrichedSnapshot[]>([])
  const [sites,      setSites]      = useState<Site[]>([])
  const [siteBuilds, setSiteBuilds] = useState<SiteBuild[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [form, setForm] = useState({
    snapshot_name: '', snapshot_date: new Date().toISOString().slice(0, 10),
    snapshot_type: 'full', scope_site_id: '', base_currency: 'EUR',
  })

  // Wizard state
  const [wizard, setWizard] = useState<WizardState>({ phase: 'idle' })
  const [overrideCurrency, setOverrideCurrency] = useState('EUR')

  // Resolve the best approved/locked/complete build for the selected site
  const PRIO: Record<string, number> = { approved: 3, locked: 2, complete: 1 }
  function bestBuildForSite(siteId: string): SiteBuild | null {
    return siteBuilds
      .filter(b => (b as any).site_id === siteId && PRIO[(b as any).status] != null)
      .sort((a, b) => (PRIO[(b as any).status] ?? 0) - (PRIO[(a as any).status] ?? 0))[0] ?? null
  }

  const selectedSiteBuild = form.scope_site_id ? bestBuildForSite(form.scope_site_id) : null

  async function loadSiteBuilds(siteId: string) {
    const res  = await fetch(`/api/cost-builds?siteId=${siteId}`)
    const json = await res.json()
    setSiteBuilds(json.data ?? [])
  }

  function handleSiteChange(siteId: string) {
    setForm(f => ({ ...f, scope_site_id: siteId }))
    setSiteBuilds([])
    if (siteId) loadSiteBuilds(siteId)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [sRes, sitesRes] = await Promise.all([
      fetch('/api/inventory?enriched=true'),
      fetch('/api/sites'),
    ])
    const [sJson, sitesJson] = await Promise.all([sRes.json(), sitesRes.json()])
    setSnapshots(sJson.data ?? [])
    setSites(sitesJson.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setFormError(null)
    const build = form.scope_site_id ? bestBuildForSite(form.scope_site_id) : null
    if (!build?.cost_sets?.id) {
      setFormError('No approved Cost Build found for this site. Create one first under Cost Builds.')
      return
    }
    const payload = {
      snapshot_name:     form.snapshot_name,
      snapshot_date:     form.snapshot_date,
      snapshot_type:     form.snapshot_type,
      cost_set_id:       build.cost_sets.id,
      base_currency:     build.cost_sets.base_currency,
      scope_site_id:     form.scope_site_id || null,
    }
    const res = await fetch('/api/inventory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (res.ok) { setShowCreate(false); load() }
    else setFormError(json.error)
  }

  function openWizard(snap: EnrichedSnapshot) {
    const suggestedCcy = snap.best_build?.cost_sets?.base_currency ?? snap.base_currency ?? 'EUR'
    setOverrideCurrency(suggestedCcy)
    setWizard({ phase: 'confirm', snap })
  }

  async function runValuation() {
    if (wizard.phase !== 'confirm' && wizard.phase !== 'error') return
    const snap  = wizard.snap
    const build = snap.best_build
    if (!build) return

    setWizard({ phase: 'running', snap })

    try {
      const res = await fetch(`/api/inventory/${snap.id}/quick-value`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildId: build.id, currency: overrideCurrency, scenario: 'management' }),
      })
      const json = await res.json()
      if (!res.ok) {
        setWizard({ phase: 'error', snap, message: json.error ?? 'Valuation failed' })
        return
      }
      setWizard({
        phase:            'done',
        snap,
        reportId:         json.data.reportId,
        totalValue:       json.data.totalValue,
        lineCount:        json.data.lineCount,
        missingCostCount: json.data.missingCostCount,
        currency:         json.data.currency,
      })
      // Refresh list so the "Last Valuation" column updates
      load()
    } catch (err) {
      setWizard({ phase: 'error', snap: wizard.snap, message: String(err) })
    }
  }

  function closeWizard() {
    setWizard({ phase: 'idle' })
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
      {/* Wizard overlay */}
      <WizardModal
        state={wizard}
        onConfirm={() => setWizard({ phase: 'confirm', snap: (wizard as any).snap })}
        onClose={closeWizard}
        onRun={runValuation}
        overrideCurrency={overrideCurrency}
        setOverrideCurrency={setOverrideCurrency}
      />

      <GuidancePanel moduleKey="inventory" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>Inventory Snapshots</h1>
          <p style={{ color: D.secondary, fontSize: '14px', margin: '4px 0 0' }}>
            Capture on-hand quantities, then click <strong>Value Inventory</strong> to compute stock value.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setFormError(null) }}
          style={{ background: showCreate ? D.card : D.red, color: showCreate ? D.dark : '#fff', border: `1px solid ${showCreate ? D.border : D.red}`, padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
        >
          {showCreate ? 'Cancel' : '+ New Snapshot'}
        </button>
      </div>

      {formError && (
        <div style={{ background: '#FEF2F2', border: `1px solid ${D.error}`, borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: D.error }}>
          {formError}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: D.dark }}>New Inventory Snapshot</h3>
          <p style={{ margin: '0 0 20px', fontSize: '12px', color: D.secondary }}>Select a site — the Cost Build and currency are resolved automatically.</p>
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
              <label style={labelStyle}>Site *</label>
              <select value={form.scope_site_id} onChange={e => handleSiteChange(e.target.value)} required style={iStyle}>
                <option value="">— select site —</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Auto-resolved Cost Build</label>
              {!form.scope_site_id ? (
                <div style={{ padding: '8px 10px', border: `1px solid ${D.border}`, borderRadius: '6px', fontSize: '13px', color: D.secondary, background: D.bg }}>Select a site first</div>
              ) : selectedSiteBuild ? (
                <div style={{ padding: '8px 12px', border: '1px solid #86EFAC', borderRadius: '6px', fontSize: '13px', background: '#F0FDF4', color: '#15803d' }}>
                  <strong>{selectedSiteBuild.name}</strong>
                  <span style={{ marginLeft: '8px', color: '#166534', fontSize: '12px' }}>
                    {selectedSiteBuild.cost_sets?.name} · {selectedSiteBuild.cost_sets?.base_currency} · {selectedSiteBuild.status}
                  </span>
                </div>
              ) : (
                <div style={{ padding: '8px 12px', border: `1px solid #FDE68A`, borderRadius: '6px', fontSize: '13px', background: '#FFFBEB', color: '#92400E' }}>
                  No approved Cost Build for this site —{' '}
                  <a href="/cost-builds" style={{ color: D.red, fontWeight: 600 }}>create one first</a>
                </div>
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={!selectedSiteBuild}
            style={{ background: selectedSiteBuild ? D.red : D.border, color: '#fff', border: 'none', padding: '8px 24px', borderRadius: '6px', cursor: selectedSiteBuild ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 600 }}
          >
            Create Snapshot
          </button>
        </form>
      )}

      {/* Snapshot table */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: D.secondary, fontSize: '14px' }}>Loading…</div>
      ) : (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                {['Snapshot', 'Site', 'Date', 'Status', 'Cost Build', 'Last Valuation', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: D.secondary, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px 32px', textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: D.dark, marginBottom: '8px' }}>No inventory snapshots yet</div>
                    <div style={{ fontSize: '13px', color: D.secondary, maxWidth: '380px', margin: '0 auto 16px', lineHeight: 1.5 }}>
                      Create a snapshot to capture on-hand quantities, then click <strong>Value Inventory</strong> to compute stock value using an approved Cost Build.
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button onClick={() => setShowCreate(true)} style={{ background: D.red, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                        + New Snapshot
                      </button>
                      <a href="/cost-builds" style={{ border: `1px solid ${D.border}`, padding: '8px 20px', borderRadius: '6px', fontSize: '13px', color: D.secondary, textDecoration: 'none', display: 'inline-block' }}>
                        Check Cost Builds →
                      </a>
                    </div>
                  </td>
                </tr>
              ) : snapshots.map((snap, i) => {
                const build    = snap.best_build
                const lastVal  = snap.latest_valuation
                const canValue = !!build && ['complete', 'approved', 'locked'].includes(build.status)

                return (
                  <tr key={snap.id} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? D.card : D.bg }}>

                    {/* Snapshot name + lines count */}
                    <td style={{ padding: '10px 14px' }}>
                      <a href={`/inventory/${snap.id}`} style={{ fontWeight: 600, color: D.dark, textDecoration: 'none' }}>
                        {snap.snapshot_name}
                      </a>
                      {snap.line_count != null && (
                        <div style={{ fontSize: '11px', color: D.secondary }}>{snap.line_count.toLocaleString()} lines</div>
                      )}
                    </td>

                    {/* Site */}
                    <td style={{ padding: '10px 14px', color: D.secondary }}>
                      {snap.site ? (
                        <span title={snap.site.country ?? undefined}>{snap.site.name}</span>
                      ) : '—'}
                    </td>

                    {/* Date */}
                    <td style={{ padding: '10px 14px', color: D.secondary, whiteSpace: 'nowrap' }}>{snap.snapshot_date}</td>

                    {/* Snapshot status */}
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ color: STATUS_COLOR[snap.status] ?? D.secondary, fontWeight: 500 }}>{snap.status}</span>
                    </td>

                    {/* Cost Build */}
                    <td style={{ padding: '10px 14px' }}>
                      {build ? (
                        <div>
                          <div style={{ fontWeight: 500, color: D.dark, fontSize: '12px' }}>{build.name}</div>
                          <div style={{ fontSize: '11px' }}>
                            <span style={{ color: STATUS_COLOR[build.status] ?? D.secondary, fontWeight: 600 }}>{build.status}</span>
                            {build.cost_sets && <span style={{ color: D.secondary }}> · {build.cost_sets.base_currency}</span>}
                          </div>
                        </div>
                      ) : (
                        <a href="/cost-builds" style={{ fontSize: '12px', color: D.warning, textDecoration: 'none' }}>
                          No approved build →
                        </a>
                      )}
                    </td>

                    {/* Last Valuation */}
                    <td style={{ padding: '10px 14px' }}>
                      {lastVal ? (
                        <div>
                          <span style={{ color: VAL_STATUS_COLOR[lastVal.status] ?? D.secondary, fontWeight: 600, fontSize: '12px' }}>{lastVal.status}</span>
                          {lastVal.total_value != null && (
                            <div style={{ fontSize: '12px', fontFamily: 'monospace', color: D.dark }}>{fmtVal(lastVal.total_value, lastVal.valuation_currency)}</div>
                          )}
                          <div style={{ fontSize: '11px', color: D.secondary }}>{fmtDate(lastVal.created_at)}</div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: D.secondary }}>—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {canValue ? (
                          <button
                            onClick={() => openWizard(snap)}
                            style={{
                              background: D.teal, color: '#fff', border: 'none',
                              padding: '5px 14px', borderRadius: '5px',
                              fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            Value Inventory
                          </button>
                        ) : (
                          <span style={{ fontSize: '11px', color: D.secondary }}>Need Cost Build</span>
                        )}
                        <a
                          href={`/inventory/${snap.id}`}
                          style={{ fontSize: '12px', fontWeight: 600, color: D.red, textDecoration: 'none' }}
                        >
                          Open
                        </a>
                        {lastVal && (
                          <a
                            href={`/valuation-reports/${lastVal.id}`}
                            style={{ fontSize: '11px', fontWeight: 600, color: D.blue, textDecoration: 'none' }}
                          >
                            Report
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

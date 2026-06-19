'use client'
import { useState, useEffect, useCallback } from 'react'
import type { ReadinessResponse, SiteReadiness, ItemStatus } from '../api/readiness/route'

const D = {
  dark: '#222222', secondary: '#666666', bg: '#F8F9FA', card: '#FFFFFF',
  border: '#E5E7EB', red: '#C62839', success: '#16a34a', warning: '#d97706',
  blue: '#1565c0', error: '#dc2626', redLight: '#FEF2F2', teal: '#0d9488',
  successLight: '#F0FDF4', warnLight: '#FFFBEB', blueLight: '#EFF6FF',
}

const STATUS_COLOR: Record<ItemStatus, string> = {
  READY:   D.success,
  PARTIAL: D.warning,
  BLOCKED: D.error,
}
const STATUS_BG: Record<ItemStatus, string> = {
  READY:   D.successLight,
  PARTIAL: D.warnLight,
  BLOCKED: D.redLight,
}
const STATUS_ICON: Record<ItemStatus, string> = {
  READY:   '✓',
  PARTIAL: '~',
  BLOCKED: '✗',
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? D.success : score >= 50 ? D.warning : D.error
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <div style={{
        width: '52px', height: '52px', borderRadius: '50%',
        border: `4px solid ${color}`, background: D.card,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', fontWeight: 800, color,
      }}>
        {score}
      </div>
      <div style={{ fontSize: '10px', color: D.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>score</div>
    </div>
  )
}

function StatusPill({ status }: { status: ItemStatus }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
      background: STATUS_BG[status], color: STATUS_COLOR[status],
      border: `1px solid ${STATUS_COLOR[status]}33`,
    }}>
      <span>{STATUS_ICON[status]}</span>
      {status}
    </span>
  )
}

function ReadinessRow({ label, item }: { label: string; item: SiteReadiness['price_list'] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${D.border}` }}>
      <StatusPill status={item.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: D.dark }}>{label}</div>
        {item.detail && (
          <div style={{ fontSize: '11px', color: D.secondary, marginTop: '2px', lineHeight: 1.4 }}>{item.detail}</div>
        )}
      </div>
      <a href={item.href} style={{ fontSize: '11px', color: D.blue, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
        Go →
      </a>
    </div>
  )
}

function SiteCard({ site }: { site: SiteReadiness }) {
  const [expanded, setExpanded] = useState(false)
  const scoreColor = site.score >= 75 ? D.success : site.score >= 50 ? D.warning : D.error

  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', overflow: 'hidden' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px', background: site.score < 50 ? D.redLight : site.score < 75 ? D.warnLight : D.successLight }}
      >
        <ScoreRing score={site.score} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: D.dark }}>{site.site_name}</div>
          <div style={{ fontSize: '12px', color: D.secondary, marginTop: '2px' }}>
            {site.site_code}{site.country ? ` · ${site.country}` : ''}
          </div>
          {site.blocking_reason && (
            <div style={{ fontSize: '12px', color: D.error, marginTop: '4px', fontWeight: 500 }}>
              Blocked: {site.blocking_reason}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end', marginRight: '8px' }}>
          {([site.price_list, site.cost_build, site.snapshot, site.valuation] as const).map((item, i) => (
            <StatusPill key={i} status={item.status} />
          ))}
        </div>
        <div style={{ fontSize: '18px', color: D.secondary, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</div>
      </div>

      {/* Detail */}
      {expanded && (
        <div style={{ padding: '4px 20px 12px' }}>
          <ReadinessRow label="Price List" item={site.price_list} />
          <ReadinessRow label="Cost Build" item={site.cost_build} />
          <ReadinessRow label="Inventory Snapshot" item={site.snapshot} />
          <ReadinessRow label="Valuation Report" item={site.valuation} />
        </div>
      )}
    </div>
  )
}

function OrgScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? D.success : score >= 50 ? D.warning : D.error
  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '20px 24px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: D.dark }}>Organisation Readiness Score</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color }}>{score}/100</div>
        </div>
        <div style={{ background: D.border, borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
          <div style={{ width: `${score}%`, height: '100%', background: color, transition: 'width 0.4s ease', borderRadius: '4px' }} />
        </div>
        <div style={{ fontSize: '12px', color: D.secondary, marginTop: '6px' }}>
          {score >= 75 ? 'All sites ready for valuation.' : score >= 50 ? 'Some sites need attention before period-end valuation.' : 'Action required — multiple sites are blocked.'}
        </div>
      </div>
    </div>
  )
}

export default function ReadinessPage() {
  const [data,    setData]    = useState<ReadinessResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res  = await fetch('/api/readiness')
    const json = await res.json()
    setLoading(false)
    if (res.ok) setData(json.data)
    else setError(json.error ?? 'Failed to load readiness data')
  }, [])

  useEffect(() => { load() }, [load])

  const readySites   = data?.sites.filter(s => s.score === 100).length ?? 0
  const partialSites = data?.sites.filter(s => s.score > 0 && s.score < 100).length ?? 0
  const blockedSites = data?.sites.filter(s => s.score === 0).length ?? 0

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>Operational Readiness</h1>
          <p style={{ color: D.secondary, fontSize: '14px', margin: '4px 0 0' }}>
            Per-site pipeline status: Price List → Cost Build → Inventory → Valuation
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: '6px', padding: '7px 14px', fontSize: '13px', color: D.secondary, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: D.redLight, border: `1px solid ${D.error}`, borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: D.error }}>
          {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: '40px', color: D.secondary, fontSize: '14px' }}>Loading readiness data…</div>
      )}

      {data && (
        <>
          {/* Org score bar */}
          <OrgScoreBar score={data.org_score} />

          {/* Summary pills */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Sites Ready', count: readySites,   color: D.success, bg: D.successLight },
              { label: 'Sites Partial', count: partialSites, color: D.warning, bg: D.warnLight },
              { label: 'Sites Blocked', count: blockedSites, color: D.error,   bg: D.redLight },
            ].map(({ label, count, color, bg }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${color}33`, borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 800, color }}>{count}</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Per-site cards */}
          {data.sites.length === 0 ? (
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: D.dark, marginBottom: '8px' }}>No sites configured</div>
              <div style={{ fontSize: '13px', color: D.secondary, marginBottom: '16px' }}>Create at least one active site to see readiness status.</div>
              <a href="/sites" style={{ color: D.red, fontSize: '14px', fontWeight: 600 }}>Go to Sites →</a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.sites.sort((a, b) => a.score - b.score).map(site => (
                <SiteCard key={site.site_id} site={site} />
              ))}
            </div>
          )}

          <div style={{ fontSize: '11px', color: '#aaa', marginTop: '16px', textAlign: 'right' }}>
            Generated: {new Date(data.generated_at).toLocaleString()}
          </div>
        </>
      )}
    </div>
  )
}

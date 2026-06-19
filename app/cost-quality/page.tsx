'use client'
import { useState, useEffect, useCallback } from 'react'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', warning: '#d97706', error: '#dc2626',
  blue: '#1565c0', redLight: '#FEF2F2', warnLight: '#FFFBEB',
}

type UnresolvedSku = {
  sku_id: string
  part_number: string | null
  name: string | null
  family: string | null
  item_type: string | null
  item_cost_type: string | null
  zero_count: number
  build_names: string[]
  site_names: string[]
  strategies: string[]
}

type SummaryData = {
  skus: UnresolvedSku[]
  sku_count: number
  build_count: number
  days: number
}

const FIX_LINKS: Record<string, { label: string; href: string }> = {
  PRICE_LIST:       { label: 'Import Price List',       href: '/imports' },
  LAST_PURCHASE:    { label: 'Import Purchase History', href: '/imports' },
  AVERAGE_PURCHASE: { label: 'Import Purchase History', href: '/imports' },
  BOM_ROLLUP:       { label: 'Check BOM',               href: '/boms' },
  MFG_COST_ROLLUP:  { label: 'Check Mfg Structure',     href: '/mfg-structures' },
  none:             { label: 'Check SKU Setup',          href: '/skus' },
}

export default function CostQualityPage() {
  const [data,     setData]     = useState<SummaryData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [days,     setDays]     = useState(90)
  const [search,   setSearch]   = useState('')
  const [filterFamily, setFilterFamily] = useState('')

  const load = useCallback(async (d: number) => {
    setLoading(true)
    setError(null)
    const res  = await fetch(`/api/cost-builds/unresolved-summary?days=${d}`)
    const json = await res.json()
    setLoading(false)
    if (res.ok) setData(json.data)
    else setError(json.error)
  }, [])

  useEffect(() => { load(days) }, [load, days])

  const families = data ? [...new Set(data.skus.map(s => s.family).filter(Boolean))] as string[] : []

  const filtered = (data?.skus ?? []).filter(sku => {
    const q = search.toLowerCase()
    const matchQ = !q
      || (sku.part_number ?? '').toLowerCase().includes(q)
      || (sku.name ?? '').toLowerCase().includes(q)
    const matchF = !filterFamily || sku.family === filterFamily
    return matchQ && matchF
  })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>Cost Quality</h1>
          <p style={{ color: D.secondary, fontSize: '14px', margin: '4px 0 0' }}>
            SKUs that resolved to zero cost across recent builds — silent valuation gaps.
          </p>
        </div>
        <a href="/cost-builds" style={{ fontSize: '13px', color: D.secondary, textDecoration: 'none', padding: '8px 14px', border: `1px solid ${D.border}`, borderRadius: '6px', background: D.card }}>
          ← Cost Builds
        </a>
      </div>

      {error && (
        <div style={{ background: D.redLight, border: `1px solid ${D.error}`, borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: D.error }}>
          {error}
        </div>
      )}

      {/* Time range + KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '16px', marginBottom: '24px', alignItems: 'stretch' }}>
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: data && data.sku_count > 0 ? D.error : D.success }}>
            {loading ? '…' : (data?.sku_count ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: D.secondary, marginTop: '4px' }}>Zero-cost SKUs</div>
        </div>
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: D.dark }}>{loading ? '…' : (data?.build_count ?? 0)}</div>
          <div style={{ fontSize: '12px', color: D.secondary, marginTop: '4px' }}>Builds analysed</div>
        </div>
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: D.dark }}>{days}d</div>
          <div style={{ fontSize: '12px', color: D.secondary, marginTop: '4px' }}>Lookback window</div>
        </div>
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: D.secondary }}>LOOKBACK</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[30, 90, 180, 365].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: '4px 10px', fontSize: '12px', borderRadius: '4px',
                  border: `1px solid ${days === d ? D.red : D.border}`,
                  background: days === d ? D.redLight : D.card,
                  color: days === d ? D.red : D.secondary,
                  cursor: 'pointer',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {data && data.sku_count === 0 && !loading && (
        <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>✓</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: D.success, marginBottom: '4px' }}>No zero-cost SKUs in the last {days} days</div>
          <div style={{ fontSize: '13px', color: D.secondary }}>All SKUs in recent cost builds resolved to a non-zero cost.</div>
        </div>
      )}

      {/* Filters + table */}
      {data && data.sku_count > 0 && (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${D.border}`, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search part number or name…"
              style={{ flex: 1, minWidth: '200px', padding: '7px 10px', border: `1px solid ${D.border}`, borderRadius: '5px', fontSize: '13px', background: D.bg }}
            />
            {families.length > 0 && (
              <select
                value={filterFamily}
                onChange={e => setFilterFamily(e.target.value)}
                style={{ padding: '7px 10px', border: `1px solid ${D.border}`, borderRadius: '5px', fontSize: '13px', background: D.card }}
              >
                <option value="">All families</option>
                {families.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
            <span style={{ fontSize: '12px', color: D.secondary, whiteSpace: 'nowrap' }}>
              {filtered.length.toLocaleString()} of {data.sku_count.toLocaleString()} SKUs
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ position: 'sticky', top: 0, background: D.bg, zIndex: 1 }}>
                <tr style={{ borderBottom: `1px solid ${D.border}` }}>
                  {['Part Number', 'Description', 'Family', 'Cost Type', 'Appears In', 'Sites', 'Strategy Attempted', 'Suggested Fix'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: D.secondary, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((sku, i) => {
                  const primaryStrategy = sku.strategies[0] ?? 'none'
                  const fix = FIX_LINKS[primaryStrategy] ?? FIX_LINKS.none
                  return (
                    <tr key={sku.sku_id} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? D.card : D.bg }}>
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontWeight: 600, color: D.dark }}>
                        {sku.part_number ?? <span style={{ color: D.secondary }}>{sku.sku_id.slice(0, 8)}…</span>}
                      </td>
                      <td style={{ padding: '9px 14px', color: D.dark, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sku.name ?? '—'}
                      </td>
                      <td style={{ padding: '9px 14px', color: D.secondary, fontSize: '12px' }}>{sku.family ?? '—'}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: D.secondary }}>{sku.item_cost_type ?? sku.item_type ?? '—'}</span>
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: '12px', color: D.secondary }}>
                        <span style={{ color: D.warning, fontWeight: 600 }}>{sku.zero_count}</span>
                        {' '}build{sku.zero_count !== 1 ? 's' : ''}
                        {sku.build_names.length > 0 && (
                          <div style={{ fontSize: '11px', color: D.secondary, marginTop: '2px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sku.build_names.join(', ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: '12px', color: D.secondary }}>
                        {sku.site_names.join(', ') || '—'}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: '12px' }}>
                        {sku.strategies.map(s => (
                          <span key={s} style={{ display: 'inline-block', background: D.bg, border: `1px solid ${D.border}`, borderRadius: '3px', padding: '1px 5px', fontSize: '11px', marginRight: '4px', color: D.dark }}>
                            {s}
                          </span>
                        ))}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <a
                          href={fix.href}
                          style={{ fontSize: '12px', color: D.red, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
                        >
                          {fix.label} →
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: D.secondary, fontSize: '14px' }}>
              No results match your search.
            </div>
          )}
        </div>
      )}

      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: D.secondary, fontSize: '14px' }}>
          Scanning recent cost builds…
        </div>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', warning: '#d97706', error: '#dc2626',
  redLight: '#FEF2F2', blue: '#1565c0', purple: '#4a148c',
  teal: '#0d9488',
}

const ALL_STRATEGIES = [
  { value: 'PRICE_LIST',       label: 'Price List' },
  { value: 'BOM_ROLLUP',       label: 'BOM Rollup' },
  { value: 'LAST_PURCHASE',    label: 'Last Purchase' },
  { value: 'AVERAGE_PURCHASE', label: 'Average Purchase' },
]

const LOOKBACK_OPTIONS = [
  { value: 30,  label: '30 days'  },
  { value: 90,  label: '90 days'  },
  { value: 180, label: '180 days' },
  { value: 365, label: '365 days' },
  { value: 730, label: '730 days' },
]

interface ComparisonRow {
  strategy:         string
  strategyLabel:    string
  cost:             number | null
  currency:         string | null
  sourceReference:  string | null
  sourceRecordType: string | null
  sourceRecordId:   string | null
  status:           'ok' | 'missing' | 'zero' | 'currency_mismatch' | 'not_operational'
  statusNote:       string | null
}

interface ComparisonResult {
  skuId:                      string
  siteId:                     string
  buildCurrency:              string
  averagePurchaseLookbackDays: number
  rows:                       ComparisonRow[]
  lowestCost:                 number | null
  highestCost:                number | null
  currencyMismatch:           boolean
  runAt:                      string
}

interface Site { id: string; name: string; code: string }
interface Sku  { id: string; part_number: string; name: string }

const fmtCost = (n: number | null, currency: string | null) =>
  n === null ? '—' : `${currency ?? ''} ${n.toFixed(4)}`

const pct = (n: number, base: number) =>
  base === 0 ? '—' : `${((n - base) / base * 100).toFixed(1)}%`

const abs = (n: number, base: number) =>
  `${(n - base) >= 0 ? '+' : ''}${(n - base).toFixed(4)}`

export default function CostComparisonPage() {
  const [sites,     setSites]     = useState<Site[]>([])
  const [skus,      setSkus]      = useState<Sku[]>([])
  const [skuSearch, setSkuSearch] = useState('')

  const [form, setForm] = useState({
    siteId:                      '',
    skuId:                       '',
    strategies:                  ['PRICE_LIST', 'BOM_ROLLUP', 'LAST_PURCHASE', 'AVERAGE_PURCHASE'] as string[],
    buildCurrency:               'EUR',
    averagePurchaseLookbackDays: 365,
  })

  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<ComparisonResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sites').then(r => r.json()).then(d => setSites(d.data ?? []))
  }, [])

  useEffect(() => {
    if (!skuSearch || skuSearch.length < 2) { setSkus([]); return }
    const t = setTimeout(() => {
      fetch(`/api/skus?q=${encodeURIComponent(skuSearch)}&status=active`)
        .then(r => r.json())
        .then(d => setSkus(d.data ?? []))
    }, 300)
    return () => clearTimeout(t)
  }, [skuSearch])

  function toggleStrategy(v: string) {
    setForm(f => ({
      ...f,
      strategies: f.strategies.includes(v) ? f.strategies.filter(s => s !== v) : [...f.strategies, v],
    }))
  }

  async function runComparison() {
    if (!form.siteId || !form.skuId || form.strategies.length === 0) {
      setError('Select a site, a SKU, and at least one strategy.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/cost-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Comparison failed'); return }
      setResult(json.data)
    } catch (e) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const selectedSku  = skus.find(s => s.id === form.skuId) ?? null
  const selectedSite = sites.find(s => s.id === form.siteId) ?? null

  const cardStyle: React.CSSProperties = {
    background: D.card, borderRadius: '10px', border: `1px solid ${D.border}`,
    padding: '22px 24px', marginBottom: '20px',
  }
  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 700, color: D.dark, marginBottom: '5px', display: 'block' }
  const iStyle: React.CSSProperties = { width: '100%', fontSize: '13px', padding: '8px 10px', border: `1px solid ${D.border}`, borderRadius: '6px', background: '#fff', color: D.dark, boxSizing: 'border-box' }

  function rowBg(row: ComparisonRow, lowest: number | null, highest: number | null): string {
    if (row.status === 'missing' || row.status === 'not_operational') return '#F9FAFB'
    if (row.status === 'zero') return '#FFFBEB'
    if (row.status === 'currency_mismatch') return '#FFF7ED'
    if (row.cost === null) return '#F9FAFB'
    if (row.cost === lowest && lowest !== highest) return '#F0FDF4'
    if (row.cost === highest && lowest !== highest) return '#FEF2F2'
    return '#fff'
  }

  function statusBadge(row: ComparisonRow) {
    if (row.status === 'ok') return null
    const map: Record<string, [string, string]> = {
      missing:          ['#6B7280', '#F3F4F6'],
      zero:             [D.warning,  '#FFFBEB'],
      currency_mismatch:[D.warning,  '#FFF7ED'],
      not_operational:  ['#9CA3AF', '#F9FAFB'],
    }
    const [color, bg] = map[row.status] ?? ['#6B7280', '#F3F4F6']
    const labels: Record<string, string> = {
      missing: 'No data', zero: 'Zero cost', currency_mismatch: 'Currency mismatch', not_operational: 'Not operational',
    }
    return (
      <span style={{ fontSize: '11px', fontWeight: 700, color, background: bg, padding: '2px 7px', borderRadius: '4px', marginLeft: '6px' }}>
        {labels[row.status]}
      </span>
    )
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui,sans-serif', color: D.dark }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
          Cost Comparison
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, marginBottom: '6px' }}>Strategy Comparison</h1>
        <p style={{ fontSize: '14px', color: D.secondary, margin: 0 }}>
          Why does this SKU cost differently depending on the costing method? Compare up to 4 strategies side-by-side.
        </p>
      </div>

      {/* Config card */}
      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '18px' }}>
          {/* Site */}
          <div>
            <label style={labelStyle}>Site *</label>
            <select value={form.siteId} onChange={e => setForm(f => ({ ...f, siteId: e.target.value }))} style={iStyle}>
              <option value="">— select site —</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </select>
          </div>
          {/* Currency */}
          <div>
            <label style={labelStyle}>Compare Currency *</label>
            <input
              value={form.buildCurrency}
              onChange={e => setForm(f => ({ ...f, buildCurrency: e.target.value.toUpperCase().slice(0, 3) }))}
              maxLength={3}
              placeholder="EUR"
              style={iStyle}
            />
            <div style={{ fontSize: '11px', color: D.secondary, marginTop: '3px' }}>
              Average Purchase only includes records in this currency.
            </div>
          </div>
        </div>

        {/* SKU search */}
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>SKU *</label>
          <input
            value={skuSearch}
            onChange={e => { setSkuSearch(e.target.value); if (!e.target.value) setForm(f => ({ ...f, skuId: '' })) }}
            placeholder="Search by part number or name…"
            style={iStyle}
          />
          {skus.length > 0 && !form.skuId && (
            <div style={{ border: `1px solid ${D.border}`, borderTop: 'none', borderRadius: '0 0 6px 6px', background: '#fff', maxHeight: '160px', overflowY: 'auto' }}>
              {skus.map(s => (
                <div
                  key={s.id}
                  onClick={() => { setForm(f => ({ ...f, skuId: s.id })); setSkuSearch(`${s.part_number} — ${s.name}`) }}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: `1px solid ${D.border}` }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <strong>{s.part_number}</strong> — {s.name}
                </div>
              ))}
            </div>
          )}
          {form.skuId && selectedSku && (
            <div style={{ fontSize: '12px', color: D.success, marginTop: '4px' }}>
              ✓ {selectedSku.part_number} — {selectedSku.name}
              <button onClick={() => { setForm(f => ({ ...f, skuId: '' })); setSkuSearch('') }} style={{ marginLeft: '8px', fontSize: '11px', color: D.secondary, background: 'none', border: 'none', cursor: 'pointer' }}>
                ✕ clear
              </button>
            </div>
          )}
        </div>

        {/* Strategies */}
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Strategies to Compare</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {ALL_STRATEGIES.map(s => {
              const active = form.strategies.includes(s.value)
              return (
                <button
                  key={s.value}
                  onClick={() => toggleStrategy(s.value)}
                  style={{
                    fontSize: '13px', fontWeight: active ? 700 : 400,
                    padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
                    background: active ? D.blue : '#F3F4F6',
                    color: active ? '#fff' : D.dark,
                    border: `1px solid ${active ? D.blue : D.border}`,
                  }}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Lookback — only relevant for AVERAGE_PURCHASE */}
        {form.strategies.includes('AVERAGE_PURCHASE') && (
          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Average Purchase Lookback Window</label>
            <select value={form.averagePurchaseLookbackDays} onChange={e => setForm(f => ({ ...f, averagePurchaseLookbackDays: Number(e.target.value) }))} style={{ ...iStyle, maxWidth: '200px' }}>
              {LOOKBACK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}

        {/* Run button */}
        <button
          onClick={runComparison}
          disabled={loading || !form.siteId || !form.skuId || form.strategies.length === 0}
          style={{
            background: D.red, color: '#fff', border: 'none', borderRadius: '7px',
            padding: '10px 28px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
            opacity: (loading || !form.siteId || !form.skuId) ? 0.5 : 1,
          }}
        >
          {loading ? 'Comparing…' : 'Run Comparison'}
        </button>

        {error && <div style={{ marginTop: '12px', color: D.error, fontSize: '13px' }}>{error}</div>}
      </div>

      {/* Results */}
      {result && (
        <div style={cardStyle}>
          {/* Result header */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '16px', fontWeight: 800 }}>
                {selectedSku?.part_number ?? result.skuId}
              </div>
              <div style={{ fontSize: '13px', color: D.secondary }}>
                {selectedSku?.name}
              </div>
              <div style={{ fontSize: '12px', color: D.secondary, marginLeft: 'auto' }}>
                {selectedSite ? `${selectedSite.name} (${selectedSite.code})` : result.siteId}
                {' · '}Currency: <strong>{result.buildCurrency}</strong>
                {' · '}Ran: {new Date(result.runAt).toLocaleTimeString()}
              </div>
            </div>

            {/* Summary pills */}
            {result.lowestCost !== null && result.highestCost !== null && result.lowestCost !== result.highestCost && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '12px', background: '#F0FDF4', color: '#166534', padding: '5px 12px', borderRadius: '20px', fontWeight: 700 }}>
                  Lowest: {result.buildCurrency} {result.lowestCost.toFixed(4)}
                </div>
                <div style={{ fontSize: '12px', background: '#FEF2F2', color: '#991b1b', padding: '5px 12px', borderRadius: '20px', fontWeight: 700 }}>
                  Highest: {result.buildCurrency} {result.highestCost.toFixed(4)}
                </div>
                <div style={{ fontSize: '12px', background: '#F3F4F6', color: D.secondary, padding: '5px 12px', borderRadius: '20px' }}>
                  Spread: {result.buildCurrency} {(result.highestCost - result.lowestCost).toFixed(4)} ({((result.highestCost - result.lowestCost) / result.lowestCost * 100).toFixed(1)}%)
                </div>
                {result.currencyMismatch && (
                  <div style={{ fontSize: '12px', background: '#FFF7ED', color: '#92400e', padding: '5px 12px', borderRadius: '20px', fontWeight: 700 }}>
                    ⚠ Currency mismatch on some strategies
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Comparison table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8F9FA', borderBottom: `2px solid ${D.border}` }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, color: D.secondary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Strategy</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 700, color: D.secondary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Cost</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 700, color: D.secondary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>vs Lowest</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 700, color: D.secondary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>vs Lowest %</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, color: D.secondary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map(row => {
                  const bg       = rowBg(row, result.lowestCost, result.highestCost)
                  const isLowest = row.status === 'ok' && row.cost === result.lowestCost && result.lowestCost !== result.highestCost
                  const isHighest= row.status === 'ok' && row.cost === result.highestCost && result.lowestCost !== result.highestCost
                  const costColor= isLowest ? D.success : isHighest ? D.error : D.dark

                  return (
                    <tr key={row.strategy} style={{ background: bg, borderBottom: `1px solid ${D.border}` }}>
                      {/* Strategy */}
                      <td style={{ padding: '12px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {row.strategyLabel}
                        {statusBadge(row)}
                        {isLowest  && <span style={{ fontSize: '10px', color: D.success, marginLeft: '6px' }}>▼ lowest</span>}
                        {isHighest && <span style={{ fontSize: '10px', color: D.error,   marginLeft: '6px' }}>▲ highest</span>}
                      </td>
                      {/* Cost */}
                      <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, color: costColor, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {row.cost !== null ? `${row.currency} ${row.cost.toFixed(4)}` : '—'}
                      </td>
                      {/* Absolute variance */}
                      <td style={{ padding: '12px 12px', textAlign: 'right', color: D.secondary, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {row.cost !== null && result.lowestCost !== null && row.status === 'ok'
                          ? abs(row.cost, result.lowestCost)
                          : '—'}
                      </td>
                      {/* % variance */}
                      <td style={{ padding: '12px 12px', textAlign: 'right', color: D.secondary, whiteSpace: 'nowrap' }}>
                        {row.cost !== null && result.lowestCost !== null && row.status === 'ok'
                          ? pct(row.cost, result.lowestCost)
                          : '—'}
                      </td>
                      {/* Source */}
                      <td style={{ padding: '12px 12px', color: D.secondary, fontSize: '12px', maxWidth: '280px' }}>
                        {row.statusNote
                          ? <span style={{ color: row.status === 'missing' || row.status === 'not_operational' ? '#9CA3AF' : D.warning }}>{row.statusNote}</span>
                          : row.sourceReference ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ marginTop: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: D.secondary }}>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#F0FDF4', border: `1px solid #86EFAC`, borderRadius: '2px', marginRight: '4px' }}></span>Lowest cost</span>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#FEF2F2', border: `1px solid #FCA5A5`, borderRadius: '2px', marginRight: '4px' }}></span>Highest cost</span>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#FFFBEB', border: `1px solid #FDE68A`, borderRadius: '2px', marginRight: '4px' }}></span>Zero cost — verify data</span>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#FFF7ED', border: `1px solid #FED7AA`, borderRadius: '2px', marginRight: '4px' }}></span>Currency mismatch</span>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#F9FAFB', border: `1px solid ${D.border}`, borderRadius: '2px', marginRight: '4px' }}></span>No data / not operational</span>
          </div>

          {/* Interpretation guidance */}
          {result.lowestCost !== null && result.highestCost !== null && result.lowestCost !== result.highestCost && (
            <div style={{ marginTop: '18px', background: '#EFF6FF', border: '1px solid #93C5FD', borderRadius: '7px', padding: '14px 16px', fontSize: '13px', color: '#1e3a5f' }}>
              <strong>Interpreting this comparison</strong><br />
              Differences in cost across strategies reflect the data source and calculation method.
              {' '}Price List costs reflect contracted pricing for the site country.
              {' '}BOM Rollup reflects built-up component costs from approved BOMs.
              {' '}Last Purchase reflects the most recent ERP transaction.
              {' '}Average Purchase smooths out volatility over the selected lookback window.
              <br /><br />
              Use this comparison to understand which strategy best reflects your true cost and to identify data gaps.
              To use a strategy for reporting, create a Cost Build with that strategy.{' '}
              <a href="/cost-builds" style={{ color: D.blue, fontWeight: 700 }}>Create Cost Build →</a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback } from 'react'
import { GuidancePanel } from '../components/GuidancePanel'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', error: '#dc2626', warning: '#d97706',
  blue: '#1565c0', blueLight: '#EFF6FF',
}

type PriceListVersion = {
  id: string; version_number: number; effective_date: string
  currency: string; status: string; item_count: number; imported_at: string
}
type PriceList = {
  id: string; country_code: string; name: string; description: string | null
  is_active: boolean; created_at: string; price_list_versions: PriceListVersion[]
}
type PriceItem = {
  id: string; part_number: string; unit_price: number; currency: string; notes: string | null
  skus: { part_number: string; name: string } | null
}

const STATUS_COLOR: Record<string, string> = {
  active: D.success, superseded: D.secondary, draft: D.warning, archived: D.secondary,
}

const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', GB: 'United Kingdom',
  NL: 'Netherlands', AT: 'Austria', CH: 'Switzerland', PL: 'Poland', SE: 'Sweden',
  NO: 'Norway', DK: 'Denmark', IL: 'Israel', US: 'United States', PT: 'Portugal',
  BE: 'Belgium', CZ: 'Czech Republic', HU: 'Hungary', RO: 'Romania', SK: 'Slovakia',
}

function ItemsPanel({ versionId, currency }: { versionId: string; currency: string }) {
  const [items, setItems]           = useState<PriceItem[]>([])
  const [total, setTotal]           = useState(0)
  const [nullSkuCount, setNullSku]  = useState(0)
  const [search, setSearch]         = useState('')
  const [offset, setOffset]         = useState(0)
  const [loading, setLoading]       = useState(true)
  const PAGE = 100

  const load = useCallback(async (q: string, off: number) => {
    setLoading(true)
    const url = `/api/price-lists/${versionId}/items?limit=${PAGE}&offset=${off}${q ? `&q=${encodeURIComponent(q)}` : ''}`
    const res  = await fetch(url)
    const json = await res.json()
    setLoading(false)
    setItems(json.data ?? [])
    setTotal(json.total ?? 0)
    setNullSku(json.nullSkuCount ?? 0)
  }, [versionId])

  useEffect(() => { load('', 0) }, [load])

  function doSearch(q: string) {
    setSearch(q); setOffset(0); load(q, 0)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'center' }}>
        <input
          style={{ padding: '7px 10px', border: `1px solid ${D.border}`, borderRadius: '6px', fontSize: '13px', width: '260px' }}
          placeholder="Filter by part number…" value={search}
          onChange={e => doSearch(e.target.value)}
        />
        <span style={{ fontSize: '12px', color: D.secondary }}>{total.toLocaleString()} items{nullSkuCount > 0 ? ` · ` : ''}</span>
        {nullSkuCount > 0 && (
          <span style={{ fontSize: '12px', color: D.error, background: '#FEF2F2', border: '1px solid #FECACA', padding: '2px 8px', borderRadius: '10px' }}>
            {nullSkuCount} unmatched SKUs
          </span>
        )}
        {total > PAGE && (
          <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
            <button onClick={() => { const o = Math.max(0, offset - PAGE); setOffset(o); load(search, o) }}
              disabled={offset === 0} style={{ padding: '4px 10px', fontSize: '12px', border: `1px solid ${D.border}`, borderRadius: '5px', background: D.bg, cursor: 'pointer' }}>← Prev</button>
            <span style={{ fontSize: '12px', color: D.secondary, lineHeight: '24px' }}>{offset + 1}–{Math.min(offset + PAGE, total)}</span>
            <button onClick={() => { const o = offset + PAGE; setOffset(o); load(search, o) }}
              disabled={offset + PAGE >= total} style={{ padding: '4px 10px', fontSize: '12px', border: `1px solid ${D.border}`, borderRadius: '5px', background: D.bg, cursor: 'pointer' }}>Next →</button>
          </div>
        )}
      </div>
      {loading ? <p style={{ color: D.secondary, fontSize: '13px' }}>Loading…</p> : (
        <div style={{ border: `1px solid ${D.border}`, borderRadius: '6px', overflow: 'auto', maxHeight: '400px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: D.bg, position: 'sticky', top: 0 }}>
                {['Part Number', 'Description', 'Unit Price', 'Currency'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: D.secondary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderTop: `1px solid ${D.border}` }}>
                  <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 600, color: D.dark }}>{item.part_number}</td>
                  <td style={{ padding: '7px 12px', color: D.secondary }}>{item.skus?.name ?? '—'}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', color: D.dark }}>{item.unit_price.toFixed(4)}</td>
                  <td style={{ padding: '7px 12px', color: D.secondary }}>{item.currency}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: D.secondary, fontSize: '13px' }}>No items match your filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PriceListCard({ pl }: { pl: PriceList }) {
  const [open, setOpen]         = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null)

  const activeVersion    = pl.price_list_versions.find(v => v.status === 'active')
  const supersededCount  = pl.price_list_versions.filter(v => v.status === 'superseded').length
  const displayVersion   = pl.price_list_versions.find(v => v.id === selectedVersion) ?? activeVersion ?? pl.price_list_versions[0]

  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', marginBottom: '16px' }}>
      <div
        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setOpen(!open)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '36px', height: '36px', background: `${D.blue}15`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px', color: D.blue }}>
            {pl.country_code}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: D.dark }}>{pl.name}</div>
            <div style={{ fontSize: '12px', color: D.secondary, marginTop: '2px' }}>
              {COUNTRY_NAMES[pl.country_code] ?? pl.country_code} ·{' '}
              {pl.price_list_versions.length} version{pl.price_list_versions.length !== 1 ? 's' : ''}
              {supersededCount > 0 && ` (${supersededCount} historical)`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activeVersion && (
            <div style={{ fontSize: '12px', color: D.secondary }}>
              <span style={{ fontWeight: 600, color: D.dark }}>v{activeVersion.version_number}</span> · {activeVersion.effective_date} · {activeVersion.item_count.toLocaleString()} items · {activeVersion.currency}
            </div>
          )}
          <span style={{ fontSize: '18px', color: D.secondary }}>{open ? '▾' : '▸'}</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${D.border}`, padding: '20px' }}>
          {/* Version selector */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: D.secondary, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Price List Versions</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {pl.price_list_versions.map(v => (
                <button key={v.id}
                  onClick={() => setSelectedVersion(v.id === selectedVersion ? null : v.id)}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                    background: selectedVersion === v.id || (!selectedVersion && v.status === 'active') ? D.blue : D.bg,
                    color:      selectedVersion === v.id || (!selectedVersion && v.status === 'active') ? '#fff' : D.dark,
                    border: `1px solid ${selectedVersion === v.id || (!selectedVersion && v.status === 'active') ? D.blue : D.border}`,
                  }}
                >
                  v{v.version_number}
                  <span style={{ marginLeft: '6px', fontSize: '10px', opacity: 0.8 }}>{v.status}</span>
                </button>
              ))}
            </div>
          </div>

          {displayVersion && (
            <div>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '12px' }}>
                {[
                  ['Effective Date', displayVersion.effective_date],
                  ['Currency', displayVersion.currency],
                  ['Item Count', displayVersion.item_count.toLocaleString()],
                  ['Status', displayVersion.status],
                  ['Imported', new Date(displayVersion.imported_at).toLocaleDateString()],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: D.bg, padding: '8px 12px', borderRadius: '6px', minWidth: '100px' }}>
                    <div style={{ fontSize: '10px', color: D.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>{l}</div>
                    <div style={{ color: D.dark, fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
                <div style={{ marginLeft: 'auto' }}>
                  <a href={`/api/price-lists/${displayVersion.id}/items?limit=10000`} download={`price-list-${pl.country_code}-v${displayVersion.version_number}.csv`}
                    style={{ display: 'inline-block', background: D.bg, border: `1px solid ${D.border}`, borderRadius: '6px', padding: '7px 14px', fontSize: '12px', color: D.dark, textDecoration: 'none' }}>
                    Export CSV
                  </a>
                </div>
              </div>

              <ItemsPanel versionId={displayVersion.id} currency={displayVersion.currency} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PriceListsPage() {
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/price-lists')
    const json = await res.json()
    setLoading(false)
    setPriceLists(json.data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = search
    ? priceLists.filter(pl => pl.name.toLowerCase().includes(search.toLowerCase()) || pl.country_code.toLowerCase().includes(search.toLowerCase()) || (COUNTRY_NAMES[pl.country_code] ?? '').toLowerCase().includes(search.toLowerCase()))
    : priceLists

  return (
    <div style={{ maxWidth: '1100px' }}>
      <GuidancePanel moduleKey="price-lists" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>Price List Center</h1>
          <p style={{ fontSize: '13px', color: D.secondary, margin: '4px 0 0' }}>Country price lists imported via Import Center · All versions are read-only and versioned</p>
        </div>
        <a href="/imports" style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: '7px', padding: '9px 18px', fontSize: '13px', fontWeight: 500, color: D.dark, textDecoration: 'none' }}>
          + Import New Version →
        </a>
      </div>

      <div style={{ background: D.blueLight, border: `1px solid #BFDBFE`, borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#1e40af' }}>
        <strong>Business rule:</strong> All sites within the same country share one price list. Price lists are country-specific, cost builds are site-specific.
        To update prices, import a new version via Import Center → the active version is automatically superseded.
      </div>

      <input
        style={{ padding: '8px 12px', border: `1px solid ${D.border}`, borderRadius: '7px', fontSize: '13px', width: '280px', marginBottom: '20px' }}
        placeholder="Search by country or name…"
        value={search} onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <p style={{ color: D.secondary, fontSize: '14px' }}>Loading price lists…</p>
      ) : filtered.length === 0 ? (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '48px', textAlign: 'center', color: D.secondary }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: D.dark, marginBottom: '8px' }}>No price lists imported yet</div>
          <div style={{ fontSize: '13px', marginBottom: '20px' }}>Import a price list via the Import Center to get started.</div>
          <a href="/imports" style={{ background: D.blue, color: '#fff', border: 'none', borderRadius: '7px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
            Go to Import Center →
          </a>
        </div>
      ) : (
        filtered.map(pl => <PriceListCard key={pl.id} pl={pl} />)
      )}
    </div>
  )
}

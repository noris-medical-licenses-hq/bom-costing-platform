'use client'
import { useState, useEffect, useCallback } from 'react'

const D = {
  dark: '#222222', secondary: '#666666', bg: '#F8F9FA', card: '#FFFFFF',
  border: '#E5E7EB', success: '#16a34a', warning: '#d97706', error: '#dc2626',
  blue: '#1565c0', info: '#0369a1', teal: '#0d9488',
  critBg: '#FEF2F2', warnBg: '#FFFBEB', infoBg: '#EFF6FF', okBg: '#F0FDF4',
}

type SeverityLevel = 'CRITICAL' | 'WARNING' | 'INFO' | 'OK'

// ─── API response shape ───────────────────────────────────────────────────────

type DQSection<T extends Record<string, { count: number; sample: unknown[] }>> = T

type CostingData = DQSection<{
  skus_without_cost_type:   { count: number; sample: any[] }
  skus_zero_cost_in_builds: { count: number; sample: any[] }
}>

type BomData = DQSection<{
  manufactured_skus_without_bom: { count: number; sample: any[] }
  bom_versions_in_draft:         { count: number; sample: any[] }
}>

type MfgData = DQSection<{
  inactive_structures:              { count: number; sample: any[] }
  active_structures_without_elements: { count: number; sample: any[] }
}>

type PriceListData = DQSection<{
  items_with_zero_price:     { count: number; sample: any[] }
  items_with_negative_price: { count: number; sample: any[] }
  stale_active_versions:     { count: number; sample: any[] }
}>

type InventoryData = DQSection<{
  snapshots_in_draft:           { count: number; sample: any[] }
  approved_snapshots_no_report: { count: number; sample: any[] }
  inventory_lines_without_cost: { count: number; sample: any[] }
}>

type DQResponse = {
  generated_at: string
  costing:    CostingData
  bom:        BomData
  mfg:        MfgData
  price_list: PriceListData
  inventory:  InventoryData
}

// ─── Component helpers ────────────────────────────────────────────────────────

function sev(count: number, critical: boolean): SeverityLevel {
  if (count === 0) return 'OK'
  return critical ? 'CRITICAL' : 'WARNING'
}

function SEV_COLOR(s: SeverityLevel) {
  if (s === 'CRITICAL') return { bg: D.critBg, text: D.error, badge: '#dc2626' }
  if (s === 'WARNING')  return { bg: D.warnBg, text: D.warning, badge: '#d97706' }
  if (s === 'INFO')     return { bg: D.infoBg, text: D.info, badge: '#0369a1' }
  return { bg: D.okBg, text: D.success, badge: '#16a34a' }
}

function Badge({ level }: { level: SeverityLevel }) {
  const c = SEV_COLOR(level)
  return (
    <span style={{ background: c.badge, color: '#fff', fontSize: '10px', fontWeight: 700,
      padding: '2px 7px', borderRadius: '10px', letterSpacing: '0.5px' }}>
      {level}
    </span>
  )
}

function KpiCard({
  title, count, level, onDetails, exportHref,
}: {
  title: string; count: number; level: SeverityLevel
  onDetails?: () => void; exportHref?: string
}) {
  const c = SEV_COLOR(level)
  return (
    <div style={{ background: c.bg, border: `1px solid ${level === 'OK' ? '#86efac' : level === 'INFO' ? '#bfdbfe' : level === 'WARNING' ? '#fde68a' : '#fca5a5'}`,
      borderRadius: '8px', padding: '16px', minWidth: '200px', flex: '1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: c.text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {title}
        </span>
        <Badge level={level} />
      </div>
      <div style={{ fontSize: '32px', fontWeight: 700, color: c.text, lineHeight: 1 }}>{count.toLocaleString()}</div>
      <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {onDetails && count > 0 && (
          <button onClick={onDetails} style={{ fontSize: '11px', padding: '4px 10px', border: `1px solid ${c.badge}`, borderRadius: '4px',
            background: 'transparent', color: c.text, cursor: 'pointer', fontWeight: 500 }}>
            View Details
          </button>
        )}
        {exportHref && count > 0 && (
          <a href={exportHref} download style={{ fontSize: '11px', padding: '4px 10px', border: `1px solid ${c.badge}`,
            borderRadius: '4px', background: 'transparent', color: c.text, textDecoration: 'none', fontWeight: 500 }}>
            Export Excel
          </a>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '12px', marginTop: '28px' }}>
      <h2 style={{ fontSize: '15px', fontWeight: 700, color: D.dark, margin: 0 }}>{title}</h2>
      {children}
    </div>
  )
}

function DetailTable({ rows, columns }: { rows: any[]; columns: { key: string; label: string; mono?: boolean }[] }) {
  if (rows.length === 0) return <p style={{ color: D.secondary, fontSize: '13px' }}>No issues found.</p>
  return (
    <div style={{ overflowX: 'auto', background: D.card, border: `1px solid ${D.border}`, borderRadius: '6px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#f8f8f8', borderBottom: `1px solid ${D.border}` }}>
            {columns.map(c => (
              <th key={c.key} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#444', whiteSpace: 'nowrap' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid #f0f0f0` }}>
              {columns.map(c => (
                <td key={c.key} style={{ padding: '7px 12px', color: D.dark, fontFamily: c.mono ? 'monospace' : undefined }}>
                  {getNestedValue(row, c.key) ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function getNestedValue(obj: any, path: string): string | null {
  const parts = path.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur == null) return null
    cur = cur[p]
  }
  if (cur == null) return null
  if (Array.isArray(cur)) return cur.join(', ')
  return String(cur)
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ActiveDetail =
  | 'costing_no_type' | 'costing_zero'
  | 'bom_no_bom' | 'bom_draft'
  | 'mfg_inactive' | 'mfg_no_elements'
  | 'pl_zero' | 'pl_negative' | 'pl_stale'
  | 'inv_draft' | 'inv_no_report' | 'inv_no_cost'

export default function DataQualityPage() {
  const [data,        setData]        = useState<DQResponse | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<ActiveDetail | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res  = await fetch('/api/data-quality')
    const json = await res.json()
    setLoading(false)
    if (res.ok) setData(json.data)
    else setError(json.error ?? 'Failed to load data quality metrics')
  }, [])

  useEffect(() => { load() }, [load])

  function togglePanel(panel: ActiveDetail) {
    setActivePanel(p => p === panel ? null : panel)
  }

  if (loading) return <div style={{ padding: '40px', color: D.secondary, fontSize: '14px' }}>Loading data quality metrics…</div>
  if (error)   return <div style={{ padding: '40px', color: D.error, fontSize: '14px' }}>Error: {error}</div>
  if (!data)   return null

  const C  = data.costing
  const B  = data.bom
  const M  = data.mfg
  const PL = data.price_list
  const I  = data.inventory

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>Data Quality Dashboard</h1>
          <p style={{ color: D.secondary, fontSize: '14px', margin: '4px 0 0' }}>
            Detect problems before Cost Builds and Inventory Valuations fail.
            Last checked: {new Date(data.generated_at).toLocaleString()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={load} style={{ padding: '8px 16px', border: `1px solid ${D.border}`, borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: D.card }}>
            Refresh
          </button>
          <a href="/api/data-quality/export" download style={{ padding: '8px 16px', background: D.teal, color: '#fff', textDecoration: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600 }}>
            Export All Findings.xlsx
          </a>
        </div>
      </div>

      {/* ── 1. Costing Health ────────────────────────────────────────────────── */}
      <SectionHeader title="Costing Health">
        <a href="/api/data-quality/export" download style={{ fontSize: '12px', color: D.blue, textDecoration: 'none' }}>Export Excel</a>
      </SectionHeader>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <KpiCard
          title="SKUs Without Cost Type"
          count={C.skus_without_cost_type.count}
          level={sev(C.skus_without_cost_type.count, false)}
          onDetails={() => togglePanel('costing_no_type')}
          exportHref="/api/data-quality/export"
        />
        <KpiCard
          title="Zero Cost in Builds (90d)"
          count={C.skus_zero_cost_in_builds.count}
          level={sev(C.skus_zero_cost_in_builds.count, true)}
          onDetails={() => togglePanel('costing_zero')}
          exportHref="/api/data-quality/export"
        />
      </div>

      {activePanel === 'costing_no_type' && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: D.secondary, marginBottom: '8px' }}>
            Active SKUs with no costing strategy assigned. These cannot be costed in any Cost Build.
          </p>
          <DetailTable
            rows={C.skus_without_cost_type.sample}
            columns={[
              { key: 'part_number', label: 'Part Number', mono: true },
              { key: 'name', label: 'Name' },
              { key: 'item_type', label: 'Item Type' },
            ]}
          />
        </div>
      )}

      {activePanel === 'costing_zero' && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: D.secondary, marginBottom: '8px' }}>
            SKUs that resolved to zero cost in at least one build in the last 90 days.
            These produce silent valuation errors — inventory value = 0.
          </p>
          <DetailTable
            rows={C.skus_zero_cost_in_builds.sample}
            columns={[
              { key: 'part_number', label: 'Part Number', mono: true },
              { key: 'name', label: 'Name' },
              { key: 'family', label: 'Family' },
              { key: 'build_names', label: 'Builds Affected' },
              { key: 'site_names', label: 'Sites' },
            ]}
          />
          <div style={{ marginTop: '8px' }}>
            <a href="/cost-quality" style={{ fontSize: '12px', color: D.blue }}>View full Cost Quality dashboard →</a>
          </div>
        </div>
      )}

      {/* ── 2. BOM Health ───────────────────────────────────────────────────── */}
      <SectionHeader title="BOM Health">
        <a href="/api/data-quality/export" download style={{ fontSize: '12px', color: D.blue, textDecoration: 'none' }}>Export Excel</a>
      </SectionHeader>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <KpiCard
          title="Manufactured SKUs Without BOM"
          count={B.manufactured_skus_without_bom.count}
          level={sev(B.manufactured_skus_without_bom.count, true)}
          onDetails={() => togglePanel('bom_no_bom')}
          exportHref="/api/data-quality/export"
        />
        <KpiCard
          title="BOM Versions in Draft"
          count={B.bom_versions_in_draft.count}
          level={sev(B.bom_versions_in_draft.count, false)}
          onDetails={() => togglePanel('bom_draft')}
          exportHref="/api/data-quality/export"
        />
      </div>

      {activePanel === 'bom_no_bom' && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: D.secondary, marginBottom: '8px' }}>
            SKUs with make_buy=&quot;make&quot; but no BOM created. MFG_COST_ROLLUP strategy will fail for these.
          </p>
          <DetailTable
            rows={B.manufactured_skus_without_bom.sample}
            columns={[
              { key: 'part_number', label: 'Part Number', mono: true },
              { key: 'name', label: 'Name' },
              { key: 'item_type', label: 'Item Type' },
            ]}
          />
          <div style={{ marginTop: '8px' }}>
            <a href="/boms" style={{ fontSize: '12px', color: D.blue }}>Go to BOMs →</a>
          </div>
        </div>
      )}

      {activePanel === 'bom_draft' && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: D.secondary, marginBottom: '8px' }}>
            BOM versions that have not been approved. Cost builds use approved versions only.
          </p>
          <DetailTable
            rows={B.bom_versions_in_draft.sample}
            columns={[
              { key: 'boms.skus.part_number', label: 'SKU', mono: true },
              { key: 'version_number', label: 'Version' },
              { key: 'status', label: 'Status' },
              { key: 'created_at', label: 'Created' },
            ]}
          />
          <div style={{ marginTop: '8px' }}>
            <a href="/boms" style={{ fontSize: '12px', color: D.blue }}>Review BOMs →</a>
          </div>
        </div>
      )}

      {/* ── 3. Manufacturing Health ──────────────────────────────────────────── */}
      <SectionHeader title="Manufacturing Health">
        <a href="/api/data-quality/export" download style={{ fontSize: '12px', color: D.blue, textDecoration: 'none' }}>Export Excel</a>
      </SectionHeader>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <KpiCard
          title="Active Structures Without Elements"
          count={M.active_structures_without_elements.count}
          level={sev(M.active_structures_without_elements.count, true)}
          onDetails={() => togglePanel('mfg_no_elements')}
          exportHref="/api/data-quality/export"
        />
        <KpiCard
          title="Inactive Structures"
          count={M.inactive_structures.count}
          level={sev(M.inactive_structures.count, false)}
          onDetails={() => togglePanel('mfg_inactive')}
          exportHref="/api/data-quality/export"
        />
      </div>

      {activePanel === 'mfg_no_elements' && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: D.secondary, marginBottom: '8px' }}>
            Active manufacturing cost structures with zero cost elements. These will produce zero MFG costs.
          </p>
          <DetailTable
            rows={M.active_structures_without_elements.sample}
            columns={[
              { key: 'skus.part_number', label: 'SKU', mono: true },
              { key: 'name', label: 'Structure Name' },
            ]}
          />
          <div style={{ marginTop: '8px' }}>
            <a href="/mfg-structures" style={{ fontSize: '12px', color: D.blue }}>Go to Mfg Structures →</a>
          </div>
        </div>
      )}

      {activePanel === 'mfg_inactive' && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: D.secondary, marginBottom: '8px' }}>
            Manufacturing cost structures that exist but are not active. Only active structures are used in builds.
          </p>
          <DetailTable
            rows={M.inactive_structures.sample}
            columns={[
              { key: 'skus.part_number', label: 'SKU', mono: true },
              { key: 'name', label: 'Structure Name' },
            ]}
          />
        </div>
      )}

      {/* ── 4. Price List Health ─────────────────────────────────────────────── */}
      <SectionHeader title="Price List Health">
        <a href="/api/data-quality/export" download style={{ fontSize: '12px', color: D.blue, textDecoration: 'none' }}>Export Excel</a>
      </SectionHeader>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <KpiCard
          title="Items With Zero Price"
          count={PL.items_with_zero_price.count}
          level={sev(PL.items_with_zero_price.count, false)}
          onDetails={() => togglePanel('pl_zero')}
          exportHref="/api/data-quality/export"
        />
        <KpiCard
          title="Items With Negative Price"
          count={PL.items_with_negative_price.count}
          level={sev(PL.items_with_negative_price.count, true)}
          onDetails={() => togglePanel('pl_negative')}
          exportHref="/api/data-quality/export"
        />
        <KpiCard
          title="Stale Active Versions (>1yr)"
          count={PL.stale_active_versions.count}
          level={sev(PL.stale_active_versions.count, false)}
          onDetails={() => togglePanel('pl_stale')}
          exportHref="/api/data-quality/export"
        />
      </div>

      {activePanel === 'pl_zero' && (
        <div style={{ marginTop: '12px' }}>
          <DetailTable
            rows={PL.items_with_zero_price.sample}
            columns={[
              { key: 'part_number', label: 'Part Number', mono: true },
              { key: 'unit_price', label: 'Price' },
              { key: 'price_list_versions.country_price_lists.name', label: 'Price List' },
              { key: 'price_list_versions.country_price_lists.country_code', label: 'Country' },
            ]}
          />
        </div>
      )}

      {activePanel === 'pl_negative' && (
        <div style={{ marginTop: '12px' }}>
          <DetailTable
            rows={PL.items_with_negative_price.sample}
            columns={[
              { key: 'part_number', label: 'Part Number', mono: true },
              { key: 'unit_price', label: 'Price' },
              { key: 'price_list_versions.country_price_lists.name', label: 'Price List' },
              { key: 'price_list_versions.country_price_lists.country_code', label: 'Country' },
            ]}
          />
        </div>
      )}

      {activePanel === 'pl_stale' && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: D.secondary, marginBottom: '8px' }}>
            Active price list versions where the effective date is more than 1 year ago.
          </p>
          <DetailTable
            rows={PL.stale_active_versions.sample}
            columns={[
              { key: 'country_price_lists.name', label: 'Price List' },
              { key: 'country_price_lists.country_code', label: 'Country' },
              { key: 'version_number', label: 'Version' },
              { key: 'effective_date', label: 'Effective Date' },
            ]}
          />
          <div style={{ marginTop: '8px' }}>
            <a href="/price-lists" style={{ fontSize: '12px', color: D.blue }}>Go to Price Lists →</a>
          </div>
        </div>
      )}

      {/* ── 5. Inventory Health ──────────────────────────────────────────────── */}
      <SectionHeader title="Inventory Health">
        <a href="/api/data-quality/export" download style={{ fontSize: '12px', color: D.blue, textDecoration: 'none' }}>Export Excel</a>
      </SectionHeader>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <KpiCard
          title="Snapshots in Draft"
          count={I.snapshots_in_draft.count}
          level={sev(I.snapshots_in_draft.count, false)}
          onDetails={() => togglePanel('inv_draft')}
          exportHref="/api/data-quality/export"
        />
        <KpiCard
          title="Approved Snapshots Without Valuation"
          count={I.approved_snapshots_no_report.count}
          level={sev(I.approved_snapshots_no_report.count, true)}
          onDetails={() => togglePanel('inv_no_report')}
          exportHref="/api/data-quality/export"
        />
        <KpiCard
          title="Inventory Lines Without Cost"
          count={I.inventory_lines_without_cost.count}
          level={sev(I.inventory_lines_without_cost.count, false)}
          onDetails={() => togglePanel('inv_no_cost')}
          exportHref="/api/data-quality/export"
        />
      </div>

      {activePanel === 'inv_draft' && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: D.secondary, marginBottom: '8px' }}>
            Inventory snapshots that have not been valued. Run Inventory Valuation to process them.
          </p>
          <DetailTable
            rows={I.snapshots_in_draft.sample}
            columns={[
              { key: 'snapshot_name', label: 'Name' },
              { key: 'snapshot_date', label: 'Date' },
              { key: 'status', label: 'Status' },
            ]}
          />
          <div style={{ marginTop: '8px' }}>
            <a href="/inventory" style={{ fontSize: '12px', color: D.blue }}>Go to Inventory →</a>
          </div>
        </div>
      )}

      {activePanel === 'inv_no_report' && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: D.secondary, marginBottom: '8px' }}>
            Approved snapshots that have no valuation report generated.
          </p>
          <DetailTable
            rows={I.approved_snapshots_no_report.sample}
            columns={[
              { key: 'snapshot_name', label: 'Name' },
              { key: 'snapshot_date', label: 'Date' },
            ]}
          />
        </div>
      )}

      {activePanel === 'inv_no_cost' && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: D.secondary, marginBottom: '8px' }}>
            Inventory lines with no unit cost assigned.
            These were skipped during valuation.
          </p>
          <DetailTable
            rows={I.inventory_lines_without_cost.sample}
            columns={[
              { key: 'skus.part_number', label: 'SKU', mono: true },
              { key: 'skus.name', label: 'Name' },
            ]}
          />
        </div>
      )}

      {/* Footer spacer */}
      <div style={{ height: '40px' }} />
    </div>
  )
}

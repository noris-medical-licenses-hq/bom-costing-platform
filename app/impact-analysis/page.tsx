'use client'
/**
 * BG-019: Cost Change Impact Analysis
 * /impact-analysis
 *
 * 1. Executive Summary cards
 * 2. Cost Changes table (filterable, sortable)
 * 3. BOM Impact (expandable)
 * 4. Inventory Impact (expandable)
 * 5. Manufacturing Impact (expandable)
 *
 * Export: every section links to /api/impact-analysis/export (BG-020 framework)
 */
import { useState, useCallback } from 'react'
import type { ImpactResult, CostChange, BomImpactRow, InventoryImpactRow, MfgImpactRow, ImpactSeverity } from '@/backend/lib/impactAnalysis'

// ─── Design tokens ────────────────────────────────────────────────────────────
const D = {
  critical:  '#C62839',
  warning:   '#D97706',
  info:      '#2563EB',
  success:   '#16A34A',
  bg:        '#F8F9FA',
  card:      '#FFFFFF',
  border:    '#E5E7EB',
  text:      '#111827',
  secondary: '#6B7280',
}

const SEVERITY_COLOR: Record<ImpactSeverity, string> = {
  CRITICAL: D.critical,
  WARNING:  D.warning,
  INFO:     D.info,
}

// ─── Severity badge ───────────────────────────────────────────────────────────
function SeverityBadge({ s }: { s: ImpactSeverity }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
      fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px',
      background: SEVERITY_COLOR[s] + '18', color: SEVERITY_COLOR[s],
    }}>
      {s}
    </span>
  )
}

// ─── Section toggle ───────────────────────────────────────────────────────────
function SectionHeader({
  title, count, open, onToggle, exportHref,
}: {
  title: string; count: number; open: boolean;
  onToggle: () => void; exportHref?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: open ? '16px' : 0 }}>
      <button onClick={onToggle} style={{
        flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '10px', padding: 0,
      }}>
        <span style={{ fontSize: '18px', color: D.secondary }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: '16px', fontWeight: 700, color: D.text }}>{title}</span>
        <span style={{
          fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px',
          background: '#E5E7EB', color: D.secondary,
        }}>{count}</span>
      </button>
      {exportHref && count > 0 && (
        <a href={exportHref} download style={{
          fontSize: '12px', color: D.info, textDecoration: 'none', fontWeight: 500,
          padding: '4px 10px', border: `1px solid ${D.info}`, borderRadius: '6px',
        }}>
          Export .xlsx
        </a>
      )}
    </div>
  )
}

// ─── Comparison selector ──────────────────────────────────────────────────────
type CompareType = 'price_list' | 'cost_build'

interface PriceListVersionOption { id: string; label: string }
interface CostBuildOption        { id: string; label: string }

function ComparisonPanel({
  onRun, loading,
}: {
  onRun: (type: CompareType, fromId: string, toId: string) => void;
  loading: boolean;
}) {
  const [type,   setType]   = useState<CompareType>('price_list')
  const [fromId, setFromId] = useState('')
  const [toId,   setToId]   = useState('')
  const [opts,   setOpts]   = useState<PriceListVersionOption[] | CostBuildOption[]>([])
  const [loaded, setLoaded] = useState(false)

  const loadOptions = useCallback(async (t: CompareType) => {
    setOpts([])
    setLoaded(false)
    if (t === 'price_list') {
      const res  = await fetch('/api/price-list-versions')
      const body = await res.json()
      setOpts((body.data ?? []).map((v: any) => ({
        id:    v.id,
        label: `${v.price_list_name} (${v.country_code}) v${v.version_number} — ${v.effective_date}`,
      })))
    } else {
      const res  = await fetch('/api/cost-builds')
      const body = await res.json()
      setOpts((body.data ?? []).filter((b: any) =>
        ['complete', 'complete_with_warnings', 'approved', 'locked'].includes(b.status)
      ).map((b: any) => ({
        id:    b.id,
        label: `${b.name} (${b.sites?.name ?? b.sites?.code ?? ''}) — ${b.status}`,
      })))
    }
    setLoaded(true)
  }, [])

  return (
    <div style={{
      background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px',
      padding: '20px', marginBottom: '24px',
    }}>
      <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px', color: D.text }}>
        Configure Comparison
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Comparison type */}
        <div>
          <label style={{ fontSize: '12px', color: D.secondary, display: 'block', marginBottom: '4px' }}>
            Compare By
          </label>
          <select
            value={type}
            onChange={e => { setType(e.target.value as CompareType); setFromId(''); setToId(''); loadOptions(e.target.value as CompareType) }}
            style={{ padding: '7px 10px', borderRadius: '6px', border: `1px solid ${D.border}`, fontSize: '13px' }}
          >
            <option value="price_list">Price List Version</option>
            <option value="cost_build">Cost Build</option>
          </select>
        </div>

        {/* From */}
        <div>
          <label style={{ fontSize: '12px', color: D.secondary, display: 'block', marginBottom: '4px' }}>
            From (Baseline)
          </label>
          <select
            value={fromId}
            onChange={e => setFromId(e.target.value)}
            onClick={() => !loaded && loadOptions(type)}
            style={{ padding: '7px 10px', borderRadius: '6px', border: `1px solid ${D.border}`, fontSize: '13px', minWidth: '280px' }}
          >
            <option value="">— select —</option>
            {(opts as any[]).map((o: any) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* To */}
        <div>
          <label style={{ fontSize: '12px', color: D.secondary, display: 'block', marginBottom: '4px' }}>
            To (New Version)
          </label>
          <select
            value={toId}
            onChange={e => setToId(e.target.value)}
            onClick={() => !loaded && loadOptions(type)}
            style={{ padding: '7px 10px', borderRadius: '6px', border: `1px solid ${D.border}`, fontSize: '13px', minWidth: '280px' }}
          >
            <option value="">— select —</option>
            {(opts as any[]).map((o: any) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>

        <button
          disabled={!fromId || !toId || fromId === toId || loading}
          onClick={() => onRun(type, fromId, toId)}
          style={{
            padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: (!fromId || !toId || fromId === toId || loading) ? '#9CA3AF' : '#2563EB',
            color: '#fff', fontWeight: 600, fontSize: '13px',
          }}
        >
          {loading ? 'Analysing…' : 'Run Analysis'}
        </button>
      </div>
    </div>
  )
}

// ─── Summary cards ────────────────────────────────────────────────────────────
function SummaryCards({ result }: { result: ImpactResult }) {
  const s = result.summary
  const cards = [
    { label: 'Changed SKUs',          value: s.changed_skus,               color: D.text },
    { label: 'Critical Changes',       value: s.critical_changes,           color: D.critical },
    { label: 'Warning Changes',        value: s.warning_changes,            color: D.warning },
    { label: 'Affected BOMs',          value: s.affected_bom_count,         color: D.text },
    { label: 'Affected Finished Goods',value: s.affected_fg_count,          color: D.text },
    { label: 'Inventory Value Delta',  value: formatDelta(s.inventory_value_delta, result.meta.currency), color: s.inventory_value_delta < 0 ? D.critical : D.success },
    { label: 'Mfg Structures',         value: s.affected_mfg_structures,    color: D.text },
  ]

  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px',
          padding: '16px 20px', minWidth: '130px', flex: '1',
        }}>
          <div style={{ fontSize: '22px', fontWeight: 800, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: '12px', color: D.secondary, marginTop: '4px' }}>{c.label}</div>
        </div>
      ))}
    </div>
  )
}

function formatDelta(v: number, currency: string) {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${currency} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Cost Changes table ───────────────────────────────────────────────────────
type SortKey = 'pct_change' | 'abs_change' | 'part_number' | 'severity'
type SortDir  = 'asc' | 'desc'

function CostChangesTable({ changes, currency, exportHref }: {
  changes:   CostChange[];
  currency:  string;
  exportHref: string;
}) {
  const [filter,   setFilter]  = useState('')
  const [severity, setSeverity] = useState<ImpactSeverity | ''>('')
  const [sortKey,  setSortKey]  = useState<SortKey>('pct_change')
  const [sortDir,  setSortDir]  = useState<SortDir>('desc')
  const [open,     setOpen]    = useState(true)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const visible = changes
    .filter(c =>
      (!filter || c.part_number.toLowerCase().includes(filter.toLowerCase()) || c.name.toLowerCase().includes(filter.toLowerCase())) &&
      (!severity || c.severity === severity)
    )
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'pct_change')  return mul * (Math.abs(a.pct_change) - Math.abs(b.pct_change))
      if (sortKey === 'abs_change')  return mul * (Math.abs(a.abs_change) - Math.abs(b.abs_change))
      if (sortKey === 'part_number') return mul * a.part_number.localeCompare(b.part_number)
      const sev = { CRITICAL: 3, WARNING: 2, INFO: 1 }
      return mul * (sev[a.severity] - sev[b.severity])
    })

  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
      <SectionHeader
        title="Cost Changes"
        count={changes.length}
        open={open}
        onToggle={() => setOpen(o => !o)}
        exportHref={exportHref}
      />
      {open && (
        <>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <input
              placeholder="Filter by SKU or name…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${D.border}`, fontSize: '13px', minWidth: '200px' }}
            />
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value as ImpactSeverity | '')}
              style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${D.border}`, fontSize: '13px' }}
            >
              <option value="">All severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="WARNING">WARNING</option>
              <option value="INFO">INFO</option>
            </select>
            <span style={{ fontSize: '12px', color: D.secondary, alignSelf: 'center' }}>
              {visible.length} of {changes.length} rows
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F3F4F6' }}>
                  {([
                    ['part_number', 'SKU'],
                    ['', 'Name'],
                    ['', `Old Cost (${currency})`],
                    ['', `New Cost (${currency})`],
                    ['abs_change', 'Δ Abs'],
                    ['pct_change', 'Δ %'],
                    ['severity', 'Severity'],
                    ['', 'Trace'],
                  ] as [SortKey | '', string][]).map(([key, label]) => (
                    <th
                      key={label}
                      onClick={() => key && handleSort(key)}
                      style={{
                        padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                        color: D.secondary, fontSize: '11px', textTransform: 'uppercase',
                        cursor: key ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                    >
                      {label} {key && sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 200).map(c => (
                  <tr key={c.sku_id} style={{ borderTop: `1px solid ${D.border}` }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{c.part_number}</td>
                    <td style={{ padding: '8px 12px', color: D.secondary }}>{c.name}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{c.old_cost.toFixed(4)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{c.new_cost.toFixed(4)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: c.abs_change >= 0 ? D.critical : D.success }}>
                      {c.abs_change >= 0 ? '+' : ''}{c.abs_change.toFixed(4)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: SEVERITY_COLOR[c.severity] }}>
                      {c.pct_change >= 0 ? '+' : ''}{c.pct_change.toFixed(2)}%
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <SeverityBadge s={c.severity} />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {c.import_job_row_id ? (
                        <a href={`/api/import-trace/${c.import_job_row_id}`} target="_blank" rel="noreferrer"
                          style={{ fontSize: '11px', color: D.info }}>
                          View Source
                        </a>
                      ) : (
                        <span style={{ fontSize: '11px', color: D.secondary }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visible.length > 200 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '10px 12px', textAlign: 'center', color: D.secondary, fontSize: '12px' }}>
                      Showing 200 of {visible.length} rows — export to see all
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── BOM Impact ───────────────────────────────────────────────────────────────
function BomImpactSection({ rows, exportHref }: { rows: BomImpactRow[]; exportHref: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
      <SectionHeader title="BOM Impact" count={rows.length} open={open} onToggle={() => setOpen(o => !o)} exportHref={exportHref} />
      {open && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#F3F4F6' }}>
              {['Component SKU', 'Name', 'Affected BOMs', 'Affected FGs', 'Top Finished Goods'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: D.secondary, fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.component_sku_id} style={{ borderTop: `1px solid ${D.border}` }}>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{r.component_part_number}</td>
                <td style={{ padding: '8px 12px', color: D.secondary }}>{r.component_name}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: r.affected_bom_count > 10 ? D.critical : D.text }}>{r.affected_bom_count}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>{r.affected_fg_count}</td>
                <td style={{ padding: '8px 12px', fontSize: '12px', color: D.secondary }}>
                  {r.top_affected_fgs.map(fg => fg.part_number).join(', ')}
                  {r.affected_fg_count > r.top_affected_fgs.length ? ` +${r.affected_fg_count - r.top_affected_fgs.length} more` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Inventory Impact ─────────────────────────────────────────────────────────
function InventoryImpactSection({ rows, exportHref }: { rows: InventoryImpactRow[]; exportHref: string }) {
  const [open, setOpen] = useState(false)
  const totalDelta = rows.reduce((s, r) => s + r.value_delta, 0)
  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: open ? '16px' : 0 }}>
        <SectionHeader title="Inventory Impact" count={rows.length} open={open} onToggle={() => setOpen(o => !o)} exportHref={exportHref} />
        {rows.length > 0 && (
          <span style={{ fontSize: '13px', fontWeight: 700, color: totalDelta < 0 ? D.critical : D.success }}>
            Total: {totalDelta >= 0 ? '+' : ''}{totalDelta.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F3F4F6' }}>
                {['Site', 'Warehouse', 'SKU', 'Qty', 'Old Value', 'New Value', 'Delta'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: D.secondary, fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r, i) => (
                <tr key={`${r.sku_id}-${r.warehouse_name}-${i}`} style={{ borderTop: `1px solid ${D.border}` }}>
                  <td style={{ padding: '8px 12px' }}>{r.site_name}</td>
                  <td style={{ padding: '8px 12px', color: D.secondary }}>{r.warehouse_name}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{r.part_number}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{r.quantity.toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{r.old_value.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{r.new_value.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: r.value_delta < 0 ? D.critical : D.success }}>
                    {r.value_delta >= 0 ? '+' : ''}{r.value_delta.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 100 && (
            <p style={{ textAlign: 'center', fontSize: '12px', color: D.secondary, marginTop: '10px' }}>
              Showing 100 of {rows.length} rows — export to see all
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Manufacturing Impact ─────────────────────────────────────────────────────
function MfgImpactSection({ rows, exportHref }: { rows: MfgImpactRow[]; exportHref: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
      <SectionHeader title="Manufacturing Impact" count={rows.length} open={open} onToggle={() => setOpen(o => !o)} exportHref={exportHref} />
      {open && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#F3F4F6' }}>
              {['Structure', 'Finished Good', 'Mode', 'Affected Elements', 'Elements'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: D.secondary, fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.structure_id} style={{ borderTop: `1px solid ${D.border}` }}>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.structure_name}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{r.finished_good_part_number}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{ fontSize: '11px', background: '#E5E7EB', padding: '2px 6px', borderRadius: '4px' }}>{r.mode}</span>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: r.affected_element_count > 3 ? D.critical : D.warning }}>
                  {r.affected_element_count}
                </td>
                <td style={{ padding: '8px 12px', fontSize: '12px', color: D.secondary }}>
                  {r.affected_elements.map(e => e.part_number).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ImpactAnalysisPage() {
  const [result,  setResult]  = useState<ImpactResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [params,  setParams]  = useState<{ type: string; fromId: string; toId: string } | null>(null)

  const runAnalysis = useCallback(async (type: CompareType, fromId: string, toId: string) => {
    setLoading(true)
    setError(null)
    setResult(null)
    setParams({ type, fromId, toId })
    try {
      const res  = await fetch(`/api/impact-analysis?type=${type}&fromId=${fromId}&toId=${toId}`)
      const body = await res.json()
      if (!res.ok) { setError(body.error ?? 'Analysis failed'); return }
      setResult(body.data)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [])

  const exportHref = params
    ? `/api/impact-analysis/export?type=${params.type}&fromId=${params.fromId}&toId=${params.toId}`
    : '#'

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: D.text, margin: 0 }}>Cost Change Impact Analysis</h1>
          <p style={{ fontSize: '13px', color: D.secondary, margin: '4px 0 0' }}>
            Compare two cost snapshots to see what will change before you approve
          </p>
        </div>
        {result && (
          <a href={exportHref} download style={{
            padding: '8px 16px', borderRadius: '6px', background: '#16A34A', color: '#fff',
            textDecoration: 'none', fontWeight: 600, fontSize: '13px',
          }}>
            Export All Findings.xlsx
          </a>
        )}
      </div>

      {/* Comparison selector */}
      <ComparisonPanel onRun={runAnalysis} loading={loading} />

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px', color: D.secondary }}>
          Running impact analysis…
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#FEF2F2', border: `1px solid ${D.critical}`, borderRadius: '8px', padding: '16px', color: D.critical, marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Meta bar */}
          <div style={{ background: '#EFF6FF', border: `1px solid #BFDBFE`, borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px' }}>
            <strong>{result.meta.from_label}</strong>
            <span style={{ color: D.secondary }}> vs </span>
            <strong>{result.meta.to_label}</strong>
            <span style={{ color: D.secondary, marginLeft: '16px' }}>
              Generated {new Date(result.meta.generated_at).toLocaleString()}
            </span>
          </div>

          {/* 1. Summary */}
          <SummaryCards result={result} />

          {/* 2. Cost Changes */}
          <CostChangesTable
            changes={result.cost_changes}
            currency={result.meta.currency}
            exportHref={exportHref}
          />

          {/* 3. BOM Impact */}
          <BomImpactSection rows={result.bom_impact} exportHref={exportHref} />

          {/* 4. Inventory Impact */}
          <InventoryImpactSection rows={result.inventory_impact} exportHref={exportHref} />

          {/* 5. Manufacturing Impact */}
          <MfgImpactSection rows={result.mfg_impact} exportHref={exportHref} />

          {result.cost_changes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: D.secondary, background: D.card, borderRadius: '10px', border: `1px solid ${D.border}` }}>
              No cost changes detected between the two selected snapshots.
            </div>
          )}
        </>
      )}
    </div>
  )
}

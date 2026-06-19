'use client'
import { useState, useEffect, useCallback } from 'react'
import { GuidancePanel } from '../components/GuidancePanel'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', warning: '#d97706', error: '#dc2626',
  redLight: '#FEF2F2', blue: '#1565c0', teal: '#0d9488',
}

const MODES = [
  { value: 'BOM_PLUS_PROCESS', label: 'BOM + Process', desc: 'BOM material cost plus ordered process elements' },
  { value: 'PROCESS_ONLY',     label: 'Process Only',  desc: 'Sum of process elements only (no BOM rollup)' },
]

const ELEMENT_TYPES = [
  { value: 'SUBCONTRACT_PROCESS', label: 'Subcontract Process' },
  { value: 'MATERIAL',            label: 'Material' },
  { value: 'OVERHEAD',            label: 'Overhead' },
  { value: 'MANUAL',              label: 'Manual' },
]

const PROCESS_CATEGORIES = [
  { value: 'MACHINING',          label: 'Machining' },
  { value: 'SURFACE_TREATMENT',  label: 'Surface Treatment' },
  { value: 'STERILIZATION',      label: 'Sterilization' },
  { value: 'PACKAGING',          label: 'Packaging' },
  { value: 'INSPECTION',         label: 'Inspection' },
  { value: 'ASSEMBLY',           label: 'Assembly' },
  { value: 'OTHER',              label: 'Other' },
]

const COST_SOURCES = [
  { value: 'FIXED',            label: 'Fixed Cost',       desc: 'Manual cost entry' },
  { value: 'PRICE_LIST',       label: 'Price List',       desc: 'From active price list' },
  { value: 'LAST_PURCHASE',    label: 'Last Purchase',    desc: 'Most recent ERP purchase record' },
  { value: 'AVERAGE_PURCHASE', label: 'Average Purchase', desc: 'Weighted average purchase cost' },
]

interface MfgStructure {
  id: string; sku_id: string; version_number: number; effective_date: string
  name: string; mode: string; is_active: boolean; notes: string | null
  created_at: string; updated_at: string
  skus: { id: string; part_number: string; name: string; item_type: string; item_cost_type: string } | null
  mfg_cost_elements?: MfgElement[]
}

interface MfgElement {
  id: string; sequence: number; element_type: string; process_category: string
  name: string; supplier_id: string | null; reference_sku_id: string | null
  quantity: number; cost_source: string; fixed_cost: number | null; fixed_currency: string | null
  notes: string | null; created_at: string; updated_at: string
  suppliers: { id: string; name: string; code: string } | null
  skus: { id: string; part_number: string; name: string } | null
}

interface Sku { id: string; part_number: string; name: string; item_type: string; item_cost_type: string }

const cardStyle: React.CSSProperties = {
  background: D.card, borderRadius: '10px', border: `1px solid ${D.border}`, padding: '22px 24px', marginBottom: '20px',
}
const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 700, color: D.dark, marginBottom: '5px', display: 'block' }
const iStyle: React.CSSProperties = { width: '100%', fontSize: '13px', padding: '8px 10px', border: `1px solid ${D.border}`, borderRadius: '6px', background: '#fff', color: D.dark, boxSizing: 'border-box' }

const MODE_LABEL: Record<string, string> = { BOM_PLUS_PROCESS: 'BOM + Process', PROCESS_ONLY: 'Process Only' }
const SOURCE_LABEL: Record<string, string> = { FIXED: 'Fixed', PRICE_LIST: 'Price List', LAST_PURCHASE: 'Last Purchase', AVERAGE_PURCHASE: 'Avg Purchase' }

export default function MfgStructuresPage() {
  const [structures,    setStructures]    = useState<MfgStructure[]>([])
  const [activeOnly,    setActiveOnly]    = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [detail,        setDetail]        = useState<MfgStructure | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showCreate,    setShowCreate]    = useState(false)
  const [showAddEl,     setShowAddEl]     = useState(false)
  const [skuSearch,     setSkuSearch]     = useState('')
  const [skuResults,    setSkuResults]    = useState<Sku[]>([])
  const [createForm,    setCreateForm]    = useState({
    skuId: '', skuLabel: '', name: '', mode: 'BOM_PLUS_PROCESS', effectiveDate: new Date().toISOString().slice(0, 10), notes: '',
  })
  const [addElForm, setAddElForm] = useState({
    sequence: 10, elementType: 'SUBCONTRACT_PROCESS', processCategory: 'OTHER',
    name: '', supplierId: '', referenceSkuId: '', referenceSkuSearch: '', referenceSkuLabel: '',
    quantity: 1, costSource: 'LAST_PURCHASE', fixedCost: '', fixedCurrency: 'EUR', notes: '',
  })
  const [refSkuResults, setRefSkuResults] = useState<Sku[]>([])
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState<string | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/mfg-structures?activeOnly=${activeOnly}`)
    const j = await res.json()
    setStructures(j.data ?? [])
    setLoading(false)
  }, [activeOnly])

  useEffect(() => { loadList() }, [loadList])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    setDetailLoading(true)
    fetch(`/api/mfg-structures/${selectedId}`)
      .then(r => r.json())
      .then(j => { setDetail(j.data ?? null); setDetailLoading(false) })
  }, [selectedId])

  useEffect(() => {
    if (!skuSearch || skuSearch.length < 2) { setSkuResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/skus?q=${encodeURIComponent(skuSearch)}&status=active`)
        .then(r => r.json()).then(j => setSkuResults(j.data ?? []))
    }, 300)
    return () => clearTimeout(t)
  }, [skuSearch])

  useEffect(() => {
    if (!addElForm.referenceSkuSearch || addElForm.referenceSkuSearch.length < 2) { setRefSkuResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/skus?q=${encodeURIComponent(addElForm.referenceSkuSearch)}&status=active`)
        .then(r => r.json()).then(j => setRefSkuResults(j.data ?? []))
    }, 300)
    return () => clearTimeout(t)
  }, [addElForm.referenceSkuSearch])

  async function createStructure() {
    if (!createForm.skuId || !createForm.name || !createForm.effectiveDate) {
      setSaveError('SKU, name and effective date are required')
      return
    }
    setSaving(true); setSaveError(null)
    const res = await fetch('/api/mfg-structures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skuId: createForm.skuId, name: createForm.name, mode: createForm.mode,
        effectiveDate: createForm.effectiveDate, notes: createForm.notes || undefined,
      }),
    })
    const j = await res.json()
    setSaving(false)
    if (!res.ok) { setSaveError(j.error ?? 'Failed'); return }
    setShowCreate(false)
    setCreateForm({ skuId: '', skuLabel: '', name: '', mode: 'BOM_PLUS_PROCESS', effectiveDate: new Date().toISOString().slice(0, 10), notes: '' })
    await loadList()
    setSelectedId(j.data.id)
  }

  async function activate(id: string) {
    await fetch(`/api/mfg-structures/${id}/activate`, { method: 'POST' })
    await loadList()
    if (selectedId === id) {
      const res = await fetch(`/api/mfg-structures/${id}`)
      const j = await res.json()
      setDetail(j.data ?? null)
    }
  }

  async function addElement() {
    if (!detail) return
    if (!addElForm.name) { setSaveError('Element name required'); return }
    if (addElForm.costSource !== 'FIXED' && !addElForm.referenceSkuId) { setSaveError('Service SKU required for non-Fixed cost source'); return }
    if (addElForm.costSource === 'FIXED' && (!addElForm.fixedCost || !addElForm.fixedCurrency)) { setSaveError('Fixed cost and currency required'); return }

    setSaving(true); setSaveError(null)
    const body: Record<string, unknown> = {
      sequence:        addElForm.sequence,
      elementType:     addElForm.elementType,
      processCategory: addElForm.processCategory,
      name:            addElForm.name,
      supplierId:      addElForm.supplierId || null,
      referenceSkuId:  addElForm.referenceSkuId || null,
      quantity:        addElForm.quantity,
      costSource:      addElForm.costSource,
      notes:           addElForm.notes || null,
    }
    if (addElForm.costSource === 'FIXED') {
      body.fixedCost = Number(addElForm.fixedCost)
      body.fixedCurrency = addElForm.fixedCurrency.toUpperCase()
    }

    const res = await fetch(`/api/mfg-structures/${detail.id}/elements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await res.json()
    setSaving(false)
    if (!res.ok) { setSaveError(j.error ?? 'Failed'); return }

    // Determine next sequence for convenience
    const maxSeq = detail.mfg_cost_elements?.reduce((m, e) => Math.max(m, e.sequence), 0) ?? 0
    setAddElForm(f => ({ ...f, sequence: Math.max(maxSeq + 10, (j.data.sequence ?? maxSeq) + 10), name: '', referenceSkuId: '', referenceSkuSearch: '', referenceSkuLabel: '', notes: '', fixedCost: '' }))
    setShowAddEl(false)

    // Reload detail
    const dr = await fetch(`/api/mfg-structures/${detail.id}`)
    const dj = await dr.json()
    setDetail(dj.data ?? null)
  }

  async function deleteElement(eid: string) {
    if (!detail) return
    if (!confirm('Delete this element?')) return
    await fetch(`/api/mfg-structures/${detail.id}/elements/${eid}`, { method: 'DELETE' })
    const dr = await fetch(`/api/mfg-structures/${detail.id}`)
    const dj = await dr.json()
    setDetail(dj.data ?? null)
  }

  const sortedElements = (detail?.mfg_cost_elements ?? []).sort((a, b) => a.sequence - b.sequence)

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui,sans-serif', color: D.dark }}>
      <GuidancePanel moduleKey="mfg-structures" />
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Manufacturing</div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, marginBottom: '4px' }}>Cost Structures</h1>
          <p style={{ fontSize: '14px', color: D.secondary, margin: 0 }}>
            Define ordered process elements (Turning, Coating, etc.) for manufactured SKUs. Service SKUs must exist in the SKU master.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', color: D.secondary, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
            Active only
          </label>
          <a
            href="/api/mfg-structures/export-issues"
            download
            style={{ background: '#F8F9FA', color: D.secondary, border: `1px solid ${D.border}`, borderRadius: '7px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            Export Issues .xlsx
          </a>
          <button onClick={() => { setShowCreate(true); setSaveError(null) }} style={{ background: D.red, color: '#fff', border: 'none', borderRadius: '7px', padding: '9px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            + New Structure
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px' }}>
        {/* List panel */}
        <div>
          <div style={cardStyle}>
            {loading && <div style={{ fontSize: '13px', color: D.secondary }}>Loading…</div>}
            {!loading && structures.length === 0 && (
              <div style={{ fontSize: '13px', color: D.secondary }}>No structures found.</div>
            )}
            {structures.map(s => (
              <div
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                style={{
                  padding: '12px 14px', borderRadius: '7px', cursor: 'pointer', marginBottom: '6px',
                  background: selectedId === s.id ? '#EFF6FF' : '#F9FAFB',
                  border: `1px solid ${selectedId === s.id ? '#93C5FD' : D.border}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.skus?.part_number ?? '—'} — {s.skus?.name ?? '—'}
                    </div>
                    <div style={{ fontSize: '12px', color: D.secondary }}>{s.name}</div>
                    <div style={{ fontSize: '11px', color: D.secondary, marginTop: '3px' }}>
                      v{s.version_number} · {MODE_LABEL[s.mode] ?? s.mode} · {s.effective_date}
                    </div>
                  </div>
                  <div style={{ marginLeft: '8px', flexShrink: 0 }}>
                    {s.is_active
                      ? <span style={{ fontSize: '11px', background: '#DCFCE7', color: '#166534', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>Active</span>
                      : <span style={{ fontSize: '11px', background: '#F3F4F6', color: D.secondary, padding: '2px 7px', borderRadius: '4px' }}>Draft</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div>
          {!selectedId && (
            <div style={{ ...cardStyle, color: D.secondary, fontSize: '14px', textAlign: 'center', padding: '48px' }}>
              Select a structure from the list to view and edit its elements.
            </div>
          )}

          {selectedId && detailLoading && (
            <div style={{ ...cardStyle, fontSize: '13px', color: D.secondary }}>Loading…</div>
          )}

          {detail && !detailLoading && (
            <>
              {/* Structure header */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: D.secondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
                      {detail.skus?.part_number} — {detail.skus?.name}
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: 800, marginBottom: '4px' }}>{detail.name}</div>
                    <div style={{ fontSize: '13px', color: D.secondary }}>
                      v{detail.version_number} · {MODE_LABEL[detail.mode]} · Effective: {detail.effective_date}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {detail.is_active
                      ? <span style={{ fontSize: '12px', background: '#DCFCE7', color: '#166534', padding: '4px 10px', borderRadius: '5px', fontWeight: 700 }}>Active</span>
                      : <button onClick={() => activate(detail.id)} style={{ fontSize: '13px', background: D.success, color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}>Activate</button>}
                  </div>
                </div>
                {detail.notes && <div style={{ marginTop: '10px', fontSize: '13px', color: D.secondary, background: '#F9FAFB', borderRadius: '5px', padding: '8px 12px' }}>{detail.notes}</div>}
              </div>

              {/* Elements */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700 }}>Process Elements ({sortedElements.length})</div>
                  <button onClick={() => { setShowAddEl(true); setSaveError(null) }} style={{ fontSize: '13px', background: D.blue, color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}>
                    + Add Element
                  </button>
                </div>

                {sortedElements.length === 0 && (
                  <div style={{ fontSize: '13px', color: D.secondary, textAlign: 'center', padding: '24px 0' }}>
                    No elements defined. Add at least one process element to use this structure.
                  </div>
                )}

                {sortedElements.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#F8F9FA', borderBottom: `2px solid ${D.border}` }}>
                        {['Seq', 'Category', 'Name', 'Service SKU', 'Qty', 'Cost Source', 'Value', ''].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: '11px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedElements.map(el => (
                        <tr key={el.id} style={{ borderBottom: `1px solid ${D.border}` }}>
                          <td style={{ padding: '10px 10px', fontWeight: 700, color: D.blue }}>{el.sequence}</td>
                          <td style={{ padding: '10px 10px', fontSize: '11px', color: D.secondary }}>{el.process_category.replace(/_/g, ' ')}</td>
                          <td style={{ padding: '10px 10px', fontWeight: 600 }}>{el.name}</td>
                          <td style={{ padding: '10px 10px', fontSize: '12px', color: D.secondary }}>
                            {el.skus ? <><strong>{el.skus.part_number}</strong> <span>{el.skus.name}</span></> : <span style={{ color: '#9CA3AF' }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 10px', textAlign: 'right' }}>{el.quantity}</td>
                          <td style={{ padding: '10px 10px' }}>
                            <span style={{ fontSize: '11px', background: '#EFF6FF', color: D.blue, padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                              {SOURCE_LABEL[el.cost_source] ?? el.cost_source}
                            </span>
                          </td>
                          <td style={{ padding: '10px 10px', fontSize: '12px', color: D.secondary }}>
                            {el.cost_source === 'FIXED' ? `${el.fixed_cost} ${el.fixed_currency}` : 'resolved at build'}
                          </td>
                          <td style={{ padding: '10px 10px' }}>
                            <button onClick={() => deleteElement(el.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.error, fontSize: '13px' }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {sortedElements.length > 0 && (
                      <tfoot>
                        <tr style={{ background: '#F8F9FA' }}>
                          <td colSpan={4} style={{ padding: '10px 10px', fontSize: '12px', fontWeight: 700, color: D.secondary }}>Total</td>
                          <td colSpan={3} style={{ padding: '10px 10px', fontSize: '12px', color: D.secondary }}>
                            {sortedElements.filter(e => e.cost_source === 'FIXED').length > 0 && (
                              <>Fixed: {sortedElements.filter(e => e.cost_source === 'FIXED').reduce((s, e) => s + Number(e.fixed_cost ?? 0) * Number(e.quantity), 0).toFixed(4)}{' '}</>
                            )}
                            {sortedElements.filter(e => e.cost_source !== 'FIXED').length > 0 && (
                              <span style={{ color: D.secondary }}>+ {sortedElements.filter(e => e.cost_source !== 'FIXED').length} dynamic element(s) resolved at build</span>
                            )}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                )}

                {/* Add element inline form */}
                {showAddEl && (
                  <div style={{ marginTop: '20px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '8px', padding: '18px 20px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Add Process Element</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={labelStyle}>Sequence</label>
                        <input type="number" value={addElForm.sequence} onChange={e => setAddElForm(f => ({ ...f, sequence: Number(e.target.value) }))} style={iStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Type</label>
                        <select value={addElForm.elementType} onChange={e => setAddElForm(f => ({ ...f, elementType: e.target.value }))} style={iStyle}>
                          {ELEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Category</label>
                        <select value={addElForm.processCategory} onChange={e => setAddElForm(f => ({ ...f, processCategory: e.target.value }))} style={iStyle}>
                          {PROCESS_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Name *</label>
                        <input value={addElForm.name} onChange={e => setAddElForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Turning" style={iStyle} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={labelStyle}>Cost Source *</label>
                        <select value={addElForm.costSource} onChange={e => setAddElForm(f => ({ ...f, costSource: e.target.value }))} style={iStyle}>
                          {COST_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Service SKU{addElForm.costSource !== 'FIXED' ? ' *' : ''}</label>
                        <input
                          value={addElForm.referenceSkuSearch}
                          onChange={e => { setAddElForm(f => ({ ...f, referenceSkuSearch: e.target.value, referenceSkuId: '', referenceSkuLabel: '' })) }}
                          placeholder={addElForm.costSource === 'FIXED' ? 'optional' : 'Search SVC-... SKU'}
                          disabled={addElForm.costSource === 'FIXED'}
                          style={{ ...iStyle, opacity: addElForm.costSource === 'FIXED' ? 0.5 : 1 }}
                        />
                        {refSkuResults.length > 0 && !addElForm.referenceSkuId && (
                          <div style={{ border: `1px solid ${D.border}`, borderTop: 'none', background: '#fff', borderRadius: '0 0 5px 5px', maxHeight: '120px', overflowY: 'auto', position: 'relative', zIndex: 10 }}>
                            {refSkuResults.map(s => (
                              <div key={s.id} onClick={() => { setAddElForm(f => ({ ...f, referenceSkuId: s.id, referenceSkuSearch: `${s.part_number} — ${s.name}`, referenceSkuLabel: s.part_number })); setRefSkuResults([]) }}
                                style={{ padding: '7px 10px', cursor: 'pointer', fontSize: '12px', borderBottom: `1px solid ${D.border}` }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                <strong>{s.part_number}</strong> — {s.name}
                              </div>
                            ))}
                          </div>
                        )}
                        {addElForm.referenceSkuId && <div style={{ fontSize: '11px', color: D.success, marginTop: '2px' }}>✓ {addElForm.referenceSkuLabel}</div>}
                      </div>
                      <div>
                        <label style={labelStyle}>Qty</label>
                        <input type="number" min={0.001} step={0.001} value={addElForm.quantity} onChange={e => setAddElForm(f => ({ ...f, quantity: Number(e.target.value) }))} style={iStyle} />
                      </div>
                      {addElForm.costSource === 'FIXED' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: '8px' }}>
                          <div>
                            <label style={labelStyle}>Fixed Cost *</label>
                            <input type="number" min={0} step={0.0001} value={addElForm.fixedCost} onChange={e => setAddElForm(f => ({ ...f, fixedCost: e.target.value }))} placeholder="0.0000" style={iStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>CCY</label>
                            <input value={addElForm.fixedCurrency} onChange={e => setAddElForm(f => ({ ...f, fixedCurrency: e.target.value.toUpperCase().slice(0, 3) }))} maxLength={3} style={iStyle} />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label style={labelStyle}>Notes</label>
                          <input value={addElForm.notes} onChange={e => setAddElForm(f => ({ ...f, notes: e.target.value }))} placeholder="optional" style={iStyle} />
                        </div>
                      )}
                    </div>
                    {saveError && <div style={{ color: D.error, fontSize: '13px', marginBottom: '10px' }}>{saveError}</div>}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={addElement} disabled={saving} style={{ background: D.blue, color: '#fff', border: 'none', borderRadius: '6px', padding: '7px 18px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                        {saving ? 'Saving…' : 'Add Element'}
                      </button>
                      <button onClick={() => { setShowAddEl(false); setSaveError(null) }} style={{ background: '#F3F4F6', color: D.dark, border: 'none', borderRadius: '6px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Structure modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '28px 32px', width: '480px', maxWidth: '95vw' }}>
            <h2 style={{ margin: 0, marginBottom: '18px', fontSize: '18px', fontWeight: 800 }}>New Manufacturing Cost Structure</h2>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>SKU *</label>
              <input value={skuSearch} onChange={e => { setSkuSearch(e.target.value); if (!e.target.value) setCreateForm(f => ({ ...f, skuId: '', skuLabel: '' })) }} placeholder="Search part number or name…" style={iStyle} />
              {skuResults.length > 0 && !createForm.skuId && (
                <div style={{ border: `1px solid ${D.border}`, borderTop: 'none', background: '#fff', borderRadius: '0 0 5px 5px', maxHeight: '150px', overflowY: 'auto' }}>
                  {skuResults.map(s => (
                    <div key={s.id} onClick={() => { setCreateForm(f => ({ ...f, skuId: s.id, skuLabel: `${s.part_number} — ${s.name}`, name: `${s.part_number} Mfg Cost Structure` })); setSkuSearch(`${s.part_number} — ${s.name}`); setSkuResults([]) }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: `1px solid ${D.border}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <strong>{s.part_number}</strong> — {s.name}
                      <span style={{ marginLeft: '6px', fontSize: '11px', color: D.secondary }}>{s.item_cost_type}</span>
                    </div>
                  ))}
                </div>
              )}
              {createForm.skuId && <div style={{ fontSize: '11px', color: D.success, marginTop: '3px' }}>✓ {createForm.skuLabel}</div>}
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Name *</label>
              <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Shaft A Mfg Cost Structure" style={iStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Mode *</label>
                <select value={createForm.mode} onChange={e => setCreateForm(f => ({ ...f, mode: e.target.value }))} style={iStyle}>
                  {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <div style={{ fontSize: '11px', color: D.secondary, marginTop: '3px' }}>{MODES.find(m => m.value === createForm.mode)?.desc}</div>
              </div>
              <div>
                <label style={labelStyle}>Effective Date *</label>
                <input type="date" value={createForm.effectiveDate} onChange={e => setCreateForm(f => ({ ...f, effectiveDate: e.target.value }))} style={iStyle} />
              </div>
            </div>
            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>Notes</label>
              <input value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} placeholder="optional" style={iStyle} />
            </div>
            {saveError && <div style={{ color: D.error, fontSize: '13px', marginBottom: '10px' }}>{saveError}</div>}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowCreate(false); setSaveError(null) }} style={{ background: '#F3F4F6', border: 'none', borderRadius: '6px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createStructure} disabled={saving} style={{ background: D.red, color: '#fff', border: 'none', borderRadius: '6px', padding: '9px 22px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                {saving ? 'Creating…' : 'Create Structure'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

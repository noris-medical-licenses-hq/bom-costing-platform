'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRole } from '../hooks/useRole'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', error: '#dc2626', warning: '#d97706',
  blue: '#1565c0', blueLight: '#EFF6FF',
}

type FxRate = {
  id: string; from_currency: string; to_currency: string; rate: number
  effective_date: string; source_label: string | null; created_at: string
}

const iStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${D.border}`,
  borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: D.card,
}
const labelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '4px',
}

const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'ILS', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK']

function AddRateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom]     = useState('EUR')
  const [to, setTo]         = useState('USD')
  const [rate, setRate]     = useState('')
  const [date, setDate]     = useState(today)
  const [label, setLabel]   = useState('ECB')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function submit() {
    const rateNum = parseFloat(rate)
    if (!rateNum || rateNum <= 0) { setError('Rate must be a positive number'); return }
    if (from === to) { setError('From and To currencies must be different'); return }
    setLoading(true); setError(null)
    const res  = await fetch('/api/corporate-fx', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromCurrency: from, toCurrency: to, rate: rateNum, effectiveDate: date, sourceLabel: label }),
    })
    const json = await res.json()
    setLoading(false)
    if (res.ok) onDone()
    else setError(json.error ?? 'Failed to save rate')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: D.card, borderRadius: '12px', padding: '28px', width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: D.dark }}>Add FX Rate</h2>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: D.error }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>From Currency</label>
            <select style={iStyle} value={from} onChange={e => setFrom(e.target.value)}>
              {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>To Currency</label>
            <select style={iStyle} value={to} onChange={e => setTo(e.target.value)}>
              {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>Rate (1 {from} = ? {to})</label>
            <input style={iStyle} type="number" step="0.000001" value={rate} onChange={e => setRate(e.target.value)} placeholder="1.085000" />
          </div>
          <div>
            <label style={labelStyle}>Effective Date</label>
            <input style={iStyle} type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>Source Label</label>
          <input style={iStyle} value={label} onChange={e => setLabel(e.target.value)} placeholder="ECB, Bloomberg, Manual…" />
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={loading || !from || !to || !rate || !date}
            style={{ background: D.blue, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Saving…' : 'Save Rate'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FxRatesPage() {
  const { isViewer }              = useRole()
  const [rates, setRates]         = useState<FxRate[]>([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [filterFrom, setFilterFrom] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/corporate-fx')
    const json = await res.json()
    setLoading(false)
    setRates(json.data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  async function confirmDelete(id: string) {
    await fetch(`/api/corporate-fx/${id}`, { method: 'DELETE' })
    setDeleteId(null)
    load()
  }

  const currencies = [...new Set(rates.map(r => r.from_currency))].sort()
  const filtered   = filterFrom ? rates.filter(r => r.from_currency === filterFrom) : rates

  // Group by from_currency for display
  const grouped = filtered.reduce<Record<string, FxRate[]>>((acc, r) => {
    if (!acc[r.from_currency]) acc[r.from_currency] = []
    acc[r.from_currency].push(r)
    return acc
  }, {})

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>FX Rates</h1>
          <p style={{ fontSize: '13px', color: D.secondary, margin: '4px 0 0' }}>Corporate exchange rates used in multi-currency inventory valuations</p>
        </div>
        {!isViewer && (
          <button onClick={() => setShowAdd(true)}
            style={{ background: D.blue, color: '#fff', border: 'none', borderRadius: '7px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            + Add Rate
          </button>
        )}
      </div>

      {showAdd && <AddRateModal onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load() }} />}

      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: D.card, borderRadius: '10px', padding: '24px', width: '380px' }}>
            <h3 style={{ margin: '0 0 12px', color: D.dark }}>Delete FX Rate?</h3>
            <p style={{ fontSize: '13px', color: D.secondary, margin: '0 0 20px' }}>This rate will no longer be available for valuations. Existing reports that used it are unaffected.</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteId(null)} style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => confirmDelete(deleteId)} style={{ background: D.error, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Usage note */}
      <div style={{ background: D.blueLight, border: `1px solid #BFDBFE`, borderRadius: '8px', padding: '14px 16px', marginBottom: '20px', fontSize: '13px', color: '#1e40af' }}>
        <strong>How these rates are used:</strong> When running a valuation with FX source = "corporate", the engine copies the latest effective rate for each currency pair. Rates here do not affect historical reports that have already been run.
      </div>

      {/* Filter */}
      {currencies.length > 1 && (
        <select style={{ ...iStyle, width: '180px', marginBottom: '16px' }} value={filterFrom} onChange={e => setFilterFrom(e.target.value)}>
          <option value="">All Currencies</option>
          {currencies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}

      {loading ? (
        <p style={{ color: D.secondary, fontSize: '14px' }}>Loading rates…</p>
      ) : rates.length === 0 ? (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '40px', textAlign: 'center', color: D.secondary, fontSize: '14px' }}>
          No FX rates configured. Click "Add Rate" to enter your first exchange rate.
        </div>
      ) : (
        Object.entries(grouped).map(([ccy, group]) => (
          <div key={ccy} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', marginBottom: '16px' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${D.border}`, background: D.bg, borderRadius: '10px 10px 0 0' }}>
              <span style={{ fontWeight: 700, fontSize: '14px', color: D.dark }}>1 {ccy} = …</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Target Currency', 'Rate', 'Effective Date', 'Source', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.map(r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${D.border}` }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: D.dark }}>{r.to_currency}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: D.dark }}>{r.rate.toFixed(6)}</td>
                    <td style={{ padding: '10px 16px', color: D.secondary }}>{r.effective_date}</td>
                    <td style={{ padding: '10px 16px', color: D.secondary, fontSize: '12px' }}>{r.source_label ?? '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {!isViewer && (
                        <button onClick={() => setDeleteId(r.id)}
                          style={{ fontSize: '12px', color: D.error, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '5px', padding: '4px 10px', cursor: 'pointer' }}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}

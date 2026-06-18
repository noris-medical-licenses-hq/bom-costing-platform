'use client'
import { useState } from 'react'

type AuditEvent = {
  id: string
  event_type: string
  entity_type: string
  entity_id: string | null
  user_id: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

const EVENT_COLORS: Record<string, string> = {
  create: '#1565c0',
  update: '#e65100',
  delete: '#c62828',
  approve: '#2e7d32',
  archive: '#6a1b9a',
  calculate: '#00695c',
  validate: '#f57f17',
}

const PAGE_SIZE = 25

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [page, setPage] = useState(0)
  const [entityType, setEntityType] = useState('')
  const [eventType, setEventType] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load(reset = false) {
    const p = reset ? 0 : page
    if (reset) setPage(0)
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(p * PAGE_SIZE) })
    if (entityType) params.set('entity_type', entityType)
    if (eventType) params.set('event_type', eventType)
    const res = await fetch(`/api/audit?${params}`)
    const json = await res.json()
    setLoading(false)
    setLoaded(true)
    if (res.ok) setEvents(json.data ?? [])
    else setError(json.error)
  }

  return (
    <div>
      <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>Audit Log</h1>

      {error && <div style={{ background: '#fee', border: '1px solid #fcc', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px', color: '#c00' }}>{error}</div>}

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Entity Type</label>
          <select value={entityType} onChange={e => setEntityType(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}>
            <option value="">All entities</option>
            {['sku', 'bom', 'bom_version', 'cost_set', 'cost_item', 'cost_rule', 'rule_exception', 'inventory_snapshot'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Event Type</label>
          <select value={eventType} onChange={e => setEventType(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}>
            <option value="">All events</option>
            {['create', 'update', 'delete', 'approve', 'archive', 'calculate', 'validate'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button onClick={() => load(true)} disabled={loading} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
          {loading ? 'Loading...' : 'Search'}
        </button>
        {page > 0 && (
          <button onClick={() => { setPage(p => p - 1); load() }} style={{ padding: '8px 14px', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>← Prev</button>
        )}
        {events.length === PAGE_SIZE && (
          <button onClick={() => { setPage(p => p + 1); load() }} style={{ padding: '8px 14px', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Next →</button>
        )}
      </div>

      {!loaded ? (
        <div style={{ background: '#f8f8f8', border: '1px dashed #ccc', borderRadius: '8px', padding: '40px', textAlign: 'center', color: '#888', fontSize: '14px' }}>
          Use filters above and click Search to load audit events
        </div>
      ) : events.length === 0 ? (
        <div style={{ background: '#f8f8f8', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '40px', textAlign: 'center', color: '#888', fontSize: '14px' }}>
          No audit events found for the selected filters
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
          {events.map(ev => (
            <div key={ev.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <div onClick={() => setExpanded(expanded === ev.id ? null : ev.id)} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  background: EVENT_COLORS[ev.event_type] ?? '#888',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  minWidth: '64px',
                  textAlign: 'center',
                }}>{ev.event_type.toUpperCase()}</span>
                <span style={{ fontSize: '12px', color: '#888', width: '120px', flexShrink: 0 }}>{ev.entity_type}</span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#444', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.entity_id ?? '—'}
                </span>
                <span style={{ fontSize: '11px', color: '#aaa', whiteSpace: 'nowrap' }}>
                  {new Date(ev.created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span style={{ color: '#ccc', fontSize: '12px' }}>{expanded === ev.id ? '▲' : '▼'}</span>
              </div>
              {expanded === ev.id && (
                <div style={{ padding: '12px 16px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px', fontSize: '12px' }}>
                    <div><span style={{ color: '#888' }}>Event ID: </span><code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: '2px' }}>{ev.id}</code></div>
                    <div><span style={{ color: '#888' }}>User: </span><code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: '2px' }}>{ev.user_id ?? 'system'}</code></div>
                  </div>
                  {ev.metadata && (
                    <pre style={{ background: '#1a1a2e', color: '#e0e0e0', padding: '12px', borderRadius: '4px', fontSize: '11px', overflow: 'auto', maxHeight: '200px', margin: 0 }}>
                      {JSON.stringify(ev.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

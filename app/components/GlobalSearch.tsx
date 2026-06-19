'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

type SearchResult = { type: string; id: string; label: string; sub: string; href: string }

const TYPE_COLOR: Record<string, string> = {
  SKU: '#7c3aed', Supplier: '#0d9488', 'Cost Build': '#1565c0',
  Snapshot: '#d97706', 'Price List': '#C62839',
}

export function GlobalSearch() {
  const [q, setQ]               = useState('')
  const [results, setResults]   = useState<SearchResult[]>([])
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const inputRef                = useRef<HTMLInputElement>(null)
  const timerRef                = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (term: string) => {
    if (term.length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    const res  = await fetch(`/api/search?q=${encodeURIComponent(term)}`)
    const json = await res.json()
    setLoading(false)
    setResults(json.data ?? [])
    setOpen(true)
  }, [])

  function onChange(val: string) {
    setQ(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 280)
  }

  function navigate(href: string) {
    window.location.href = href
    setOpen(false); setQ('')
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.closest('[data-search-root]')?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div data-search-root style={{ position: 'relative', width: '240px' }}>
      <input
        ref={inputRef}
        value={q}
        onChange={e => onChange(e.target.value)}
        onFocus={() => q.length >= 2 && setOpen(true)}
        placeholder="Search SKU, supplier…"
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '6px 10px 6px 32px', border: '1px solid #E5E7EB',
          borderRadius: '7px', fontSize: '13px', background: '#F8F9FA',
          outline: 'none',
        }}
      />
      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#9CA3AF', pointerEvents: 'none' }}>🔍</span>
      {loading && (
        <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#9CA3AF' }}>…</span>
      )}

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 500, maxHeight: '360px', overflow: 'auto',
        }}>
          {results.map((r, i) => (
            <div
              key={r.id + i}
              onClick={() => navigate(r.href)}
              style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: '10px' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F8F9FA')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <span style={{
                fontSize: '10px', fontWeight: 700, color: TYPE_COLOR[r.type] ?? '#666',
                background: `${TYPE_COLOR[r.type] ?? '#666'}12`, border: `1px solid ${TYPE_COLOR[r.type] ?? '#666'}30`,
                borderRadius: '4px', padding: '1px 5px', whiteSpace: 'nowrap', minWidth: '60px', textAlign: 'center',
              }}>
                {r.type}
              </span>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                {r.sub && <div style={{ fontSize: '11px', color: '#999', marginTop: '1px' }}>{r.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && q.length >= 2 && results.length === 0 && !loading && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 500, padding: '14px',
          fontSize: '13px', color: '#999', textAlign: 'center',
        }}>
          No results for "{q}"
        </div>
      )}
    </div>
  )
}

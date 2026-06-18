'use client'
import { useState, useEffect } from 'react'

export function NavUser() {
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setEmail(d?.user?.email ?? null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  if (loading) return null

  if (!email) {
    return (
      <a href="/login" style={{ color: '#ccc', textDecoration: 'none', fontSize: '13px', marginLeft: 'auto' }}>
        Sign in
      </a>
    )
  }

  return (
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{ fontSize: '12px', color: '#999', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
      <button
        onClick={logout}
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
      >
        Sign out
      </button>
    </div>
  )
}

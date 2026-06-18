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
      <a href="/login" style={{ fontSize: '13px', fontWeight: 500, color: '#C62839', textDecoration: 'none', border: '1px solid #C62839', borderRadius: '5px', padding: '4px 12px' }}>
        Sign in
      </a>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ fontSize: '12px', color: '#666666', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {email}
      </span>
      <button
        onClick={logout}
        style={{ fontSize: '12px', color: '#666666', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: '5px', padding: '4px 10px', cursor: 'pointer' }}
      >
        Sign out
      </button>
    </div>
  )
}

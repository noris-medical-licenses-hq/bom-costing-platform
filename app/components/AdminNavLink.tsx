'use client'
import { useRole } from '../hooks/useRole'

export function AdminNavLink() {
  const { isAdmin, loading } = useRole()
  if (loading || !isAdmin) return null
  return (
    <a href="/admin" style={{ fontSize: '13px', fontWeight: 500, color: '#444444', textDecoration: 'none', padding: '5px 9px', borderRadius: '5px', whiteSpace: 'nowrap' }}>
      Admin
    </a>
  )
}

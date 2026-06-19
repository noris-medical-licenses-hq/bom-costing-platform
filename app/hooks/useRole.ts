'use client'
import { useState, useEffect } from 'react'

type Me = { id: string; email: string | null; full_name: string | null; role: string | null; organization_id: string | null }

export function useRole() {
  const [me, setMe]         = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(j => { setMe(j.user ?? null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const role      = me?.role ?? null
  const isAdmin   = role === 'admin'
  const canApprove = role === 'admin' || role === 'approver' || role === 'cost_analyst'
  const isViewer  = role === 'viewer'

  return { me, loading, role, isAdmin, canApprove, isViewer }
}

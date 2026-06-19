'use client'
import { useState, useEffect, useCallback } from 'react'

const D = {
  red: '#C62839', dark: '#222222', secondary: '#666666',
  bg: '#F8F9FA', card: '#FFFFFF', border: '#E5E7EB',
  success: '#16a34a', error: '#dc2626', warning: '#d97706',
  blue: '#1565c0', blueLight: '#EFF6FF',
}

const ROLES = ['viewer', 'editor', 'cost_analyst', 'procurement', 'approver', 'admin'] as const
type Role = typeof ROLES[number]

const ROLE_LABEL: Record<Role, string> = {
  viewer: 'Viewer', editor: 'Editor', cost_analyst: 'Cost Analyst',
  procurement: 'Procurement', approver: 'Approver', admin: 'Admin',
}
const ROLE_COLOR: Record<Role, string> = {
  viewer: D.secondary, editor: '#0d9488', cost_analyst: '#7c3aed',
  procurement: '#d97706', approver: D.blue, admin: D.red,
}

type User = {
  id: string; full_name: string; email: string; role: Role
  is_active: boolean; last_seen_at: string | null; created_at: string
}

const iStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${D.border}`,
  borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: D.card,
}
const labelStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: D.secondary, display: 'block', marginBottom: '4px',
}

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail]   = useState('')
  const [name, setName]     = useState('')
  const [role, setRole]     = useState<Role>('viewer')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [sent, setSent]     = useState(false)

  async function submit() {
    if (!email || !name) return
    setLoading(true)
    setError(null)
    const res  = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, full_name: name, role }),
    })
    const json = await res.json()
    setLoading(false)
    if (res.ok) { setSent(true); setTimeout(onDone, 1500) }
    else setError(json.error ?? 'Failed to invite user')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: D.card, borderRadius: '12px', padding: '28px', width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: D.dark }}>Invite User</h2>

        {sent ? (
          <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', padding: '16px', textAlign: 'center', color: D.success }}>
            Invitation email sent to {email}
          </div>
        ) : (
          <>
            {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: D.error }}>{error}</div>}

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Full Name</label>
              <input style={iStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Email Address</label>
              <input style={iStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com" />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Role</label>
              <select style={iStyle} value={role} onChange={e => setRole(e.target.value as Role)}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <p style={{ fontSize: '11px', color: D.secondary, margin: '6px 0 0' }}>
                viewer = read-only · editor = data entry · cost_analyst = cost builds · approver = approve + lock · admin = full access
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submit} disabled={loading || !email || !name}
                style={{ background: D.blue, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: loading || !email || !name ? 0.6 : 1 }}>
                {loading ? 'Sending…' : 'Send Invitation'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function RoleSelect({ user, onChanged, currentUserId }: { user: User; onChanged: () => void; currentUserId: string }) {
  const [saving, setSaving] = useState(false)

  async function changeRole(newRole: Role) {
    if (newRole === user.role) return
    setSaving(true)
    await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    setSaving(false)
    onChanged()
  }

  const isCurrentUser = user.id === currentUserId
  return (
    <select
      value={user.role}
      disabled={saving || isCurrentUser}
      onChange={e => changeRole(e.target.value as Role)}
      style={{
        fontSize: '12px', padding: '4px 8px', borderRadius: '5px', cursor: 'pointer',
        color: ROLE_COLOR[user.role], background: `${ROLE_COLOR[user.role]}12`,
        border: `1px solid ${ROLE_COLOR[user.role]}40`,
        fontWeight: 600, opacity: saving ? 0.6 : 1,
      }}
    >
      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
    </select>
  )
}

export default function AdminPage() {
  const [users, setUsers]         = useState<User[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [usersRes, meRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/auth/me'),
    ])
    const [usersJson, meJson] = await Promise.all([usersRes.json(), meRes.json()])
    setLoading(false)
    if (usersRes.ok) setUsers(usersJson.data ?? [])
    else setError(usersJson.error ?? 'Failed to load users')
    if (meRes.ok) setCurrentUserId(meJson.user?.id ?? '')
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActive(u: User) {
    setActionLoading(u.id)
    await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !u.is_active }),
    })
    setActionLoading(null)
    load()
  }

  const active   = users.filter(u => u.is_active)
  const inactive = users.filter(u => !u.is_active)

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: 0 }}>Admin Panel</h1>
          <p style={{ fontSize: '13px', color: D.secondary, margin: '4px 0 0' }}>Manage users, roles, and access</p>
        </div>
        <button onClick={() => setShowInvite(true)}
          style={{ background: D.blue, color: '#fff', border: 'none', borderRadius: '7px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          + Invite User
        </button>
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onDone={() => { setShowInvite(false); load() }} />}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '16px', marginBottom: '20px', fontSize: '13px', color: D.error }}>
          {error.includes('Insufficient permissions') ? (
            <>You need <strong>admin</strong> role to access this page. Contact your system administrator.</>
          ) : error}
        </div>
      )}

      {loading ? (
        <p style={{ color: D.secondary, fontSize: '14px' }}>Loading users…</p>
      ) : (
        <>
          {/* Active Users */}
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', marginBottom: '24px' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: D.dark }}>Active Users ({active.length})</h2>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: D.bg }}>
                  {['Name', 'Email', 'Role', 'Last Active', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.map(u => (
                  <tr key={u.id} style={{ borderTop: `1px solid ${D.border}` }}>
                    <td style={{ padding: '12px 16px', fontWeight: 500, color: D.dark }}>
                      {u.full_name}
                      {u.id === currentUserId && <span style={{ fontSize: '10px', background: '#DBEAFE', color: D.blue, borderRadius: '4px', padding: '1px 6px', marginLeft: '8px' }}>you</span>}
                    </td>
                    <td style={{ padding: '12px 16px', color: D.secondary }}>{u.email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <RoleSelect user={u} onChanged={load} currentUserId={currentUserId} />
                    </td>
                    <td style={{ padding: '12px 16px', color: D.secondary, fontSize: '12px' }}>
                      {u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {u.id !== currentUserId && (
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={actionLoading === u.id}
                          style={{ fontSize: '12px', color: D.warning, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '5px', padding: '4px 10px', cursor: 'pointer' }}
                        >
                          {actionLoading === u.id ? '…' : 'Deactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inactive Users */}
          {inactive.length > 0 && (
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px' }}>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}` }}>
                <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: D.secondary }}>Deactivated Users ({inactive.length})</h2>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: D.bg }}>
                    {['Name', 'Email', 'Role', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inactive.map(u => (
                    <tr key={u.id} style={{ borderTop: `1px solid ${D.border}`, opacity: 0.6 }}>
                      <td style={{ padding: '12px 16px', color: D.dark }}>{u.full_name}</td>
                      <td style={{ padding: '12px 16px', color: D.secondary }}>{u.email}</td>
                      <td style={{ padding: '12px 16px', color: D.secondary }}>{ROLE_LABEL[u.role]}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={actionLoading === u.id}
                          style={{ fontSize: '12px', color: D.success, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '5px', padding: '4px 10px', cursor: 'pointer' }}
                        >
                          {actionLoading === u.id ? '…' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

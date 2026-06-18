'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { error: authError } = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })

    setLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }

    if (mode === 'signup') {
      setSent(true)
      return
    }

    window.location.href = '/'
  }

  if (sent) {
    return (
      <div style={centerStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 8px', fontSize: '18px' }}>Check your email</h2>
          <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
            We sent a confirmation link to <strong>{email}</strong>.
            Click the link to activate your account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={centerStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a1a2e', letterSpacing: '0.5px', marginBottom: '4px' }}>
            NORIS MEDICAL
          </div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>BOM Costing Platform</h1>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: '13px' }}>
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {error && (
          <div style={{ background: '#fee', border: '1px solid #fcc', borderRadius: '6px', padding: '10px 12px', marginBottom: '16px', fontSize: '13px', color: '#c00' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="you@norismedical.com"
              autoComplete="email"
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
              placeholder={mode === 'signup' ? 'Minimum 8 characters' : '••••••••'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', background: '#1a1a2e', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: '#666' }}>
          {mode === 'login' ? (
            <>No account? <button onClick={() => setMode('signup')} style={linkButtonStyle}>Create one</button></>
          ) : (
            <>Already have an account? <button onClick={() => setMode('login')} style={linkButtonStyle}>Sign in</button></>
          )}
        </div>
      </div>
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f5f5f5',
  padding: '24px',
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e0e0e0',
  borderRadius: '12px',
  padding: '32px',
  width: '100%',
  maxWidth: '380px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#444',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #ccc',
  borderRadius: '6px',
  fontSize: '14px',
  boxSizing: 'border-box',
  outline: 'none',
}

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#1a1a2e',
  cursor: 'pointer',
  textDecoration: 'underline',
  fontSize: '13px',
  padding: 0,
}

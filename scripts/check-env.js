#!/usr/bin/env node
// Environment variable readiness checker — runs without Docker or Supabase.
// Validates that all required env vars are present and plausibly formatted.
// Usage: node scripts/check-env.js
// Or: npm run check-env

const required = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL',   pattern: /^https:\/\/.+\.supabase\.co$/, hint: 'e.g. https://xyzxyz.supabase.co' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', pattern: /^eyJ/, hint: 'JWT starting with eyJ' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY',  pattern: /^eyJ/, hint: 'JWT starting with eyJ (keep secret, server-only)' },
]

const optional = [
  { key: 'NEXT_PUBLIC_SITE_URL',        hint: 'e.g. https://bom.norismedical.com or http://localhost:3000' },
  { key: 'SUPABASE_DB_URL',             hint: 'postgres://... — needed for direct psql access and seeding' },
  { key: 'WEBHOOK_SECRET',              hint: 'Random secret ≥32 chars — required for auth webhook profile creation' },
  { key: 'DEFAULT_ORGANIZATION_ID',     hint: 'UUID from organizations table — required for auth webhook' },
]

let exitCode = 0

function check(key, pattern, hint, required) {
  const val = process.env[key]
  if (!val) {
    const tag = required ? 'MISSING (required)' : 'MISSING (optional)'
    console.log(`  ${required ? '✗' : '~'} ${key.padEnd(42)} ${tag}`)
    if (required) { console.log(`      → ${hint}`); exitCode = 1 }
    return
  }
  if (pattern && !pattern.test(val)) {
    console.log(`  ✗ ${key.padEnd(42)} INVALID FORMAT`)
    console.log(`      → Expected: ${hint}`)
    console.log(`      → Got:      ${val.slice(0, 30)}...`)
    exitCode = 1
    return
  }
  const display = val.length > 30 ? val.slice(0, 24) + '...' : val
  console.log(`  ✓ ${key.padEnd(42)} ${display}`)
}

// Try loading .env.local
try {
  const fs = require('fs'), path = require('path')
  const envPath = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const [k, ...rest] = line.split('=')
      if (k && !k.startsWith('#') && rest.length) {
        process.env[k.trim()] ??= rest.join('=').trim().replace(/^['"]|['"]$/g, '')
      }
    }
    console.log('  (loaded .env.local)')
  }
} catch {}

console.log('\n─── Required Environment Variables ─────────────────────────────────')
for (const { key, pattern, hint } of required) check(key, pattern, hint, true)

console.log('\n─── Optional Environment Variables ─────────────────────────────────')
for (const { key, hint } of optional) check(key, undefined, hint, false)

console.log('\n─── Security Checks ─────────────────────────────────────────────────')
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''
const nextPublicKeys = Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC_') && process.env[k] === serviceKey)
if (nextPublicKeys.length) {
  console.log(`  ✗ SERVICE_ROLE_KEY is exposed as NEXT_PUBLIC_* variable! This is a critical security issue.`)
  exitCode = 1
} else if (serviceKey) {
  console.log('  ✓ SERVICE_ROLE_KEY is NOT exposed as NEXT_PUBLIC_* variable')
}

console.log('')
if (exitCode === 0) {
  console.log('✅ Environment check passed.\n')
} else {
  console.log('❌ Environment check FAILED. Fix the issues above before deploying.\n')
  process.exit(exitCode)
}

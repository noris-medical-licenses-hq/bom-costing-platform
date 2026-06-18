#!/usr/bin/env node
// Seed script runner — applies scripts/seed.sql to the target database.
// Requires SUPABASE_DB_URL, ORG_ID, and USER_ID env vars.
// Usage: node scripts/apply-seed.js
//   or: ORG_ID=... USER_ID=... node scripts/apply-seed.js

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const SEED_FILE = path.join(__dirname, 'seed.sql')

// Try loading .env.local
try {
  const envPath = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const [k, ...rest] = line.split('=')
      if (k && !k.startsWith('#') && rest.length) {
        process.env[k.trim()] ??= rest.join('=').trim().replace(/^['"]|['"]$/g, '')
      }
    }
  }
} catch {}

const DB_URL  = process.env.SUPABASE_DB_URL
const ORG_ID  = process.env.ORG_ID
const USER_ID = process.env.USER_ID

if (!DB_URL) {
  console.error('❌ SUPABASE_DB_URL is not set. Cannot apply seed.')
  console.error('   Set it in .env.local or export before running this script.')
  process.exit(1)
}

if (!ORG_ID) {
  console.error('❌ ORG_ID is not set. The seed requires a real organization UUID.')
  console.error('   Find your org ID: SELECT id FROM organizations LIMIT 1;')
  process.exit(1)
}

if (!USER_ID) {
  console.error('❌ USER_ID is not set. The seed requires a real user UUID (from auth.users).')
  console.error('   Find your user ID: SELECT id FROM auth.users LIMIT 1;')
  process.exit(1)
}

// Validate UUID format
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!UUID_RE.test(ORG_ID))  { console.error(`❌ ORG_ID "${ORG_ID}" is not a valid UUID.`); process.exit(1) }
if (!UUID_RE.test(USER_ID)) { console.error(`❌ USER_ID "${USER_ID}" is not a valid UUID.`); process.exit(1) }

console.log('─── Applying seed data ─────────────────────────────────────────────')
console.log(`  DB:      ${DB_URL.replace(/:\/\/[^@]+@/, '://***@')}`)
console.log(`  ORG_ID:  ${ORG_ID}`)
console.log(`  USER_ID: ${USER_ID}`)
console.log('')

try {
  const output = execSync(
    `psql "${DB_URL}" -v org_id="${ORG_ID}" -v user_id="${USER_ID}" -f "${SEED_FILE}" 2>&1`,
    { encoding: 'utf8', timeout: 60000 }
  )
  console.log(output)
  console.log('✅ Seed applied successfully.')
} catch (e) {
  console.error('❌ Seed failed:')
  console.error(e.stdout || e.message)
  process.exit(1)
}

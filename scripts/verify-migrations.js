#!/usr/bin/env node
// Migration verification — checks that migration files match what Supabase knows.
// Requires SUPABASE_DB_URL to be set for the live-check mode.
// Without SUPABASE_DB_URL, falls back to static checks only.
// Usage: node scripts/verify-migrations.js [--live]

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations')
const LIVE = process.argv.includes('--live')

let exitCode = 0
function fail(msg) { console.log(`  ✗ ${msg}`); exitCode = 1 }
function ok(msg)   { console.log(`  ✓ ${msg}`) }
function warn(msg) { console.log(`  ~ ${msg}`) }

// ── Static checks ────────────────────────────────────────────────────────────

console.log('\n─── Static Migration File Checks ────────────────────────────────────')

if (!fs.existsSync(MIGRATIONS_DIR)) {
  fail(`Migrations directory not found: ${MIGRATIONS_DIR}`)
  console.log('\n❌ Verification failed.\n'); process.exit(1)
}

const files = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  warn('No migration files found')
} else {
  ok(`Found ${files.length} migration files`)
}

// Check naming convention: NNNN_description.sql
const namingRe = /^\d{4}_[a-z0-9_]+\.sql$/
const badNames = files.filter(f => !namingRe.test(f))
if (badNames.length) {
  fail(`Non-standard migration names: ${badNames.join(', ')}`)
} else {
  ok('All files follow naming convention NNN_description.sql')
}

// Check for sequence gaps
const numbers = files.map(f => parseInt(f.split('_')[0]))
for (let i = 1; i < numbers.length; i++) {
  if (numbers[i] !== numbers[i-1] + 1) {
    warn(`Gap in migration sequence: ${numbers[i-1]} → ${numbers[i]}`)
  }
}
if (numbers.length >= 2) {
  const gaps = numbers.filter((n, i) => i > 0 && n !== numbers[i-1] + 1)
  if (gaps.length === 0) ok('Migration sequence is contiguous')
}

// Check for dangerous statements in non-last migrations
const DANGER_RE = /\b(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM)\b/i
files.slice(0, -1).forEach(f => {
  const content = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')
  if (DANGER_RE.test(content)) warn(`${f} contains potentially destructive statement`)
})
ok('Destructive statement check complete')

// ── Live checks (requires DB connection) ────────────────────────────────────

if (LIVE) {
  console.log('\n─── Live DB Migration Checks ─────────────────────────────────────────')

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    fail('SUPABASE_DB_URL not set — cannot run live checks')
  } else {
    try {
      const result = execSync(
        `psql "${dbUrl}" -t -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version" 2>&1`,
        { encoding: 'utf8', timeout: 10000 }
      )
      const appliedVersions = result.trim().split('\n').map(l => l.trim()).filter(Boolean)
      ok(`${appliedVersions.length} migrations applied in DB`)

      // Check each local file has been applied
      const localVersions = files.map(f => f.replace('.sql', ''))
      const notApplied = localVersions.filter(v => !appliedVersions.some(a => a.includes(v.split('_')[0])))
      if (notApplied.length) {
        notApplied.forEach(v => fail(`NOT applied in DB: ${v}`))
      } else {
        ok('All local migrations are applied in DB')
      }
    } catch (e) {
      fail(`Could not connect to DB: ${e.message?.split('\n')[0]}`)
    }
  }
}

console.log('')
if (exitCode === 0) {
  console.log('✅ Migration verification passed.\n')
} else {
  console.log('❌ Migration verification FAILED.\n')
  process.exit(exitCode)
}

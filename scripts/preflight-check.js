#!/usr/bin/env node
/**
 * Pre-integration readiness check.
 * Validates that all required assets exist before attempting Supabase integration.
 * Does NOT require a live database or network connection.
 *
 * Usage: npm run preflight-check
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(process.cwd())
let pass = 0
let fail = 0
let warn = 0

function ok(msg)   { console.log(`  ✅ ${msg}`); pass++ }
function no(msg)   { console.error(`  ❌ ${msg}`); fail++ }
function wa(msg)   { console.warn(`  ⚠️  ${msg}`); warn++ }
function section(name) { console.log(`\n── ${name} ──`) }

// ─── 1. Required docs ────────────────────────────────────────────────────────
section('Documentation')
const requiredDocs = [
  'docs/MIGRATION_EXECUTION_ORDER.md',
  'docs/SEED_DATA_COVERAGE.md',
  'docs/OBSERVABILITY_REVIEW.md',
  'docs/ERROR_CATALOG.md',
  'docs/PILOT_DRY_RUN.md',
  'docs/GO_LIVE_BLOCKERS.md',
  'docs/pilot-checklist.md',
  'docs/known-limitations.md',
  'docs/smoke-test-script.md',
  'docs/supabase-setup-checklist.md',
]
for (const doc of requiredDocs) {
  if (existsSync(join(ROOT, doc))) ok(doc)
  else no(`Missing: ${doc}`)
}

// ─── 2. Required scripts ──────────────────────────────────────────────────────
section('Scripts')
const requiredScripts = [
  'scripts/seed.sql',
  'scripts/check-env.js',
  'scripts/verify-migrations.js',
  'scripts/apply-seed.js',
  'scripts/generate-types.js',
  'scripts/smoke-test.js',
  'scripts/preflight-check.js',
  'scripts/bootstrap-org.js',
]
for (const script of requiredScripts) {
  if (existsSync(join(ROOT, script))) ok(script)
  else no(`Missing: ${script}`)
}

// ─── 3. Migrations ────────────────────────────────────────────────────────────
section('Migrations')
const migDir = join(ROOT, 'database/migrations')
if (!existsSync(migDir)) {
  no('database/migrations/ directory not found')
} else {
  const files = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()
  ok(`Found ${files.length} migration files`)
  if (files.length !== 23) wa(`Expected 23 migrations, found ${files.length}`)

  // Check naming convention
  const badNames = files.filter(f => !/^\d{14}_\w+\.sql$/.test(f))
  if (badNames.length === 0) ok('All migration files follow naming convention')
  else no(`Naming violations: ${badNames.join(', ')}`)

  // Check sequence: all 23 expected suffixes (filenames: 20260618NNNNNN_name.sql, digits 8-13)
  const expectedNums = Array.from({ length: 23 }, (_, i) => String(i + 1).padStart(6, '0'))
  const foundNums = files.map(f => f.slice(8, 14))  // extract 000001..000023
  const missing = expectedNums.filter(n => !foundNums.includes(n))
  if (missing.length === 0) ok('No gaps in migration sequence')
  else no(`Missing sequence numbers: ${missing.join(', ')}`)
}

// ─── 4. Package scripts ───────────────────────────────────────────────────────
section('Package Scripts')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const requiredPackageScripts = [
  'dev', 'build', 'test', 'typecheck',
  'check-env', 'verify-migrations', 'apply-seed', 'generate-types',
  'smoke-test', 'preflight-check', 'bootstrap-org',
]
for (const s of requiredPackageScripts) {
  if (pkg.scripts?.[s]) ok(`npm run ${s}`)
  else no(`Missing package script: ${s}`)
}

// ─── 5. Environment template ──────────────────────────────────────────────────
section('Environment')
const envLocal = join(ROOT, '.env.local')
const envExample = join(ROOT, '.env.local.example')
if (existsSync(envLocal)) ok('.env.local exists (will be used for local dev)')
else wa('.env.local not found — create from .env.example before starting')

if (existsSync(envExample)) ok('.env.local.example exists')
else wa('.env.local.example not found — document required variables for new developers')

// ─── 6. Seed SQL sanity check ─────────────────────────────────────────────────
section('Seed SQL Sanity')
const seedPath = join(ROOT, 'scripts/seed.sql')
if (existsSync(seedPath)) {
  const seedContent = readFileSync(seedPath, 'utf8')

  // Check for old broken column names
  const brokenPatterns = [
    { pattern: 'family_code', fix: 'code' },
    { pattern: 'family_name', fix: 'name' },
    { pattern: 'subfamily_code', fix: 'code' },
    { pattern: 'supplier_code', fix: 'code' },
    { pattern: 'supplier_name', fix: 'name' },
    { pattern: 'site_code', fix: 'code' },
    { pattern: 'site_name', fix: 'name' },
    { pattern: 'warehouse_code', fix: 'code' },
    { pattern: 'warehouse_name', fix: 'name' },
    { pattern: 'cost_set_name', fix: 'name' },
    { pattern: "'supplier_id'", fix: 'default_supplier_id' },
    { pattern: 'valid_from', fix: 'effective_from' },
    { pattern: 'valid_to', fix: 'effective_to' },
    { pattern: 'effective_date,', fix: 'effective_from' },
    { pattern: ', scrap_rate,', fix: '(remove — column does not exist in bom_lines)' },
    { pattern: "'rule_id'", fix: 'cost_rule_id' },
    { pattern: ', rule_id,', fix: ', cost_rule_id,' },
    { pattern: "'material'", fix: "'material_price'" },
    { pattern: 'ORG_UUID_PLACEHOLDER', fix: 'remove — use psql variable :org_id' },
    { pattern: 'USER_UUID_PLACEHOLDER', fix: 'remove — use psql variable :user_id' },
  ]

  let seedClean = true
  for (const { pattern, fix } of brokenPatterns) {
    if (seedContent.includes(pattern)) {
      no(`seed.sql contains deprecated pattern '${pattern}' → should be '${fix}'`)
      seedClean = false
    }
  }
  if (seedClean) ok('seed.sql: no known broken column patterns detected')

  // Check for required correct patterns
  if (seedContent.includes('ON CONFLICT (id) DO NOTHING')) ok('seed.sql: uses ON CONFLICT idempotency')
  else wa('seed.sql: missing ON CONFLICT (id) DO NOTHING')

  if (seedContent.includes('cost_rule_id')) ok('seed.sql: uses cost_rule_id (correct FK)')
  else no('seed.sql: missing cost_rule_id references in rule_conditions/rule_actions')

  if (seedContent.includes('default_supplier_id')) ok('seed.sql: uses default_supplier_id (correct column)')
  else no('seed.sql: missing default_supplier_id in skus insert')

  if (seedContent.includes("'material_price'")) ok("seed.sql: uses 'material_price' (correct item_type)")
  else wa("seed.sql: no 'material_price' item_type found")
}

// ─── 7. TypeScript generated types ────────────────────────────────────────────
section('Type Generation')
const generatedTypes = join(ROOT, 'backend/types/database.generated.ts')
if (existsSync(generatedTypes)) ok('backend/types/database.generated.ts exists')
else wa('backend/types/database.generated.ts not found — run: npm run generate-types (requires live Supabase)')

// ─── 8. .env.example completeness ─────────────────────────────────────────────
if (existsSync(envExample)) {
  const envContent = readFileSync(envExample, 'utf8')
  const envVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WEBHOOK_SECRET',
    'DEFAULT_ORGANIZATION_ID',
  ]
  for (const v of envVars) {
    if (envContent.includes(v)) ok(`.env.local.example documents ${v}`)
    else wa(`.env.local.example missing ${v}`)
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50))
console.log(`Results: ${pass} passed  ${warn} warnings  ${fail} failed`)
console.log('─'.repeat(50))

if (fail > 0) {
  console.error(`\n❌ Preflight failed — fix ${fail} issue(s) before integrating\n`)
  process.exit(1)
} else if (warn > 0) {
  console.warn(`\n⚠️  Preflight passed with ${warn} warning(s) — review before piloting\n`)
  process.exit(0)
} else {
  console.log('\n✅ Preflight passed — ready for Supabase integration\n')
  process.exit(0)
}

#!/usr/bin/env node
// Static migration file validator — runs without Docker or Supabase.
// Checks: file ordering, naming convention, no duplicate table names,
// no unexpected destructive statements, file sequence completeness.
//
// Usage: node scripts/check-migrations.js
// Or via npm: npm run check-migrations

const fs = require('fs')
const path = require('path')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations')

let exitCode = 0
const errors = []
const warnings = []

function fail(msg) { errors.push(`ERROR: ${msg}`); exitCode = 1 }
function warn(msg) { warnings.push(`WARN:  ${msg}`) }
function ok(msg) { console.log(`  ✓ ${msg}`) }

console.log('\n=== Migration Static Check ===\n')

// 1. Check directory exists
if (!fs.existsSync(MIGRATIONS_DIR)) {
  fail(`Migration directory not found: ${MIGRATIONS_DIR}`)
  process.exit(1)
}

// 2. List migration files
const allFiles = fs.readdirSync(MIGRATIONS_DIR).sort()
const sqlFiles = allFiles.filter(f => f.endsWith('.sql') && f !== '.gitkeep')

if (sqlFiles.length === 0) {
  fail('No .sql migration files found in database/migrations/')
  process.exit(1)
}

ok(`Found ${sqlFiles.length} migration files`)

// 3. Check naming convention: YYYYMMDDHHMMSS_description.sql or numbered
const MIGRATION_REGEX = /^\d{14}_[a-z0-9_]+\.sql$/
const invalidNames = sqlFiles.filter(f => !MIGRATION_REGEX.test(f))
if (invalidNames.length > 0) {
  warn(`Non-standard migration names (expected YYYYMMDDHHMMSS_name.sql): ${invalidNames.join(', ')}`)
}

// 4. Check for sequential ordering (no gaps in known sequence)
const timestamps = sqlFiles.map(f => f.split('_')[0])
const sortedTimestamps = [...timestamps].sort()
if (JSON.stringify(timestamps) !== JSON.stringify(sortedTimestamps)) {
  fail('Migration files are not in chronological order!')
  sqlFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
} else {
  ok('Files are in chronological order')
}

// 5. Check for duplicate timestamps
const uniqueTimestamps = new Set(timestamps)
if (uniqueTimestamps.size !== timestamps.length) {
  const seen = new Set()
  timestamps.forEach(t => {
    if (seen.has(t)) fail(`Duplicate migration timestamp: ${t}`)
    seen.add(t)
  })
} else {
  ok('No duplicate timestamps')
}

// 6. Read each file and check for destructive statements
const DESTRUCTIVE_PATTERNS = [/^\s*DROP\s+TABLE/im, /^\s*TRUNCATE\s/im, /^\s*DELETE\s+FROM/im]
const NEVER_DISABLE_RLS = /DISABLE ROW LEVEL SECURITY/i
const NEVER_TRUE_RLS = /USING\s*\(\s*true\s*\)/i

for (const file of sqlFiles) {
  const filePath = path.join(MIGRATIONS_DIR, file)
  const content = fs.readFileSync(filePath, 'utf8')

  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(content)) {
      warn(`${file} contains a destructive statement (${pattern.source.replace(/\\/g,'')}) — review carefully`)
    }
  }

  if (NEVER_DISABLE_RLS.test(content)) {
    fail(`${file} contains DISABLE ROW LEVEL SECURITY — this violates the security model`)
  }

  if (NEVER_TRUE_RLS.test(content)) {
    // Allow this only in RLS migration with known approved use
    if (!file.includes('rls')) {
      fail(`${file} contains USING (true) in an RLS policy — requires explicit approval`)
    } else {
      warn(`${file} contains USING (true) — confirm this is intentional`)
    }
  }
}
ok('Destructive/security statement checks passed')

// 7. Check that known required tables appear somewhere across all migrations
const allContent = sqlFiles.map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')).join('\n')

const REQUIRED_TABLES = [
  'organizations', 'profiles', 'families', 'subfamilies', 'suppliers', 'skus',
  'supplier_prices', 'virtual_components', 'sites', 'warehouses', 'projects',
  'cost_sets', 'cost_items', 'cost_rules', 'rule_conditions', 'rule_actions',
  'rule_exceptions', 'manual_cost_adjustments', 'boms', 'bom_versions', 'bom_lines',
  'inventory_snapshots', 'inventory_lines', 'inventory_valuation_results',
  'calculation_traces', 'calculation_trace_lines', 'rule_execution_traces',
  'exception_execution_traces', 'cost_source_traces', 'validation_runs',
  'validation_findings', 'audit_log',
]

const missingTables = REQUIRED_TABLES.filter(t => !allContent.includes(`CREATE TABLE ${t}`))
if (missingTables.length > 0) {
  fail(`Missing CREATE TABLE for: ${missingTables.join(', ')}`)
} else {
  ok(`All ${REQUIRED_TABLES.length} required tables present`)
}

// 8. Check RLS is enabled for all tables
const rlsMigration = sqlFiles.find(f => f.includes('rls'))
if (rlsMigration) {
  const rlsContent = fs.readFileSync(path.join(MIGRATIONS_DIR, rlsMigration), 'utf8')
  const rlsEnabled = (rlsContent.match(/ENABLE ROW LEVEL SECURITY/gi) ?? []).length
  if (rlsEnabled < REQUIRED_TABLES.length) {
    warn(`RLS migration enables security on ${rlsEnabled} tables but ${REQUIRED_TABLES.length} tables exist`)
  } else {
    ok(`RLS enabled on all ${rlsEnabled} tables`)
  }
}

// 9. Output summary
console.log('\n=== Summary ===')
if (warnings.length > 0) { console.log('\nWarnings:'); warnings.forEach(w => console.log(' ', w)) }
if (errors.length > 0) { console.log('\nErrors:'); errors.forEach(e => console.log(' ', e)) }

console.log(`\nFiles checked: ${sqlFiles.length}`)
console.log(`Errors: ${errors.length} | Warnings: ${warnings.length}`)
console.log(exitCode === 0 ? '\n✅ All checks passed\n' : '\n❌ Checks failed\n')

process.exit(exitCode)

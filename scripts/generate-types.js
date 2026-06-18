#!/usr/bin/env node
// Regenerate Supabase TypeScript types from the live DB schema.
// Requires: supabase CLI installed, project linked, and active session.
// Output: backend/types/database.generated.ts
// Usage: node scripts/generate-types.js
//   or:  npm run generate-types

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '..', 'backend', 'types', 'database.generated.ts')

// Try to detect project ref from .env.local
let PROJECT_REF = process.env.SUPABASE_PROJECT_REF
if (!PROJECT_REF) {
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
    const match = content.match(/NEXT_PUBLIC_SUPABASE_URL=https:\/\/([^.]+)\.supabase\.co/)
    if (match) PROJECT_REF = match[1]
  } catch {}
}

if (!PROJECT_REF) {
  console.error('❌ Cannot determine Supabase project ref.')
  console.error('   Set SUPABASE_PROJECT_REF env var, or ensure NEXT_PUBLIC_SUPABASE_URL is in .env.local')
  process.exit(1)
}

console.log(`─── Generating types for project ${PROJECT_REF} ────────────────────`)

try {
  // Check supabase CLI is available
  execSync('supabase --version', { encoding: 'utf8' })
} catch {
  console.error('❌ supabase CLI not found. Install it: npm install -g supabase')
  process.exit(1)
}

try {
  console.log('  Running: supabase gen types typescript ...')
  const types = execSync(
    `supabase gen types typescript --project-id "${PROJECT_REF}" --schema public`,
    { encoding: 'utf8', timeout: 60000 }
  )

  // Wrap with header
  const header = `// AUTO-GENERATED — do not edit manually.\n// Run: npm run generate-types\n// Generated: ${new Date().toISOString()}\n\n`
  fs.writeFileSync(OUT, header + types, 'utf8')

  console.log(`  ✓ Types written to ${path.relative(process.cwd(), OUT)}`)
  console.log('\n✅ Type generation complete.')
  console.log('   Run: npm run typecheck  — to verify the generated types compile.')
} catch (e) {
  console.error('❌ Type generation failed:')
  console.error(e.stdout || e.message)
  process.exit(1)
}

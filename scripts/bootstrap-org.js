#!/usr/bin/env node
/**
 * Organization bootstrap script.
 * Creates the first (or additional) organization row in Supabase.
 * Also optionally creates the first admin profile for an existing auth user.
 *
 * Usage:
 *   ORG_NAME="Noris Medical GmbH" ORG_SLUG="noris-medical" ORG_CURRENCY="EUR" node scripts/bootstrap-org.js
 *
 * Optional — also create first admin profile:
 *   USER_EMAIL="admin@norismedical.com" node scripts/bootstrap-org.js
 *
 * Required env vars (loaded from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * What this script does:
 *   1. Creates an organization row via service role (bypasses RLS)
 *   2. If USER_EMAIL is set, looks up the auth.users row and creates a profiles row with role=admin
 *   3. Prints the org UUID — copy this into DEFAULT_ORGANIZATION_ID in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

// Load .env.local
const envPath = join(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const [k, ...rest] = line.split('=')
    if (k && !k.startsWith('#') && rest.length) {
      process.env[k.trim()] ??= rest.join('=').trim().replace(/^['"]|['"]$/g, '')
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  console.error('   Run: npm run check-env first.')
  process.exit(1)
}

const orgName     = process.env.ORG_NAME     || 'Noris Medical GmbH'
const orgSlug     = process.env.ORG_SLUG     || 'noris-medical'
const orgCurrency = process.env.ORG_CURRENCY || 'EUR'
const userEmail   = process.env.USER_EMAIL   || null

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function main() {
  console.log('\n── Bootstrap Organization ─────────────────────────────────────────\n')

  // ─── 1. Create organization ─────────────────────────────────────────────────
  const orgId = randomUUID()
  console.log(`Creating organization...`)
  console.log(`  Name:     ${orgName}`)
  console.log(`  Slug:     ${orgSlug}`)
  console.log(`  Currency: ${orgCurrency}`)
  console.log(`  UUID:     ${orgId}`)

  const { error: orgError } = await client
    .from('organizations')
    .insert({
      id: orgId,
      name: orgName,
      slug: orgSlug,
      default_currency: orgCurrency,
    })

  if (orgError) {
    if (orgError.code === '23505') {
      throw new Error(`Organization with slug '${orgSlug}' already exists. Change ORG_SLUG to a unique value or query the existing org UUID.`)
    }
    throw new Error(`Failed to create organization: ${orgError.message}`)
  }

  console.log('\n✅ Organization created successfully.')
  console.log('\n   Add this to your .env.local:')
  console.log(`   DEFAULT_ORGANIZATION_ID=${orgId}`)

  // ─── 2. Create first admin profile (optional) ────────────────────────────────
  if (userEmail) {
    console.log(`\nLooking up auth user: ${userEmail}...`)

    const { data: users, error: listError } = await client.auth.admin.listUsers()
    if (listError) {
      throw new Error(`Failed to list auth users: ${listError.message}\n   Ensure SUPABASE_SERVICE_ROLE_KEY has admin access.`)
    }

    const authUser = users?.users?.find(u => u.email === userEmail)
    if (!authUser) {
      throw new Error(`No auth user found with email: ${userEmail}\n   Have the user sign up first, then re-run with USER_EMAIL set.`)
    }

    console.log(`Found auth user: ${authUser.id}`)

    const { error: profileError } = await client
      .from('profiles')
      .insert({
        id: authUser.id,
        organization_id: orgId,
        full_name: authUser.user_metadata?.full_name ?? userEmail.split('@')[0],
        email: userEmail,
        role: 'admin',
        is_active: true,
      })

    if (profileError) {
      if (profileError.code === '23505') {
        console.warn(`⚠️  Profile already exists for ${userEmail}. Skipping.`)
      } else {
        throw new Error(`Failed to create profile: ${profileError.message}`)
      }
    } else {
      console.log(`✅ Admin profile created for ${userEmail}`)
    }
  }

  console.log('\n── Next Steps ─────────────────────────────────────────────────────\n')
  console.log(`1. Add to .env.local:`)
  console.log(`     DEFAULT_ORGANIZATION_ID=${orgId}`)
  console.log(`2. Run seed data:`)
  console.log(`     ORG_ID=${orgId} USER_ID=<your-profile-uuid> npm run apply-seed`)
  if (!userEmail) {
    console.log(`3. Create admin profile:`)
    console.log(`     USER_EMAIL=admin@norismedical.com node scripts/bootstrap-org.js`)
    console.log(`   (or re-run this script with USER_EMAIL set)`)
  }
  console.log('')
}

main().catch(err => {
  console.error('\n❌', err.message)
  process.exitCode = 1
})

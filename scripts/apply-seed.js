#!/usr/bin/env node
/**
 * Seed script — inserts demo data via Supabase JS (service role).
 * No psql or local PostgreSQL required.
 *
 * Usage:
 *   ORG_ID=<uuid> USER_ID=<uuid> npm run apply-seed
 *
 * Required env (loaded from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ORG_ID   — UUID of the organization row (from npm run bootstrap-org)
 *   USER_ID  — UUID of the admin profile row (from Supabase Auth > Users)
 *
 * Idempotent: safe to run multiple times. Uses upsert with ignoreDuplicates.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// ─── Load .env.local ────────────────────────────────────────────────────────
const envPath = join(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const [k, ...rest] = line.split('=')
    if (k && !k.startsWith('#') && rest.length)
      process.env[k.trim()] ??= rest.join('=').trim().replace(/^['"]|['"]$/g, '')
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const ORG_ID       = process.env.ORG_ID
const USER_ID      = process.env.USER_ID
const UUID_RE      = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  console.error('   Run npm run check-env to diagnose.')
  process.exitCode = 1; process.exit()
}
if (!ORG_ID || !USER_ID) {
  console.error('❌ ORG_ID and USER_ID are required.')
  console.error('   Usage: ORG_ID=<uuid> USER_ID=<uuid> npm run apply-seed')
  process.exitCode = 1; process.exit()
}
if (!UUID_RE.test(ORG_ID))  { console.error(`❌ ORG_ID is not a valid UUID: ${ORG_ID}`);  process.exitCode = 1; process.exit() }
if (!UUID_RE.test(USER_ID)) { console.error(`❌ USER_ID is not a valid UUID: ${USER_ID}`); process.exitCode = 1; process.exit() }

const client = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Deterministic demo UUIDs (all valid hex) ──────────────────────────────
// Each entity type gets a unique first octet so rows are easy to identify.
const FAM = (n) => `fa000000-0000-0000-0000-${String(n).padStart(12, '0')}` // families
const SUB = (n) => `5b000000-0000-0000-0000-${String(n).padStart(12, '0')}` // subfamilies
const SUP = (n) => `5c000000-0000-0000-0000-${String(n).padStart(12, '0')}` // suppliers
const SKU = (n) => `5d000000-0000-0000-0000-${String(n).padStart(12, '0')}` // skus
const SPR = (n) => `5e000000-0000-0000-0000-${String(n).padStart(12, '0')}` // supplier_prices
const BOM = (n) => `b0000000-0000-0000-0000-${String(n).padStart(12, '0')}` // boms
const BMV = (n) => `b1000000-0000-0000-0000-${String(n).padStart(12, '0')}` // bom_versions
const BLN = (n) => `b2000000-0000-0000-0000-${String(n).padStart(12, '0')}` // bom_lines
const SIT = (n) => `5f000000-0000-0000-0000-${String(n).padStart(12, '0')}` // sites
const WHS = (n) => `aa000000-0000-0000-0000-${String(n).padStart(12, '0')}` // warehouses
const CST = (n) => `c5000000-0000-0000-0000-${String(n).padStart(12, '0')}` // cost_sets
const CIT = (n) => `c1000000-0000-0000-0000-${String(n).padStart(12, '0')}` // cost_items
const RUL = (n) => `c2000000-0000-0000-0000-${String(n).padStart(12, '0')}` // cost_rules
const RCD = (n) => `c3000000-0000-0000-0000-${String(n).padStart(12, '0')}` // rule_conditions
const RAC = (n) => `c4000000-0000-0000-0000-${String(n).padStart(12, '0')}` // rule_actions

const ORG = ORG_ID
const USR = USER_ID
const NOW = new Date().toISOString()

// ─── Upsert helper ─────────────────────────────────────────────────────────
async function upsert(table, rows, label) {
  const { error } = await client
    .from(table)
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error(`[${label}] ${error.message}`)
  console.log(`  ✅ ${label.padEnd(20)} ${rows.length} row${rows.length !== 1 ? 's' : ''}`)
}

// ─── Seed ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n── Seeding Demo Data ──────────────────────────────────────────────────\n')
  console.log(`  ORG_ID:  ${ORG}`)
  console.log(`  USER_ID: ${USR}\n`)

  // ── Pre-flight: ensure profile row exists (created_by FK requires it)
  const { data: existingProfile } = await client
    .from('profiles')
    .select('id')
    .eq('id', USR)
    .single()

  if (!existingProfile) {
    // Look up the auth user to get their email
    const { data: authData } = await client.auth.admin.getUserById(USR)
    const email = authData?.user?.email ?? 'admin@example.com'
    const fullName = authData?.user?.user_metadata?.full_name ?? email.split('@')[0]

    console.log(`  Profile not found for USER_ID — creating admin profile...`)
    const { error: profileErr } = await client.from('profiles').insert({
      id: USR,
      organization_id: ORG,
      full_name: fullName,
      email,
      role: 'admin',
      is_active: true,
    })
    if (profileErr) throw new Error(`[profile] ${profileErr.message}`)
    console.log(`  ✅ ${'profile'.padEnd(20)} created (${email}, role=admin)\n`)
  } else {
    console.log(`  ✅ ${'profile'.padEnd(20)} already exists\n`)
  }

  // ── Families
  await upsert('families', [
    { id: FAM(1), organization_id: ORG, code: 'WIN', name: 'Windows',  created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: FAM(2), organization_id: ORG, code: 'DOR', name: 'Doors',    created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: FAM(3), organization_id: ORG, code: 'PRF', name: 'Profiles', created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: FAM(4), organization_id: ORG, code: 'GLS', name: 'Glass',    created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'families')

  // ── Subfamilies
  await upsert('subfamilies', [
    { id: SUB(1), organization_id: ORG, family_id: FAM(3), code: 'PVC', name: 'PVC Profiles',      created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SUB(2), organization_id: ORG, family_id: FAM(3), code: 'ALU', name: 'Aluminum Profiles', created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SUB(3), organization_id: ORG, family_id: FAM(1), code: 'DBL', name: 'Double Glazed',     created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SUB(4), organization_id: ORG, family_id: FAM(1), code: 'TRP', name: 'Triple Glazed',     created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SUB(5), organization_id: ORG, family_id: FAM(4), code: 'CLR', name: 'Clear Glass',       created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SUB(6), organization_id: ORG, family_id: FAM(4), code: 'LAM', name: 'Laminated Glass',   created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'subfamilies')

  // ── Suppliers
  await upsert('suppliers', [
    { id: SUP(1), organization_id: ORG, code: 'REHAU-DE',  name: 'REHAU GmbH',             country: 'DE', status: 'active', created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SUP(2), organization_id: ORG, code: 'SAINT-FR',  name: 'Saint-Gobain Glass',     country: 'FR', status: 'active', created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SUP(3), organization_id: ORG, code: 'TREMCO-NL', name: 'Tremco CPG Netherlands', country: 'NL', status: 'active', created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SUP(4), organization_id: ORG, code: 'EDGETECH',  name: 'Edgetech Europe GmbH',   country: 'DE', status: 'active', created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'suppliers')

  // ── SKUs
  await upsert('skus', [
    // Purchased parts — raw materials
    { id: SKU(1),  organization_id: ORG, part_number: 'PRF-PVC-080',         name: 'PVC Profile 80mm White',                    item_type: 'purchased_part', make_buy: 'buy',  unit_of_measure: 'lm',  status: 'active', family_id: FAM(3), subfamily_id: SUB(1), default_supplier_id: SUP(1), lead_time_days: 7,  created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SKU(2),  organization_id: ORG, part_number: 'PRF-PVC-060',         name: 'PVC Profile 60mm White',                    item_type: 'purchased_part', make_buy: 'buy',  unit_of_measure: 'lm',  status: 'active', family_id: FAM(3), subfamily_id: SUB(1), default_supplier_id: SUP(1), lead_time_days: 7,  created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SKU(3),  organization_id: ORG, part_number: 'GLS-DBL-4-16-4',      name: 'Double Glazed Unit 4-16-4 Clear',           item_type: 'purchased_part', make_buy: 'buy',  unit_of_measure: 'm2',  status: 'active', family_id: FAM(4), subfamily_id: SUB(5), default_supplier_id: SUP(2), lead_time_days: 10, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SKU(4),  organization_id: ORG, part_number: 'GLS-TRP-4-12-4-12-4', name: 'Triple Glazed Unit 4-12-4-12-4 Low-E',     item_type: 'purchased_part', make_buy: 'buy',  unit_of_measure: 'm2',  status: 'active', family_id: FAM(4), subfamily_id: SUB(6), default_supplier_id: SUP(2), lead_time_days: 14, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SKU(5),  organization_id: ORG, part_number: 'SEL-EPDM-MAIN',       name: 'EPDM Main Seal per meter',                  item_type: 'purchased_part', make_buy: 'buy',  unit_of_measure: 'lm',  status: 'active', family_id: null,   subfamily_id: null,   default_supplier_id: SUP(3), lead_time_days: 5,  created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SKU(6),  organization_id: ORG, part_number: 'SEL-EPDM-GLAZ',       name: 'EPDM Glazing Seal per meter',               item_type: 'purchased_part', make_buy: 'buy',  unit_of_measure: 'lm',  status: 'active', family_id: null,   subfamily_id: null,   default_supplier_id: SUP(3), lead_time_days: 5,  created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SKU(7),  organization_id: ORG, part_number: 'SPC-WARM-EDGE',        name: 'Warm Edge Spacer per meter',                item_type: 'purchased_part', make_buy: 'buy',  unit_of_measure: 'lm',  status: 'active', family_id: null,   subfamily_id: null,   default_supplier_id: SUP(4), lead_time_days: 7,  created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    // Sub-assembly
    { id: SKU(10), organization_id: ORG, part_number: 'FRM-WND-080-DBL',      name: 'Window Frame 80mm PVC Double Glaze',        item_type: 'sub_assembly',   make_buy: 'make', unit_of_measure: 'pcs', status: 'active', family_id: FAM(3), subfamily_id: SUB(1), default_supplier_id: null,   lead_time_days: 2,  created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    // Finished goods
    { id: SKU(20), organization_id: ORG, part_number: 'WND-CASEMENT-080-DBL', name: 'Casement Window 80mm PVC 1200x1000 Double', item_type: 'finished_good',  make_buy: 'make', unit_of_measure: 'pcs', status: 'active', family_id: FAM(1), subfamily_id: SUB(3), default_supplier_id: null,   lead_time_days: 3,  created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SKU(21), organization_id: ORG, part_number: 'WND-CASEMENT-080-TRP', name: 'Casement Window 80mm PVC 1200x1000 Triple', item_type: 'finished_good',  make_buy: 'make', unit_of_measure: 'pcs', status: 'active', family_id: FAM(1), subfamily_id: SUB(4), default_supplier_id: null,   lead_time_days: 3,  created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'skus')

  // ── Supplier Prices
  await upsert('supplier_prices', [
    { id: SPR(1), organization_id: ORG, sku_id: SKU(1), supplier_id: SUP(1), unit_price: 3.20,  currency: 'EUR', effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SPR(2), organization_id: ORG, sku_id: SKU(2), supplier_id: SUP(1), unit_price: 2.60,  currency: 'EUR', effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SPR(3), organization_id: ORG, sku_id: SKU(3), supplier_id: SUP(2), unit_price: 28.50, currency: 'EUR', effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SPR(4), organization_id: ORG, sku_id: SKU(4), supplier_id: SUP(2), unit_price: 42.00, currency: 'EUR', effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SPR(5), organization_id: ORG, sku_id: SKU(5), supplier_id: SUP(3), unit_price: 0.45,  currency: 'EUR', effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SPR(6), organization_id: ORG, sku_id: SKU(6), supplier_id: SUP(3), unit_price: 0.38,  currency: 'EUR', effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SPR(7), organization_id: ORG, sku_id: SKU(7), supplier_id: SUP(4), unit_price: 1.20,  currency: 'EUR', effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'supplier_prices')

  // ── BOMs
  await upsert('boms', [
    { id: BOM(1), organization_id: ORG, sku_id: SKU(10), created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: BOM(2), organization_id: ORG, sku_id: SKU(20), created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: BOM(3), organization_id: ORG, sku_id: SKU(21), created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'boms')

  // ── BOM Versions (approved + locked)
  await upsert('bom_versions', [
    { id: BMV(1), organization_id: ORG, bom_id: BOM(1), version_number: 1, status: 'approved', is_locked: true, effective_from: '2024-01-01', approved_by: USR, approved_at: NOW, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: BMV(2), organization_id: ORG, bom_id: BOM(2), version_number: 1, status: 'approved', is_locked: true, effective_from: '2024-01-01', approved_by: USR, approved_at: NOW, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: BMV(3), organization_id: ORG, bom_id: BOM(3), version_number: 1, status: 'approved', is_locked: true, effective_from: '2024-01-01', approved_by: USR, approved_at: NOW, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'bom_versions')

  // ── BOM Lines
  await upsert('bom_lines', [
    // Frame sub-assembly: 4.4m PVC-80 + 0.8m PVC-60 rebate + 3.2m main seal + 3.2m glaze seal
    { id: BLN(101), organization_id: ORG, bom_version_id: BMV(1), line_type: 'sku', sku_id: SKU(1),  quantity: 4.4,  unit_of_measure: 'lm',  position: 1, parent_line_id: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: BLN(102), organization_id: ORG, bom_version_id: BMV(1), line_type: 'sku', sku_id: SKU(2),  quantity: 0.8,  unit_of_measure: 'lm',  position: 2, parent_line_id: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: BLN(103), organization_id: ORG, bom_version_id: BMV(1), line_type: 'sku', sku_id: SKU(5),  quantity: 3.2,  unit_of_measure: 'lm',  position: 3, parent_line_id: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: BLN(104), organization_id: ORG, bom_version_id: BMV(1), line_type: 'sku', sku_id: SKU(6),  quantity: 3.2,  unit_of_measure: 'lm',  position: 4, parent_line_id: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    // Double-glaze FG: 1x frame + 1.08m² double glaze + 3.4m spacer
    { id: BLN(201), organization_id: ORG, bom_version_id: BMV(2), line_type: 'sku', sku_id: SKU(10), quantity: 1,    unit_of_measure: 'pcs', position: 1, parent_line_id: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: BLN(202), organization_id: ORG, bom_version_id: BMV(2), line_type: 'sku', sku_id: SKU(3),  quantity: 1.08, unit_of_measure: 'm2',  position: 2, parent_line_id: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: BLN(203), organization_id: ORG, bom_version_id: BMV(2), line_type: 'sku', sku_id: SKU(7),  quantity: 3.4,  unit_of_measure: 'lm',  position: 3, parent_line_id: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    // Triple-glaze FG: 1x frame + 1.08m² triple glaze + 6.8m spacer (two panes)
    { id: BLN(301), organization_id: ORG, bom_version_id: BMV(3), line_type: 'sku', sku_id: SKU(10), quantity: 1,    unit_of_measure: 'pcs', position: 1, parent_line_id: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: BLN(302), organization_id: ORG, bom_version_id: BMV(3), line_type: 'sku', sku_id: SKU(4),  quantity: 1.08, unit_of_measure: 'm2',  position: 2, parent_line_id: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: BLN(303), organization_id: ORG, bom_version_id: BMV(3), line_type: 'sku', sku_id: SKU(7),  quantity: 6.8,  unit_of_measure: 'lm',  position: 3, parent_line_id: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'bom_lines')

  // ── Sites
  await upsert('sites', [
    { id: SIT(1), organization_id: ORG, code: 'BERLIN', name: 'Berlin Plant', country: 'DE', is_active: true, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: SIT(2), organization_id: ORG, code: 'MUNICH', name: 'Munich Plant', country: 'DE', is_active: true, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'sites')

  // ── Warehouses
  await upsert('warehouses', [
    { id: WHS(1), organization_id: ORG, site_id: SIT(1), code: 'BER-WH1', name: 'Berlin Raw Materials',  warehouse_type: 'raw_materials',    is_active: true, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: WHS(2), organization_id: ORG, site_id: SIT(1), code: 'BER-WH2', name: 'Berlin Finished Goods', warehouse_type: 'finished_goods',   is_active: true, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: WHS(3), organization_id: ORG, site_id: SIT(2), code: 'MUN-WH1', name: 'Munich Production',     warehouse_type: 'work_in_progress', is_active: true, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'warehouses')

  // ── Cost Sets
  await upsert('cost_sets', [
    { id: CST(1), organization_id: ORG, code: 'BERLIN-2024', name: 'Berlin 2024 Standard Cost', cost_set_type: 'standard', base_currency: 'EUR', effective_from: '2024-01-01', effective_to: '2024-12-31', status: 'active', is_default: true,  created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: CST(2), organization_id: ORG, code: 'MUNICH-2024', name: 'Munich 2024 Standard Cost', cost_set_type: 'standard', base_currency: 'EUR', effective_from: '2024-01-01', effective_to: '2024-12-31', status: 'active', is_default: false, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: CST(3), organization_id: ORG, code: 'PROJECT-X',   name: 'Project X Premium Cost',    cost_set_type: 'quote',    base_currency: 'EUR', effective_from: '2024-06-01', effective_to: null,         status: 'active', is_default: false, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'cost_sets')

  // ── Cost Items
  await upsert('cost_items', [
    // Berlin 2024: global overhead 12%
    { id: CIT(1),  organization_id: ORG, cost_set_id: CST(1), item_type: 'overhead_pct',   scope_type: 'global', scope_id: null,   value: 12.0,  value_unit: 'percentage',      currency: null,  applies_to: 'material_subtotal', effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    // Berlin 2024: Windows family overhead +8%
    { id: CIT(2),  organization_id: ORG, cost_set_id: CST(1), item_type: 'overhead_pct',   scope_type: 'family', scope_id: FAM(1), value: 8.0,   value_unit: 'percentage',      currency: null,  applies_to: 'material_subtotal', effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    // Berlin 2024: SKU-level material prices (volume rates, lower than supplier price)
    { id: CIT(3),  organization_id: ORG, cost_set_id: CST(1), item_type: 'material_price', scope_type: 'sku',    scope_id: SKU(1), value: 3.10,  value_unit: 'currency_amount', currency: 'EUR', applies_to: 'per_unit',          effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: CIT(4),  organization_id: ORG, cost_set_id: CST(1), item_type: 'material_price', scope_type: 'sku',    scope_id: SKU(3), value: 26.80, value_unit: 'currency_amount', currency: 'EUR', applies_to: 'per_unit',          effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: CIT(5),  organization_id: ORG, cost_set_id: CST(1), item_type: 'material_price', scope_type: 'sku',    scope_id: SKU(4), value: 39.50, value_unit: 'currency_amount', currency: 'EUR', applies_to: 'per_unit',          effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    // Munich 2024: global overhead 14%
    { id: CIT(11), organization_id: ORG, cost_set_id: CST(2), item_type: 'overhead_pct',   scope_type: 'global', scope_id: null,   value: 14.0,  value_unit: 'percentage',      currency: null,  applies_to: 'material_subtotal', effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: CIT(12), organization_id: ORG, cost_set_id: CST(2), item_type: 'material_price', scope_type: 'sku',    scope_id: SKU(1), value: 3.25,  value_unit: 'currency_amount', currency: 'EUR', applies_to: 'per_unit',          effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: CIT(13), organization_id: ORG, cost_set_id: CST(2), item_type: 'material_price', scope_type: 'sku',    scope_id: SKU(3), value: 27.50, value_unit: 'currency_amount', currency: 'EUR', applies_to: 'per_unit',          effective_from: '2024-01-01', effective_to: null, created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'cost_items')

  // ── Cost Rules
  await upsert('cost_rules', [
    { id: RUL(1), organization_id: ORG, name: 'Window Family Premium',    description: 'Add 5% mark-up for all Window family SKUs to reflect final assembly complexity',    priority: 10, is_active: true,  effective_from: '2024-01-01', created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: RUL(2), organization_id: ORG, name: 'Triple Glaze Cap',         description: 'Cap triple glazing unit cost at 50 EUR/m2 per negotiated procurement agreement',     priority: 20, is_active: true,  effective_from: '2024-01-01', created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
    { id: RUL(3), organization_id: ORG, name: 'Discontinued SKU Exclude', description: 'Exclude discontinued SKUs from rollup — inactive example rule for demo purposes',   priority: 99, is_active: false, effective_from: '2024-01-01', created_by: USR, updated_by: USR, created_at: NOW, updated_at: NOW },
  ], 'cost_rules')

  // ── Rule Conditions
  await upsert('rule_conditions', [
    { id: RCD(1), organization_id: ORG, cost_rule_id: RUL(1), condition_field: 'sku.family_id',    condition_operator: 'equals', condition_value: FAM(1), logical_group: 0, created_by: USR, created_at: NOW },
    { id: RCD(2), organization_id: ORG, cost_rule_id: RUL(2), condition_field: 'sku.item_type',    condition_operator: 'equals', condition_value: 'purchased_part', logical_group: 0, created_by: USR, created_at: NOW },
    { id: RCD(3), organization_id: ORG, cost_rule_id: RUL(2), condition_field: 'sku.subfamily_id', condition_operator: 'equals', condition_value: SUB(6), logical_group: 0, created_by: USR, created_at: NOW },
  ], 'rule_conditions')

  // ── Rule Actions
  await upsert('rule_actions', [
    { id: RAC(1), organization_id: ORG, cost_rule_id: RUL(1), action_type: 'add_percentage', action_value: 5.0,  action_sequence: 1, created_by: USR, created_at: NOW },
    { id: RAC(2), organization_id: ORG, cost_rule_id: RUL(2), action_type: 'cap_at_value',   action_value: 50.0, action_sequence: 1, created_by: USR, created_at: NOW },
  ], 'rule_actions')

  console.log('\n✅ Seed complete.\n')
  console.log('── Demo scenarios ready ────────────────────────────────────────────\n')
  console.log('  1. Calculate WND-CASEMENT-080-DBL under Berlin 2024 cost set')
  console.log('     → Window premium +5% applies; overhead 12%+8% stacks')
  console.log('  2. Calculate WND-CASEMENT-080-TRP')
  console.log('     → Triple-glaze cap rule fires (capped at 50 EUR/m2)')
  console.log('  3. Compare Berlin 2024 vs Munich 2024 cost sets for same product')
  console.log('  4. Run validation — expect 0 blocking findings with this seed')
  console.log('  5. Create inventory snapshot at Berlin WH1 (BER-WH1)')
  console.log('')
}

main().catch(err => {
  console.error('\n❌', err.message)
  process.exitCode = 1
})

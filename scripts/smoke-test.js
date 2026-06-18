#!/usr/bin/env node
// Smoke test — verifies the running app responds correctly at each key endpoint.
// Requires the app to be running at BASE_URL (default: http://localhost:3000).
// Usage: node scripts/smoke-test.js [--base-url http://your-app.com]
//   or:  npm run smoke-test

const http  = require('http')
const https = require('https')

const args = process.argv.slice(2)
const baseIdx = args.indexOf('--base-url')
const BASE_URL = (baseIdx !== -1 ? args[baseIdx + 1] : null)
  ?? process.env.SMOKE_TEST_BASE_URL
  ?? 'http://localhost:3000'

const TIMEOUT = 10000

let passed = 0
let failed = 0

async function get(path) {
  const url = new URL(path, BASE_URL)
  const lib = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = lib.get(url.toString(), { timeout: TIMEOUT }, res => {
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function check(label, path, opts = {}) {
  const { expectStatus = 200, expectBodyContains, expectJson = true } = opts
  try {
    const { status, body } = await get(path)

    if (status !== expectStatus) {
      console.log(`  ✗ [${status}] ${label}`)
      console.log(`      Expected status ${expectStatus}, got ${status}`)
      failed++; return
    }

    if (expectJson) {
      try { JSON.parse(body) } catch {
        console.log(`  ✗ [${status}] ${label} — response is not valid JSON`)
        failed++; return
      }
    }

    if (expectBodyContains && !body.includes(expectBodyContains)) {
      console.log(`  ✗ [${status}] ${label} — body missing "${expectBodyContains}"`)
      failed++; return
    }

    console.log(`  ✓ [${status}] ${label}`)
    passed++
  } catch (e) {
    console.log(`  ✗ [ERR] ${label} — ${e.message}`)
    failed++
  }
}

;(async () => {
  console.log(`\n─── Smoke Test: ${BASE_URL} ──────────────────────────────────────`)

  // Pages (HTML)
  console.log('\n  Pages:')
  await check('Dashboard /', '/',                { expectJson: false, expectBodyContains: 'BOM' })
  await check('SKUs /skus', '/skus',             { expectJson: false })
  await check('BOMs /boms', '/boms',             { expectJson: false })
  await check('Cost Sets', '/cost-sets',         { expectJson: false })
  await check('Validation', '/validation',       { expectJson: false })
  await check('Inventory',  '/inventory',        { expectJson: false })
  await check('Traces',     '/traces',           { expectJson: false })
  await check('Audit',      '/audit',            { expectJson: false })

  // API Routes (JSON)
  console.log('\n  API Routes:')
  await check('GET /api/skus',        '/api/skus',        { expectJson: true })
  await check('GET /api/boms',        '/api/boms',        { expectJson: true })
  await check('GET /api/families',    '/api/families',    { expectJson: true })
  await check('GET /api/cost-sets',   '/api/cost-sets',   { expectJson: true })
  await check('GET /api/rules',       '/api/rules',       { expectJson: true })
  await check('GET /api/suppliers',   '/api/suppliers',   { expectJson: true })
  await check('GET /api/audit (401)',  '/api/audit',       { expectStatus: 401, expectJson: true })
  await check('Trace (401)',           '/api/traces/nonexistent-id', { expectStatus: 401, expectJson: true })

  // Summary
  const total = passed + failed
  console.log(`\n─── Results: ${passed}/${total} passed ──────────────────────────────────`)
  if (failed === 0) {
    console.log('✅ All smoke tests passed.\n')
  } else {
    console.log(`❌ ${failed} smoke test(s) FAILED.\n`)
    process.exit(1)
  }
})()

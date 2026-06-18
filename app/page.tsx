'use client'

import { useState, useEffect } from 'react'

const D = {
  red:       '#C62839',
  dark:      '#222222',
  secondary: '#666666',
  bg:        '#F8F9FA',
  card:      '#FFFFFF',
  border:    '#E5E7EB',
}

interface KPIs {
  skuCount:      number | null
  bomCount:      number | null
  costSetCount:  number | null
  snapshotCount: number | null
  lastImport:    string | null
}

const MODULE_CARDS = [
  { href: '/boms',       label: 'BOM Explorer',        icon: '🔩', description: 'View and calculate BOMs. Full cost breakdown with trace.' },
  { href: '/inventory',  label: 'Inventory Valuation', icon: '📦', description: 'Create snapshots, import counts, run valuation by warehouse.' },
  { href: '/validation', label: 'Validation Center',   icon: '✅', description: '19 validation rules across BOMs, SKUs, costs and inventory.' },
  { href: '/imports',    label: 'Import Center',        icon: '📥', description: 'Import SKUs, BOMs, costs and inventory from CSV or Excel.' },
  { href: '/skus',       label: 'SKU Management',      icon: '🏷️', description: 'Create, search and manage part numbers and families.' },
  { href: '/cost-sets',  label: 'Cost Sets',            icon: '💰', description: 'Manage material costs, rates and effective-date pricing.' },
  { href: '/traces',     label: 'Trace Viewer',         icon: '🔍', description: 'Inspect any calculation. See BOM rollup, cost sources, rules.' },
  { href: '/audit',      label: 'Audit Log',            icon: '📋', description: 'Immutable audit trail — 7-year EU MDR retention.' },
]

export default function Dashboard() {
  const [kpis, setKpis] = useState<KPIs>({ skuCount: null, bomCount: null, costSetCount: null, snapshotCount: null, lastImport: null })

  useEffect(() => {
    async function loadKpis() {
      const [skuRes, bomRes, csRes, invRes, impRes] = await Promise.allSettled([
        fetch('/api/skus').then(r => r.json()),
        fetch('/api/boms').then(r => r.json()),
        fetch('/api/cost-sets').then(r => r.json()),
        fetch('/api/inventory').then(r => r.json()),
        fetch('/api/imports?limit=1').then(r => r.json()),
      ])
      setKpis({
        skuCount:      skuRes.status  === 'fulfilled' ? (skuRes.value?.data?.length ?? 0)  : null,
        bomCount:      bomRes.status  === 'fulfilled' ? (bomRes.value?.data?.length ?? 0)  : null,
        costSetCount:  csRes.status   === 'fulfilled' ? (csRes.value?.data?.length  ?? 0)  : null,
        snapshotCount: invRes.status  === 'fulfilled' ? (invRes.value?.data?.length  ?? 0) : null,
        lastImport:    impRes.status  === 'fulfilled' ? (impRes.value?.data?.[0]?.created_at ?? null) : null,
      })
    }
    loadKpis()
  }, [])

  const KPI_STATS = [
    { label: 'SKUs',       value: kpis.skuCount,      href: '/skus',      },
    { label: 'BOMs',       value: kpis.bomCount,      href: '/boms',      },
    { label: 'Cost Sets',  value: kpis.costSetCount,  href: '/cost-sets', },
    { label: 'Snapshots',  value: kpis.snapshotCount, href: '/inventory', },
  ]

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: D.dark, marginBottom: '4px' }}>
          BOM Costing Platform
        </h1>
        <p style={{ color: D.secondary, fontSize: '14px', margin: 0 }}>
          Internal cost management system — Noris Medical
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {KPI_STATS.map(stat => (
          <a key={stat.label} href={stat.href} style={{ textDecoration: 'none' }}>
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '20px', borderTop: `3px solid ${D.red}` }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: D.dark, marginBottom: '4px' }}>
                {stat.value === null ? <span style={{ color: D.border, fontSize: '20px' }}>—</span> : stat.value}
              </div>
              <div style={{ fontSize: '13px', color: D.secondary }}>{stat.label}</div>
            </div>
          </a>
        ))}
      </div>

      {kpis.lastImport && (
        <div style={{ marginBottom: '24px', fontSize: '12px', color: D.secondary }}>
          Last import: {new Date(kpis.lastImport).toLocaleString()} ·{' '}
          <a href="/imports" style={{ color: D.red }}>Import Center →</a>
        </div>
      )}

      {/* Module cards */}
      <div style={{ marginBottom: '16px', fontSize: '13px', fontWeight: 600, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Modules
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
        {MODULE_CARDS.map(card => (
          <a key={card.href} href={card.href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              background: D.card,
              border: `1px solid ${D.border}`,
              borderRadius: '8px',
              padding: '18px 20px',
              cursor: 'pointer',
              height: '100%',
              boxSizing: 'border-box',
            }}>
              <div style={{ fontSize: '22px', marginBottom: '8px' }}>{card.icon}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: D.dark, marginBottom: '6px' }}>{card.label}</div>
              <div style={{ fontSize: '13px', color: D.secondary }}>{card.description}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

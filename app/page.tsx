'use client'

import { useState, useEffect } from 'react'
import type { WorkflowStatus, PipelineStepState } from './api/workflow-status/route'

const D = {
  red:      '#C62839',
  dark:     '#222222',
  secondary:'#666666',
  bg:       '#F8F9FA',
  card:     '#FFFFFF',
  border:   '#E5E7EB',
  success:  '#16a34a',
  warning:  '#d97706',
  blue:     '#1565c0',
  teal:     '#0d9488',
  redLight: '#FEF2F2',
  successLight: '#F0FDF4',
  blueLight:    '#EFF6FF',
  warnLight:    '#FFFBEB',
}

const STEP_NUMBER_COLOR: Record<PipelineStepState['status'], string> = {
  done:           D.success,
  active:         D.red,
  action_needed:  D.warning,
  pending:        D.border,
}

const STEP_BG: Record<PipelineStepState['status'], string> = {
  done:           D.successLight,
  active:         D.redLight,
  action_needed:  D.warnLight,
  pending:        D.bg,
}

const STEP_ICON: Record<PipelineStepState['status'], string> = {
  done:           '✓',
  active:         '→',
  action_needed:  '!',
  pending:        '○',
}

const URGENCY_STYLE: Record<string, { bg: string; border: string; titleColor: string }> = {
  high:   { bg: '#FFF5F5', border: D.red,     titleColor: D.red },
  medium: { bg: '#EFF6FF', border: D.blue,    titleColor: D.blue },
  low:    { bg: D.successLight, border: D.success, titleColor: D.success },
}

function PipelineStep({ step, index, isLast }: { step: PipelineStepState; index: number; isLast: boolean }) {
  const color   = STEP_NUMBER_COLOR[step.status]
  const bg      = STEP_BG[step.status]
  const icon    = STEP_ICON[step.status]
  const isActive = step.status === 'active' || step.status === 'action_needed'

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', flex: 1 }}>
      <a
        href={step.href}
        style={{
          flex: 1,
          background: bg,
          border: `1px solid ${step.status === 'pending' ? D.border : color}`,
          borderRadius: '8px',
          padding: '14px 16px',
          textDecoration: 'none',
          display: 'block',
          transition: 'box-shadow 0.15s',
          boxShadow: isActive ? `0 0 0 2px ${color}22` : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <div style={{
            width: '22px', height: '22px', borderRadius: '50%',
            background: step.status === 'pending' ? D.border : color,
            color: '#fff', fontSize: '11px', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {step.status === 'pending' ? index + 1 : icon}
          </div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Step {index + 1}
          </span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: step.status === 'pending' ? D.secondary : D.dark, marginBottom: step.detail ? '4px' : 0 }}>
          {step.label}
        </div>
        {step.detail && (
          <div style={{ fontSize: '12px', color: D.secondary, lineHeight: 1.4 }}>{step.detail}</div>
        )}
        {step.count > 0 && !step.detail && (
          <div style={{ fontSize: '12px', color: D.secondary }}>{step.count} record{step.count !== 1 ? 's' : ''}</div>
        )}
      </a>
      {!isLast && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', color: D.border, fontSize: '18px', flexShrink: 0 }}>
          →
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [workflow, setWorkflow]   = useState<WorkflowStatus | null>(null)
  const [kpis, setKpis]           = useState<{ skus: number; boms: number; sites: number; imports: string | null } | null>(null)
  const [latestVal, setLatestVal] = useState<{ id: string; name: string | null; totalValue: number | null; currency: string; status: string; snapshotName: string | null; createdAt: string } | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      const [wfRes, skuRes, bomRes, siteRes, impRes, valRes] = await Promise.allSettled([
        fetch('/api/workflow-status').then(r => r.json()),
        fetch('/api/skus').then(r => r.json()),
        fetch('/api/boms').then(r => r.json()),
        fetch('/api/sites').then(r => r.json()),
        fetch('/api/imports?limit=1').then(r => r.json()),
        fetch('/api/valuation-reports?limit=1').then(r => r.json()),
      ])
      if (wfRes.status === 'fulfilled') setWorkflow(wfRes.value)
      setKpis({
        skus:    skuRes.status  === 'fulfilled' ? (skuRes.value?.data?.length ?? 0)  : 0,
        boms:    bomRes.status  === 'fulfilled' ? (bomRes.value?.data?.length ?? 0)  : 0,
        sites:   siteRes.status === 'fulfilled' ? (siteRes.value?.data?.length ?? 0) : 0,
        imports: impRes.status  === 'fulfilled' ? (impRes.value?.data?.[0]?.created_at ?? null) : null,
      })
      if (valRes.status === 'fulfilled') {
        const v = valRes.value?.data?.[0] ?? null
        if (v) setLatestVal({
          id:           v.id,
          name:         v.name ?? null,
          totalValue:   v.total_value ?? null,
          currency:     v.valuation_currency ?? v.base_currency ?? '?',
          status:       v.status,
          snapshotName: v.inventory_snapshots?.snapshot_name ?? null,
          createdAt:    v.created_at,
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  const steps = workflow ? [
    workflow.steps.priceList,
    workflow.steps.costBuild,
    workflow.steps.snapshot,
    workflow.steps.valuation,
  ] : []

  const rec = workflow?.recommendation ?? null

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: D.dark, marginBottom: '4px' }}>
          Inventory Costing
        </h1>
        <p style={{ color: D.secondary, fontSize: '14px', margin: 0 }}>
          Noris Medical · Internal cost management platform
        </p>
      </div>

      {/* ── Pipeline ─────────────────────────────────────────────────────────── */}
      <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '20px 24px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '14px' }}>
          Inventory Costing Pipeline
        </div>

        {loading ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ flex: 1, height: '80px', background: D.bg, borderRadius: '8px', border: `1px solid ${D.border}` }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: '0' }}>
            {steps.map((step, i) => (
              <PipelineStep key={step.label} step={step} index={i} isLast={i === steps.length - 1} />
            ))}
          </div>
        )}
      </div>

      {/* ── Recommended next action ───────────────────────────────────────────── */}
      {rec && !loading && (
        <div style={{
          background: URGENCY_STYLE[rec.urgency].bg,
          border: `1px solid ${URGENCY_STYLE[rec.urgency].border}`,
          borderRadius: '10px',
          padding: '20px 24px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: URGENCY_STYLE[rec.urgency].titleColor, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              Step {rec.stepNumber} · Recommended Next Action
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: D.dark, marginBottom: '6px' }}>
              {rec.title}
            </div>
            <div style={{ fontSize: '14px', color: D.secondary, lineHeight: 1.5 }}>
              {rec.description}
            </div>
          </div>
          <a
            href={rec.actionHref}
            style={{
              background: rec.urgency === 'high' ? D.red : rec.urgency === 'medium' ? D.blue : D.success,
              color: '#fff',
              textDecoration: 'none',
              padding: '10px 24px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {rec.actionLabel} →
          </a>
        </div>
      )}

      {/* ── Latest Inventory Value card ──────────────────────────────────────── */}
      {latestVal && !loading && (
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', padding: '18px 24px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              Latest Inventory Value
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: D.dark, fontFamily: 'monospace', marginBottom: '4px' }}>
              {latestVal.totalValue != null
                ? `${latestVal.currency} ${latestVal.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : <span style={{ color: D.secondary }}>—</span>}
            </div>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: D.secondary, flexWrap: 'wrap' }}>
              {latestVal.snapshotName && <span>Snapshot: <strong style={{ color: D.dark }}>{latestVal.snapshotName}</strong></span>}
              <span>Status: <strong style={{ color: latestVal.status === 'approved' || latestVal.status === 'locked' ? D.success : D.secondary }}>{latestVal.status}</strong></span>
              <span>Date: <strong style={{ color: D.dark }}>{new Date(latestVal.createdAt).toLocaleDateString()}</strong></span>
            </div>
          </div>
          <a
            href={`/valuation-reports/${latestVal.id}`}
            style={{ background: D.teal, color: '#fff', textDecoration: 'none', padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Open Report →
          </a>
        </div>
      )}

      {/* ── KPIs + Quick actions ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>

        {/* Data summary */}
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
            Master Data
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {[
              { label: 'SKUs',  value: kpis?.skus  ?? '—', href: '/skus'  },
              { label: 'BOMs',  value: kpis?.boms  ?? '—', href: '/boms'  },
              { label: 'Sites', value: kpis?.sites ?? '—', href: '/sites' },
            ].map(s => (
              <a key={s.label} href={s.href} style={{ textDecoration: 'none' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: D.dark }}>{s.value}</div>
                  <div style={{ fontSize: '12px', color: D.secondary }}>{s.label}</div>
                </div>
              </a>
            ))}
          </div>
          {kpis?.imports && (
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${D.border}`, fontSize: '12px', color: D.secondary }}>
              Last import: {new Date(kpis.imports).toLocaleDateString()} ·{' '}
              <a href="/imports" style={{ color: D.red }}>Import Center →</a>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
            Quick Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { label: 'Import Price List or SKUs',  href: '/imports',         color: D.red  },
              { label: 'Create Cost Build',           href: '/cost-builds',     color: D.blue },
              { label: 'Run Inventory Valuation',     href: '/inventory',       color: D.teal },
              { label: 'View Strategy Status',        href: '/strategy-status', color: D.secondary },
            ].map(a => (
              <a
                key={a.href}
                href={a.href}
                style={{
                  display: 'block', padding: '9px 14px', borderRadius: '6px',
                  border: `1px solid ${D.border}`, textDecoration: 'none',
                  fontSize: '13px', fontWeight: 500, color: a.color,
                  background: D.bg,
                }}
              >
                {a.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── Module grid ──────────────────────────────────────────────────────── */}
      <div style={{ fontSize: '11px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
        All Modules
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
        {[
          { href: '/imports',         label: 'Import Center',        icon: '📥', desc: 'Import SKUs, BOMs, price lists and inventory from CSV or Excel.' },
          { href: '/cost-builds',     label: 'Cost Builds',          icon: '⚙️', desc: 'Build frozen cost sets from country price lists and BOMs.' },
          { href: '/inventory',       label: 'Inventory Valuation',  icon: '📦', desc: 'Capture snapshots and run valuations by warehouse.' },
          { href: '/sites',           label: 'Sites',                icon: '🏭', desc: 'Manage manufacturing and storage locations.' },
          { href: '/boms',            label: 'BOM Explorer',         icon: '🔩', desc: 'View and calculate BOMs. Full cost breakdown with trace.' },
          { href: '/skus',            label: 'SKU Management',       icon: '🏷️', desc: 'Create, search and manage part numbers and families.' },
          { href: '/strategy-status', label: 'Strategy Status',      icon: '📊', desc: 'Costing strategy matrix — operational vs placeholder.' },
          { href: '/validation',      label: 'Validation Center',    icon: '✅', desc: '19 validation rules across BOMs, SKUs, costs and inventory.' },
          { href: '/audit',           label: 'Audit Log',            icon: '📋', desc: 'Immutable audit trail — 7-year EU MDR retention.' },
        ].map(card => (
          <a key={card.href} href={card.href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px',
              padding: '16px 18px', cursor: 'pointer', height: '100%', boxSizing: 'border-box',
            }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>{card.icon}</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: D.dark, marginBottom: '4px' }}>{card.label}</div>
              <div style={{ fontSize: '12px', color: D.secondary, lineHeight: 1.4 }}>{card.desc}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

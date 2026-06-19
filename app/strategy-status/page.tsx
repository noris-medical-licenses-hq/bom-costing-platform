'use client'

import { STRATEGY_STATUS_MATRIX, type StrategyStatus } from '@/backend/services/costBuild/strategies'

const D = {
  dark: '#222222', secondary: '#666666', bg: '#F8F9FA', card: '#FFFFFF',
  border: '#E5E7EB', success: '#16a34a', warning: '#d97706', error: '#dc2626',
  successLight: '#F0FDF4', warningLight: '#FFFBEB', errorLight: '#FEF2F2',
  red: '#C62839', blue: '#1565c0',
}

const STATUS_BADGE: Record<StrategyStatus, { label: string; bg: string; color: string }> = {
  fully_operational:    { label: 'Fully Operational',    bg: D.successLight, color: D.success },
  partially_operational:{ label: 'Partially Operational', bg: D.warningLight,  color: D.warning },
  placeholder:          { label: 'Placeholder',           bg: D.errorLight,    color: D.error   },
}

function StatusBadge({ status }: { status: StrategyStatus }) {
  const b = STATUS_BADGE[status]
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '12px',
      fontSize: '11px', fontWeight: 700, background: b.bg, color: b.color,
      whiteSpace: 'nowrap',
    }}>
      {b.label}
    </span>
  )
}

function Pills({ items, color }: { items: string[]; color: string }) {
  if (!items.length) return <span style={{ color: D.secondary, fontSize: '12px' }}>—</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {items.map(item => (
        <span key={item} style={{
          background: '#F1F5F9', color, fontSize: '11px', padding: '2px 6px',
          borderRadius: '4px', fontFamily: 'monospace',
        }}>
          {item}
        </span>
      ))}
    </div>
  )
}

export default function StrategyStatusPage() {
  const entries = Object.entries(STRATEGY_STATUS_MATRIX)
  const operational   = entries.filter(([, m]) => m.status === 'fully_operational')
  const partial       = entries.filter(([, m]) => m.status === 'partially_operational')
  const placeholders  = entries.filter(([, m]) => m.status === 'placeholder')

  const total       = entries.length
  const opsCount    = operational.length
  const partialCount = partial.length
  const stubCount   = placeholders.length

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: D.dark, margin: '0 0 6px' }}>
          Cost Strategy Validation
        </h1>
        <p style={{ color: D.secondary, fontSize: '14px', margin: 0 }}>
          All {total} registered strategies, their data sources, fallback chains, and operational status.
          Only fully operational strategies are available in the Cost Build creation UI.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Fully Operational', count: opsCount, bg: D.successLight, color: D.success },
          { label: 'Placeholder', count: stubCount, bg: D.errorLight, color: D.error },
          { label: 'Partially Operational', count: partialCount, bg: D.warningLight, color: D.warning },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}33`, borderRadius: '8px', padding: '16px 20px' }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: c.color }}>{c.count}</div>
            <div style={{ fontSize: '13px', color: c.color, marginTop: '2px' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Production warning if stubs exist */}
      {stubCount > 0 && (
        <div style={{
          background: D.warningLight, border: `1px solid ${D.warning}`, borderRadius: '8px',
          padding: '12px 16px', marginBottom: '24px', fontSize: '13px', color: '#92400e',
        }}>
          <strong>Production gate active:</strong> {stubCount} placeholder strateg{stubCount === 1 ? 'y is' : 'ies are'} hidden
          from the Cost Build creation UI and cannot be selected by users until fully implemented.
        </div>
      )}

      {/* Strategy matrix table */}
      <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: D.bg, borderBottom: `2px solid ${D.border}` }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: D.secondary, width: '160px' }}>Strategy</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: D.secondary, width: '160px' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: D.secondary }}>Description</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: D.secondary, width: '220px' }}>Source Tables</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: D.secondary, width: '180px' }}>Fallback Chain</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, meta], idx) => (
              <tr key={key} style={{ borderBottom: idx < entries.length - 1 ? `1px solid ${D.border}` : 'none', background: meta.status === 'placeholder' ? '#FAFAFA' : D.card }}>
                <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                  <code style={{ fontSize: '12px', color: meta.status === 'fully_operational' ? D.blue : D.secondary, fontWeight: 600 }}>
                    {key}
                  </code>
                  <div style={{ fontSize: '12px', color: D.secondary, marginTop: '2px' }}>{meta.label}</div>
                </td>
                <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                  <StatusBadge status={meta.status} />
                  {meta.status !== 'fully_operational' && (
                    <div style={{ fontSize: '11px', color: D.secondary, marginTop: '6px', fontStyle: 'italic' }}>
                      {meta.notesForUI}
                    </div>
                  )}
                </td>
                <td style={{ padding: '14px 16px', verticalAlign: 'top', color: D.dark, lineHeight: 1.5 }}>
                  {meta.description}
                </td>
                <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                  <Pills items={meta.sourceTables} color={D.blue} />
                </td>
                <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                  {meta.fallbackChain.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {meta.fallbackChain.map((s, i) => (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: D.secondary, fontSize: '11px' }}>↓</span>
                          <code style={{ fontSize: '11px', color: D.secondary }}>{s}</code>
                          {i === 0 && <span style={{ fontSize: '10px', color: D.secondary }}>(first)</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: '12px', color: D.secondary }}>No fallback</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fallback chains by item type */}
      <div style={{ marginTop: '28px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: D.dark, marginBottom: '16px' }}>
          Default Fallback Chains by Item Cost Type
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {[
            { type: 'PURCHASED',    chain: ['PRICE_LIST', 'LAST_PURCHASE', 'AVERAGE_PURCHASE'] },
            { type: 'MANUFACTURED', chain: ['BOM_ROLLUP'] },
            { type: 'MAKE_OR_BUY', chain: ['BOM_ROLLUP', 'LAST_PURCHASE', 'PRICE_LIST'] },
            { type: 'SERVICE',      chain: ['PRICE_LIST', 'MANUAL_OVERRIDE'] },
            { type: 'MANUAL',       chain: ['MANUAL_OVERRIDE', 'PRICE_LIST'] },
          ].map(({ type, chain }) => (
            <div key={type} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', padding: '14px 16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: D.secondary, marginBottom: '8px' }}>{type}</div>
              {chain.map((s, i) => {
                const meta = STRATEGY_STATUS_MATRIX[s]
                const isOp = meta?.status === 'fully_operational'
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: i < chain.length - 1 ? '4px' : 0 }}>
                    <span style={{ fontSize: '11px', color: D.secondary, width: '16px' }}>{i + 1}.</span>
                    <code style={{ fontSize: '12px', color: isOp ? D.blue : D.secondary }}>{s}</code>
                    {!isOp && <span style={{ fontSize: '10px', color: D.error }}>stub</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <p style={{ color: D.secondary, fontSize: '12px', marginTop: '24px' }}>
        Last updated: this view reflects the current code state of{' '}
        <code style={{ fontSize: '11px' }}>backend/services/costBuild/strategies.ts</code>
      </p>
    </div>
  )
}

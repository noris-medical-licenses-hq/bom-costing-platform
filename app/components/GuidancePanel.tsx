'use client'
import { useState, useEffect } from 'react'

// ─── Module guidance registry ─────────────────────────────────────────────────

const MODULES: Record<string, {
  title: string
  purpose: string
  whenToUse: string[]
  inputs: string[]
  outputs: string[]
  nextAction?: string
}> = {
  imports: {
    title: 'Import Center',
    purpose: 'Bring external data into the platform — SKUs, BOMs, price lists, costs, inventory snapshots, and purchase history.',
    whenToUse: [
      'When you receive a new price list from a supplier or country',
      'When your ERP exports new BOM structures or inventory counts',
      'When adding new SKUs or updating master data',
    ],
    inputs: ['Excel or CSV file', 'Column mapping (or saved template)', 'Import type selection'],
    outputs: ['Validated rows committed to master data', 'Error report (Excel) for rejected rows'],
    nextAction: 'After import: go to Cost Builds to resolve unit costs using the new data.',
  },
  'cost-builds': {
    title: 'Cost Builds',
    purpose: 'Resolve a unit cost for every SKU at a site using a chosen costing strategy: Price List, BOM Rollup, Manufacturing Cost Rollup, Last Purchase, or Average Purchase.',
    whenToUse: [
      'After importing a new price list or BOM structure',
      'Before running an inventory valuation',
      'When investigating what a SKU costs at a specific site',
    ],
    inputs: ['Site', 'Costing strategy', 'Price list version or BOM version'],
    outputs: ['Frozen Cost Set with one resolved cost per SKU', 'Zero-cost issue list for unresolved SKUs'],
    nextAction: 'After a successful build: go to Inventory to run a valuation using this cost set.',
  },
  boms: {
    title: 'BOM Management',
    purpose: 'View, approve, and manage Bill of Materials versions for manufactured SKUs. BOMs define the component structure used in BOM Rollup cost builds.',
    whenToUse: [
      'After importing BOM lines, to approve the new version',
      'When a manufactured SKU has zero cost in a cost build',
      'When auditing which components drive finished-good costs',
    ],
    inputs: ['BOM import via Import Center', 'BOM version approval action'],
    outputs: ['Approved BOM version', 'Component cost rollup (via Cost Build > BOM Rollup strategy)'],
  },
  'price-lists': {
    title: 'Price Lists',
    purpose: 'Browse and manage versioned country price lists. Each version contains per-SKU unit prices imported from a supplier or country price file.',
    whenToUse: [
      'After importing a new price list to verify its contents',
      'When building costs using the Price List strategy',
      'When running an Impact Analysis to compare two versions',
    ],
    inputs: ['Price list import via Import Center'],
    outputs: ['Per-SKU unit prices by country', 'CSV export for offline review'],
  },
  inventory: {
    title: 'Inventory Snapshots',
    purpose: 'Manage inventory count snapshots and run valuations. The Smart Valuation Wizard auto-selects the best approved cost build for each snapshot.',
    whenToUse: [
      'After receiving a period-end inventory count from ERP or warehouse',
      'When you need a total inventory value for reporting or audit',
    ],
    inputs: ['Inventory snapshot import via Import Center', 'Cost build (auto-selected by wizard)'],
    outputs: ['Valuation report with line-level values in your reporting currency', 'CSV export of all valued lines'],
    nextAction: 'After valuation: go to Valuation Reports to approve and lock the report.',
  },
  'data-quality': {
    title: 'Data Quality',
    purpose: 'A health dashboard that scans all master data for issues: zero costs, missing BOMs, draft versions, stale price lists, and inventory gaps.',
    whenToUse: [
      'As a daily or weekly check before running cost builds or valuations',
      'When a cost build produces unexpected zero-cost results',
      'Before closing a reporting period',
    ],
    inputs: ['No inputs — scans master data automatically'],
    outputs: ['Issue list per category (Costing, BOM, Mfg, Price List, Inventory)', 'Excel export of all issues across 5 sheets'],
  },
  'impact-analysis': {
    title: 'Impact Analysis',
    purpose: 'Compare two price list versions or cost builds to see exactly which SKUs changed, by how much, and which downstream assets (BOMs, inventory, manufacturing structures) are affected.',
    whenToUse: [
      'Before approving a new price list version',
      'When investigating why a cost build result changed from the previous period',
      'When procurement updates supplier prices and you need to quantify the impact',
    ],
    inputs: ['Two price list versions or two cost builds to compare'],
    outputs: ['Cost change table with severity (CRITICAL / WARNING / INFO)', 'BOM, inventory, and manufacturing impact summaries', 'Excel export of all impact data'],
  },
  'mfg-structures': {
    title: 'Manufacturing Structures',
    purpose: 'Define the process cost elements (machining, subcontracting, assembly, overhead) applied on top of BOM material costs for manufactured SKUs.',
    whenToUse: [
      'When setting up costs for internally manufactured or subcontracted items',
      'When the Manufacturing Cost Rollup strategy is used in a cost build',
    ],
    inputs: ['Finished good SKU', 'Process element type, cost source, quantity, and fixed cost or price list reference'],
    outputs: ['Manufacturing cost structure used in MFG_COST_ROLLUP cost builds'],
    nextAction: 'After creating elements: run a Cost Build with the MFG_COST_ROLLUP strategy to apply them.',
  },
}

// ─── Glossary ─────────────────────────────────────────────────────────────────

const GLOSSARY: Array<{ term: string; def: string }> = [
  { term: 'SKU', def: 'Stock Keeping Unit — a uniquely identified product, material, component, or service tracked in the platform.' },
  { term: 'BOM', def: 'Bill of Materials — a structured list of components and quantities needed to produce one unit of a finished good.' },
  { term: 'Cost Build', def: 'A snapshot that resolves a unit cost for every SKU at a site, using a chosen costing strategy. The result is a frozen Cost Set.' },
  { term: 'Cost Set', def: 'A frozen, named collection of resolved unit costs (one per SKU). Cost Sets are the input for inventory valuations.' },
  { term: 'Price List Version', def: 'A versioned set of per-SKU prices for a country or supplier, imported from an external file. Multiple versions can coexist; only one is active at a time.' },
  { term: 'Costing Strategy', def: 'The rule used to resolve a unit cost for a SKU: Price List, BOM Rollup, Manufacturing Cost Rollup, Last Purchase, or Average Purchase.' },
  { term: 'Valuation', def: 'The process of multiplying inventory quantities by unit costs to produce a total inventory value, expressed in a reporting currency.' },
  { term: 'Manufacturing Structure', def: 'A definition of process cost elements (machining, sterilisation, assembly, overhead) applied on top of BOM material costs for a manufactured SKU.' },
  { term: 'Impact Analysis', def: 'A comparison between two price list versions or cost builds that quantifies which SKUs changed in cost, with severity classification, BOM exposure, and inventory value delta.' },
  { term: 'FX Rate', def: 'Foreign exchange rate used to convert unit costs from a source currency into the valuation currency. Maintained in the Corporate FX Rates table.' },
  { term: 'Make / Buy', def: 'A flag on each SKU indicating whether it is manufactured in-house (make) or purchased externally (buy). Manufactured SKUs require a BOM for BOM Rollup costing.' },
  { term: 'Import Job', def: 'A tracked upload session. Each import job records every row, its validation status, and any errors — fully auditable and traceable via BG-017.' },
  { term: 'Data Quality', def: 'A health scan of all master data that surfaces issues: zero costs, missing BOMs, stale price lists, draft inventory snapshots, and manufacturing structures without elements.' },
]

// ─── Design tokens ────────────────────────────────────────────────────────────

const D = {
  dark: '#222222', secondary: '#666666', border: '#E5E7EB',
  card: '#FFFFFF', blue: '#1565c0', blueLight: '#EFF6FF',
}

// ─── Glossary modal ───────────────────────────────────────────────────────────

function GlossaryModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: D.card, borderRadius: '12px', padding: '28px', width: '640px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: D.dark }}>Platform Glossary</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: D.secondary, lineHeight: 1 }}>×</button>
        </div>
        {GLOSSARY.map(({ term, def }) => (
          <div key={term} style={{ padding: '12px 0', borderBottom: `1px solid ${D.border}` }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: D.dark, marginBottom: '4px' }}>{term}</div>
            <div style={{ fontSize: '13px', color: D.secondary, lineHeight: 1.55 }}>{def}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── GuidancePanel ────────────────────────────────────────────────────────────

export function GuidancePanel({ moduleKey }: { moduleKey: string }) {
  const [visible,      setVisible]      = useState(false)
  const [showGlossary, setShowGlossary] = useState(false)
  const [mounted,      setMounted]      = useState(false)
  const storageKey = `guide:dismissed:${moduleKey}`

  useEffect(() => {
    setMounted(true)
    setVisible(!localStorage.getItem(storageKey))
  }, [storageKey])

  function dismiss() {
    localStorage.setItem(storageKey, '1')
    setVisible(false)
  }
  function reopen() {
    localStorage.removeItem(storageKey)
    setVisible(true)
  }

  const mod = MODULES[moduleKey]
  if (!mod || !mounted) return null

  return (
    <>
      {showGlossary && <GlossaryModal onClose={() => setShowGlossary(false)} />}

      {!visible && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', fontSize: '12px', color: D.secondary }}>
          <button
            onClick={reopen}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: D.secondary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', border: `1.5px solid ${D.secondary}`, fontSize: '10px', fontWeight: 700, lineHeight: 1 }}>?</span>
            How this module works
          </button>
          <span style={{ color: D.border }}>·</span>
          <button onClick={() => setShowGlossary(true)} style={{ fontSize: '12px', color: D.secondary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Glossary
          </button>
        </div>
      )}

      {visible && (
        <div style={{ background: D.blueLight, border: '1px solid #BFDBFE', borderRadius: '10px', padding: '20px 24px', marginBottom: '24px', position: 'relative' }}>
          <button
            onClick={dismiss}
            aria-label="Dismiss guide"
            style={{ position: 'absolute', top: '10px', right: '14px', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: D.secondary, lineHeight: 1 }}
          >×</button>

          <div style={{ fontSize: '11px', fontWeight: 700, color: D.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
            {mod.title}
          </div>
          <div style={{ fontSize: '14px', color: D.dark, marginBottom: '16px', lineHeight: 1.5, paddingRight: '24px' }}>
            {mod.purpose}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: mod.nextAction ? '14px' : 0 }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>When to use</div>
              <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '12px', color: D.dark, lineHeight: 1.65 }}>
                {mod.whenToUse.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Expected inputs</div>
              <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '12px', color: D.dark, lineHeight: 1.65 }}>
                {mod.inputs.map((inp, i) => <li key={i}>{inp}</li>)}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: D.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Expected outputs</div>
              <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '12px', color: D.dark, lineHeight: 1.65 }}>
                {mod.outputs.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </div>
          </div>

          {mod.nextAction && (
            <div style={{ background: '#DBEAFE', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: D.blue, marginTop: '10px' }}>
              <strong>Next recommended action:</strong> {mod.nextAction}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '14px', alignItems: 'center' }}>
            <button
              onClick={dismiss}
              style={{ fontSize: '12px', color: D.blue, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
            >
              Got it — don&apos;t show again
            </button>
            <span style={{ color: D.border }}>·</span>
            <button onClick={() => setShowGlossary(true)} style={{ fontSize: '12px', color: D.secondary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Open Glossary
            </button>
          </div>
        </div>
      )}
    </>
  )
}

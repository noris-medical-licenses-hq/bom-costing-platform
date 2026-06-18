export default function Dashboard() {
  const cards = [
    { href: '/skus', label: 'SKU Management', description: 'Create, search and archive SKUs. Manage part numbers, families, make/buy status.' },
    { href: '/boms', label: 'BOM Explorer', description: 'View and navigate bill-of-materials trees. Trigger cost calculation.' },
    { href: '/validation', label: 'Validation Center', description: 'Run validation rules against BOMs, SKUs, cost sets and rules. See findings.' },
    { href: '/inventory', label: 'Inventory Valuation', description: 'Create snapshots, upload lines, run valuation and review results by family/warehouse.' },
  ]

  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>BOM Costing Platform</h1>
      <p style={{ color: '#555', marginBottom: '32px', fontSize: '14px' }}>Internal cost management system — Noris Medical</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
        {cards.map(card => (
          <a key={card.href} href={card.href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', cursor: 'pointer' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#1a1a2e' }}>{card.label}</h2>
              <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>{card.description}</p>
            </div>
          </a>
        ))}
      </div>

      <div style={{ marginTop: '40px', padding: '16px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>API Endpoints</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px', fontFamily: 'monospace', color: '#444' }}>
          {[
            'GET /api/skus', 'POST /api/skus',
            'GET /api/skus/[id]', 'PATCH /api/skus/[id]',
            'GET /api/boms', 'POST /api/boms',
            'GET /api/cost-sets', 'POST /api/cost-sets',
            'GET /api/rules', 'POST /api/rules',
            'GET /api/exceptions', 'POST /api/exceptions',
            'GET /api/inventory', 'POST /api/inventory',
            'POST /api/inventory/[id]/value', 'GET /api/inventory/[id]/lines',
            'POST /api/validate', 'POST /api/calculate',
            'GET /api/audit', 'POST /api/auth/webhook',
          ].map(ep => <span key={ep} style={{ padding: '2px 0' }}>{ep}</span>)}
        </div>
      </div>
    </div>
  )
}

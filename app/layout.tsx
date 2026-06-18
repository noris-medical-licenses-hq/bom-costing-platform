import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BOM Costing Platform',
  description: 'BOM costing and inventory valuation — Noris Medical',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f5f5f5' }}>
        <nav style={{ background: '#1a1a2e', color: '#fff', padding: '12px 24px', display: 'flex', gap: '24px', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '15px' }}>BOM Costing</span>
          <a href="/" style={{ color: '#ccc', textDecoration: 'none', fontSize: '14px' }}>Dashboard</a>
          <a href="/skus" style={{ color: '#ccc', textDecoration: 'none', fontSize: '14px' }}>SKUs</a>
          <a href="/boms" style={{ color: '#ccc', textDecoration: 'none', fontSize: '14px' }}>BOMs</a>
          <a href="/validation" style={{ color: '#ccc', textDecoration: 'none', fontSize: '14px' }}>Validation</a>
          <a href="/inventory" style={{ color: '#ccc', textDecoration: 'none', fontSize: '14px' }}>Inventory</a>
        </nav>
        <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
          {children}
        </main>
      </body>
    </html>
  )
}

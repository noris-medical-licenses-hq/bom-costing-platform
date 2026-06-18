import type { Metadata } from 'next'
import { NavUser } from './components/NavUser'

export const metadata: Metadata = {
  title: 'BOM Costing Platform — Noris Medical',
  description: 'BOM costing and inventory valuation — Noris Medical',
}

const NAV_LINKS = [
  { href: '/',           label: 'Dashboard'  },
  { href: '/boms',       label: 'BOMs'       },
  { href: '/inventory',  label: 'Inventory'  },
  { href: '/validation', label: 'Validation' },
  { href: '/imports',    label: 'Imports'    },
  { href: '/audit',      label: 'Audit'      },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#F8F9FA', color: '#222222' }}>

        <header style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center' }}>
            <a href="/" style={{ textDecoration: 'none', marginRight: '32px', display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#C62839', letterSpacing: '-0.3px' }}>Noris Medical</span>
              <span style={{ fontSize: '11px', color: '#666666' }}>BOM Costing Platform</span>
            </a>

            <nav style={{ display: 'flex', gap: '2px', flex: 1 }}>
              {NAV_LINKS.map(link => (
                <a key={link.href} href={link.href} style={{ fontSize: '14px', fontWeight: 500, color: '#444444', textDecoration: 'none', padding: '6px 12px', borderRadius: '6px' }}>
                  {link.label}
                </a>
              ))}
            </nav>

            <NavUser />
          </div>
        </header>

        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
          {children}
        </main>

      </body>
    </html>
  )
}

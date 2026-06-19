import type { Metadata } from 'next'
import { NavUser } from './components/NavUser'
import { GlobalSearch } from './components/GlobalSearch'
import { AdminNavLink } from './components/AdminNavLink'

export const metadata: Metadata = {
  title: 'BOM Costing Platform — Noris Medical',
  description: 'BOM costing and inventory valuation — Noris Medical',
}

const NAV_LINKS = [
  { href: '/',              label: 'Dashboard'    },
  { href: '/imports',       label: 'Imports'      },
  { href: '/price-lists',   label: 'Price Lists'  },
  { href: '/boms',          label: 'BOMs'         },
  { href: '/cost-builds',    label: 'Cost Builds'  },
  { href: '/cost-comparison',  label: 'Compare'       },
  { href: '/mfg-structures',   label: 'Mfg Structures' },
  { href: '/cost-quality',     label: 'Cost Quality'  },
  { href: '/data-quality',     label: 'Data Quality'  },
  { href: '/impact-analysis',  label: 'Impact'        },
  { href: '/inventory',        label: 'Inventory'     },
  { href: '/sites',         label: 'Sites'        },
  { href: '/warehouses',    label: 'Warehouses'   },
  { href: '/suppliers',     label: 'Suppliers'    },
  { href: '/fx-rates',      label: 'FX Rates'     },
  { href: '/skus',          label: 'SKUs'         },
  { href: '/traces',        label: 'Traces'       },
  { href: '/validation',      label: 'Validation'       },
  { href: '/audit',           label: 'Audit'            },
  { href: '/strategy-status', label: 'Strategy Status'  },
  { href: '/readiness',       label: 'Readiness'        },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#F8F9FA', color: '#222222' }}>

        <header style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px', height: '56px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <a href="/" style={{ textDecoration: 'none', marginRight: '16px', display: 'flex', flexDirection: 'column', lineHeight: 1.15, flexShrink: 0 }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#C62839', letterSpacing: '-0.3px' }}>Noris Medical</span>
              <span style={{ fontSize: '11px', color: '#666666' }}>BOM Costing</span>
            </a>

            <nav style={{ display: 'flex', gap: '1px', flex: 1, flexWrap: 'nowrap', overflow: 'hidden' }}>
              {NAV_LINKS.map(link => (
                <a key={link.href} href={link.href} style={{ fontSize: '13px', fontWeight: 500, color: '#444444', textDecoration: 'none', padding: '5px 9px', borderRadius: '5px', whiteSpace: 'nowrap' }}>
                  {link.label}
                </a>
              ))}
            </nav>

            <AdminNavLink />
            <GlobalSearch />
            <NavUser />
          </div>
        </header>

        <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 20px' }}>
          {children}
        </main>

      </body>
    </html>
  )
}

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BOM Costing Platform',
  description: 'Internal BOM costing and inventory valuation for Noris Medical',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

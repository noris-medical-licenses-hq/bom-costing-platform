// Temporary root page — redirect to dashboard or login based on session.
// TODO: Replace with proper redirect logic after auth is implemented.
export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>BOM Costing Platform</h1>
      <p>Status: 🚧 Under construction — Supabase provisioning pending</p>
      <ul>
        <li>Migrations: ✅ Written (23 files, 32 tables)</li>
        <li>Repository layer: ✅ Scaffolded</li>
        <li>Cost engine: 🟡 Scaffolded (Stages 1-3 implemented)</li>
        <li>Validation engine: 🟡 Scaffolded (V-BOM-001 through V-BOM-005)</li>
        <li>Auth: ⏳ Pending Supabase provisioning</li>
        <li>UI: ⏳ Pending auth</li>
      </ul>
    </main>
  )
}

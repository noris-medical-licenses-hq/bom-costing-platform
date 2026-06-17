# BOM Costing Platform

Internal platform for building, versioning, and costing Bills of Materials for medical devices.

**Status:** Foundation phase — no deployable code yet.

---

## Documentation

| Document | Purpose |
|----------|---------|
| [Project Specification](docs/PROJECT_SPECIFICATION.md) | Features, users, requirements |
| [Data Model](docs/DATA_MODEL.md) | Database schema and relationships |
| [Architecture](docs/ARCHITECTURE.md) | System design, tech stack, data flows |
| [Decisions](docs/DECISIONS.md) | Architecture Decision Records (ADRs) |
| [Roadmap](docs/ROADMAP.md) | Phased delivery plan |

## Stack

- **Frontend:** Next.js 14 (App Router) · TypeScript · Tailwind · shadcn/ui
- **Backend:** Next.js Server Actions · business logic in `/backend/services/`
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **Migrations:** Supabase CLI
- **Testing:** Vitest (unit) · Playwright (e2e)
- **Hosting:** Vercel + Supabase Cloud

## Repository Structure

```
bom-costing-platform/
├── docs/               Architecture documentation
├── database/
│   └── migrations/     SQL migrations (Supabase CLI)
├── frontend/           Next.js application
├── backend/            Server-side services and validators
└── tests/              Unit, integration, and e2e tests
```

## Local Development

> Setup instructions will be added in Phase 1 once Supabase is provisioned.

## Security

- All data is scoped by organization via PostgreSQL Row Level Security.
- `service_role` key is used server-side only — never in client code.
- Every data mutation is logged in `audit_log` via database trigger.
- See [Architecture](docs/ARCHITECTURE.md#security-model) for full details.

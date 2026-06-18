-- M-014: projects
-- Logical cost center or project for project-scoped inventory valuation.
-- OQ-09 resolved: projects table in MVP schema but UI/features deferred to Phase 2.
-- inventory_snapshots.scope_project_id is nullable and unused in MVP UI.

CREATE TABLE projects (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  code             text        NOT NULL,
  name             text        NOT NULL,
  description      text        NULL,
  status           text        NOT NULL DEFAULT 'active',
  start_date       date        NULL,
  end_date         date        NULL,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT projects_pkey
    PRIMARY KEY (id),
  CONSTRAINT projects_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT projects_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT projects_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT projects_org_code_key
    UNIQUE (organization_id, code),
  CONSTRAINT projects_status_check
    CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
  CONSTRAINT projects_end_date_check
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date)
);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE projects IS
  'Logical cost center for project-scoped inventory valuation. Schema in MVP; UI features deferred to Phase 2 (OQ-09).';

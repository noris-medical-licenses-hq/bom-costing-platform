-- M-010: cost_sets + deferred FK patch on organizations.default_cost_set_id
-- ADR-102: Cost Sets are organization-wide (not BOM-scoped), replacing per-BOM cost_scenarios.
-- The same Cost Set applies to any BOM in the organization.
-- is_locked = true blocks new cost_items (used to protect approved inventory snapshot contexts).

CREATE TABLE cost_sets (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  code             text        NOT NULL,
  name             text        NOT NULL,
  description      text        NULL,
  cost_set_type    text        NOT NULL,
  base_currency    text        NOT NULL,
  effective_from   date        NOT NULL,
  effective_to     date        NULL,
  is_locked        boolean     NOT NULL DEFAULT false,
  is_default       boolean     NOT NULL DEFAULT false,
  status           text        NOT NULL DEFAULT 'draft',
  notes            text        NULL,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cost_sets_pkey
    PRIMARY KEY (id),
  CONSTRAINT cost_sets_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT cost_sets_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT cost_sets_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT cost_sets_org_code_key
    UNIQUE (organization_id, code),
  CONSTRAINT cost_sets_cost_set_type_check
    CHECK (cost_set_type IN ('standard', 'budget', 'quote', 'actual', 'simulation')),
  CONSTRAINT cost_sets_base_currency_check
    CHECK (char_length(base_currency) = 3),
  CONSTRAINT cost_sets_status_check
    CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT cost_sets_effective_dates_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TRIGGER trg_cost_sets_updated_at
  BEFORE UPDATE ON cost_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE cost_sets IS
  'Named, organization-wide costing context. The cost engine always operates within a Cost Set. ADR-102.';
COMMENT ON COLUMN cost_sets.is_locked IS
  'When true: no new cost_items can be added. Set when referenced by an approved inventory_snapshot.';
COMMENT ON COLUMN cost_sets.is_default IS
  'Organization default for new calculations. At most one per org (enforced at app layer — C-14).';
COMMENT ON COLUMN cost_sets.base_currency IS
  'All cost_items are expected to use this currency in MVP (OQ-01 resolved: single-currency MVP).';

-- ─── Deferred FK: organizations.default_cost_set_id → cost_sets ──────────────
-- Stub column created in M-002. FK constraint added here now that cost_sets exists.

ALTER TABLE organizations
  ADD CONSTRAINT organizations_default_cost_set_id_fkey
  FOREIGN KEY (default_cost_set_id) REFERENCES cost_sets(id);

COMMENT ON COLUMN organizations.default_cost_set_id IS
  'Optional default cost context. FK to cost_sets.id (constraint added here in M-010 — deferred from M-002).';

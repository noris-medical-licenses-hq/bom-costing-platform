-- M-002: organizations table
-- Root multi-tenant entity. Every row in every other table belongs to one organization.
-- Note: default_cost_set_id is a nullable stub here; the FK constraint is added in M-010
-- after cost_sets exists, to avoid a circular dependency.

CREATE TABLE organizations (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  name                  text        NOT NULL,
  slug                  text        NOT NULL,
  default_currency      text        NOT NULL,
  default_cost_set_id   uuid        NULL,
  status                text        NOT NULL DEFAULT 'active',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT organizations_pkey
    PRIMARY KEY (id),
  CONSTRAINT organizations_slug_key
    UNIQUE (slug),
  CONSTRAINT organizations_default_currency_check
    CHECK (char_length(default_currency) = 3),
  CONSTRAINT organizations_status_check
    CHECK (status IN ('active', 'suspended', 'archived'))
);

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE organizations IS
  'Root multi-tenant entity. All business data is owned by and scoped to an Organization.';
COMMENT ON COLUMN organizations.default_cost_set_id IS
  'FK to cost_sets.id. Constraint added in M-010 (deferred: cost_sets does not exist yet at this point).';
COMMENT ON COLUMN organizations.slug IS
  'URL-safe, lowercase, hyphen-separated identifier. Used in routing and API calls.';

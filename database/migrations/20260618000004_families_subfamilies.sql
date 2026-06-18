-- M-004: families and subfamilies
-- Top two levels of SKU classification. Drive cost rule targeting and reporting rollup.

-- ─── families ────────────────────────────────────────────────────────────────

CREATE TABLE families (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  code             text        NOT NULL,
  name             text        NOT NULL,
  description      text        NULL,
  is_active        boolean     NOT NULL DEFAULT true,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT families_pkey
    PRIMARY KEY (id),
  CONSTRAINT families_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT families_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT families_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT families_org_code_key
    UNIQUE (organization_id, code)
);

CREATE TRIGGER trg_families_updated_at
  BEFORE UPDATE ON families
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE families IS
  'Top-level SKU classification. Drives cost rule targeting (rules can apply to all SKUs in a family) and reporting rollup.';

-- ─── subfamilies ──────────────────────────────────────────────────────────────

CREATE TABLE subfamilies (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  family_id        uuid        NOT NULL,
  code             text        NOT NULL,
  name             text        NOT NULL,
  description      text        NULL,
  is_active        boolean     NOT NULL DEFAULT true,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subfamilies_pkey
    PRIMARY KEY (id),
  CONSTRAINT subfamilies_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT subfamilies_family_id_fkey
    FOREIGN KEY (family_id) REFERENCES families(id),
  CONSTRAINT subfamilies_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT subfamilies_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT subfamilies_family_code_key
    UNIQUE (family_id, code)
);

CREATE TRIGGER trg_subfamilies_updated_at
  BEFORE UPDATE ON subfamilies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE subfamilies IS
  'Second-level SKU classification under a family. Enables finer-grained cost rule targeting.';
COMMENT ON COLUMN subfamilies.organization_id IS
  'Denormalized from family for RLS policy evaluation without join.';

-- M-005: suppliers
-- Vendor registry. Referenced by supplier_prices and cost rules (supplier/country targeting).
-- Schema included in MVP; supplier management UI is Phase 2.
-- Historical prices are retained when a supplier is disqualified (no CASCADE DELETE).

CREATE TABLE suppliers (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  code             text        NOT NULL,
  name             text        NOT NULL,
  country          text        NOT NULL,
  contact_name     text        NULL,
  contact_email    text        NULL,
  is_qualified     boolean     NOT NULL DEFAULT false,
  qualified_at     timestamptz NULL,
  qualified_by     uuid        NULL,
  status           text        NOT NULL DEFAULT 'active',
  notes            text        NULL,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT suppliers_pkey
    PRIMARY KEY (id),
  CONSTRAINT suppliers_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT suppliers_qualified_by_fkey
    FOREIGN KEY (qualified_by) REFERENCES profiles(id),
  CONSTRAINT suppliers_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT suppliers_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT suppliers_org_code_key
    UNIQUE (organization_id, code),
  CONSTRAINT suppliers_country_check
    CHECK (char_length(country) = 2),
  CONSTRAINT suppliers_status_check
    CHECK (status IN ('active', 'inactive', 'disqualified'))
);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE suppliers IS
  'Vendor registry. Source of supplier_prices and referenced by cost rules (country targeting).';
COMMENT ON COLUMN suppliers.country IS
  'ISO 3166-1 alpha-2 country code (2 uppercase letters). Used by cost rules targeting supplier_country scope.';
COMMENT ON COLUMN suppliers.is_qualified IS
  'Regulatory qualification status. A non-qualified supplier sourcing a regulated SKU triggers Validation V-SKU-003.';

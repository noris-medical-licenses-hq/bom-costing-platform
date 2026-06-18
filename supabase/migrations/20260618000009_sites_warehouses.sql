-- M-009: sites and warehouses
-- Physical context for inventory valuation. A site has many warehouses.
-- Used to scope inventory_snapshots and optionally cost rule applicability.

-- ─── sites ───────────────────────────────────────────────────────────────────

CREATE TABLE sites (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  code             text        NOT NULL,
  name             text        NOT NULL,
  address          text        NULL,
  city             text        NULL,
  country          text        NULL,
  is_active        boolean     NOT NULL DEFAULT true,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sites_pkey
    PRIMARY KEY (id),
  CONSTRAINT sites_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT sites_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT sites_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT sites_org_code_key
    UNIQUE (organization_id, code),
  CONSTRAINT sites_country_check
    CHECK (country IS NULL OR char_length(country) = 2)
);

CREATE TRIGGER trg_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sites IS
  'Physical manufacturing, assembly, or storage location. Parent of warehouses.';

-- ─── warehouses ───────────────────────────────────────────────────────────────

CREATE TABLE warehouses (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  site_id          uuid        NOT NULL,
  code             text        NOT NULL,
  name             text        NOT NULL,
  warehouse_type   text        NOT NULL,
  is_active        boolean     NOT NULL DEFAULT true,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT warehouses_pkey
    PRIMARY KEY (id),
  CONSTRAINT warehouses_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT warehouses_site_id_fkey
    FOREIGN KEY (site_id) REFERENCES sites(id),
  CONSTRAINT warehouses_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT warehouses_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT warehouses_site_code_key
    UNIQUE (site_id, code),
  CONSTRAINT warehouses_warehouse_type_check
    CHECK (warehouse_type IN (
      'raw_materials', 'work_in_progress', 'finished_goods', 'quarantine', 'consignment'
    ))
);

CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE warehouses IS
  'Storage zone within a Site. warehouse_type determines how inventory is classified in valuation reports.';
COMMENT ON COLUMN warehouses.organization_id IS
  'Denormalized from site for RLS policy evaluation without join.';

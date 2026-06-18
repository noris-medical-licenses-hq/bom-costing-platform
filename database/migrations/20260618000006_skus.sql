-- M-006: skus (unified item entity)
-- Replaces separate products/components tables. Every article in a BOM, sourced from a
-- supplier, or in inventory is a SKU. item_type and make_buy distinguish its role.
-- ADR-101: Single skus table prevents FK ambiguity in bom_lines.

CREATE TABLE skus (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL,
  part_number          text        NOT NULL,
  name                 text        NOT NULL,
  description          text        NULL,
  item_type            text        NOT NULL,
  make_buy             text        NOT NULL,
  unit_of_measure      text        NOT NULL,
  family_id            uuid        NULL,
  subfamily_id         uuid        NULL,
  lead_time_days       integer     NULL,
  is_regulated         boolean     NOT NULL DEFAULT false,
  default_supplier_id  uuid        NULL,
  status               text        NOT NULL DEFAULT 'draft',
  notes                text        NULL,
  created_by           uuid        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid        NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT skus_pkey
    PRIMARY KEY (id),
  CONSTRAINT skus_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT skus_family_id_fkey
    FOREIGN KEY (family_id) REFERENCES families(id),
  CONSTRAINT skus_subfamily_id_fkey
    FOREIGN KEY (subfamily_id) REFERENCES subfamilies(id),
  CONSTRAINT skus_default_supplier_id_fkey
    FOREIGN KEY (default_supplier_id) REFERENCES suppliers(id),
  CONSTRAINT skus_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT skus_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT skus_org_part_number_key
    UNIQUE (organization_id, part_number),
  CONSTRAINT skus_item_type_check
    CHECK (item_type IN ('purchased_part', 'sub_assembly', 'finished_good', 'service', 'virtual')),
  CONSTRAINT skus_make_buy_check
    CHECK (make_buy IN ('make', 'buy', 'make_or_buy')),
  CONSTRAINT skus_status_check
    CHECK (status IN ('draft', 'active', 'discontinued', 'archived')),
  CONSTRAINT skus_lead_time_days_check
    CHECK (lead_time_days IS NULL OR lead_time_days >= 0)
);

CREATE TRIGGER trg_skus_updated_at
  BEFORE UPDATE ON skus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE skus IS
  'Universal item entity. Covers purchased parts, sub-assemblies, finished goods, services, and virtual items.';
COMMENT ON COLUMN skus.item_type IS
  'Manufacturing classification: purchased_part | sub_assembly | finished_good | service | virtual';
COMMENT ON COLUMN skus.make_buy IS
  'Sourcing strategy: make | buy | make_or_buy. A buy SKU must not have a BOM (V-BOM-002).';
COMMENT ON COLUMN skus.subfamily_id IS
  'App-layer constraint: must belong to family_id. Validated at write time (cannot be enforced as DB FK).';
COMMENT ON COLUMN skus.default_supplier_id IS
  'Preferred supplier for procurement. Used in cost precedence resolution (Priority 4: supplier-scoped cost items).';

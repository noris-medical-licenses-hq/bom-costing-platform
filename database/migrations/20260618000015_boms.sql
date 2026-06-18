-- M-015: boms, bom_versions, bom_lines
-- Manufacturing recipe entities. boms is a container; costing always targets a bom_version.
-- bom_lines forms a self-referencing tree (adjacency list, ADR-004).
-- Cycle detection at write time (ADR-106). Immutability enforced when is_locked=true (app layer).

-- ─── boms ─────────────────────────────────────────────────────────────────────

CREATE TABLE boms (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  sku_id           uuid        NOT NULL,
  notes            text        NULL,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT boms_pkey
    PRIMARY KEY (id),
  CONSTRAINT boms_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT boms_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES skus(id),
  CONSTRAINT boms_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT boms_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT boms_sku_id_key
    UNIQUE (sku_id)
);

CREATE TRIGGER trg_boms_updated_at
  BEFORE UPDATE ON boms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE boms IS
  'Container entity. Sole purpose: stable parent UUID for bom_versions. One BOM per SKU (C-17).';

-- ─── bom_versions ─────────────────────────────────────────────────────────────

CREATE TABLE bom_versions (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  bom_id           uuid        NOT NULL,
  version_number   integer     NOT NULL,
  version_label    text        NULL,
  status           text        NOT NULL DEFAULT 'draft',
  is_locked        boolean     NOT NULL DEFAULT false,
  effective_from   date        NULL,
  effective_to     date        NULL,
  change_summary   text        NULL,
  approved_by      uuid        NULL,
  approved_at      timestamptz NULL,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bom_versions_pkey
    PRIMARY KEY (id),
  CONSTRAINT bom_versions_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT bom_versions_bom_id_fkey
    FOREIGN KEY (bom_id) REFERENCES boms(id),
  CONSTRAINT bom_versions_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id),
  CONSTRAINT bom_versions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT bom_versions_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT bom_versions_bom_version_key
    UNIQUE (bom_id, version_number),
  CONSTRAINT bom_versions_version_number_check
    CHECK (version_number > 0),
  CONSTRAINT bom_versions_status_check
    CHECK (status IN ('draft', 'under_review', 'approved', 'superseded', 'archived'))
);

-- C-02: Exactly one approved version per BOM at any time.
CREATE UNIQUE INDEX bom_versions_one_approved_per_bom
  ON bom_versions (bom_id)
  WHERE status = 'approved';

CREATE TRIGGER trg_bom_versions_updated_at
  BEFORE UPDATE ON bom_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE bom_versions IS
  'Immutable point-in-time snapshot of a BOM structure. Once approved (is_locked=true), no edits permitted.';
COMMENT ON COLUMN bom_versions.is_locked IS
  'Set true when status=approved. Blocks all writes to bom_lines for this version (C-05, app-layer).';
COMMENT ON COLUMN bom_versions.effective_from IS
  'Informational only in MVP (OQ-08 resolved). Cost engine always uses the approved version regardless of dates.';

-- ─── bom_lines ────────────────────────────────────────────────────────────────

CREATE TABLE bom_lines (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL,
  bom_version_id        uuid        NOT NULL,
  parent_line_id        uuid        NULL,
  line_type             text        NOT NULL,
  sku_id                uuid        NULL,
  virtual_component_id  uuid        NULL,
  quantity              numeric     NOT NULL,
  unit_of_measure       text        NOT NULL,
  position              integer     NOT NULL DEFAULT 0,
  reference_designator  text        NULL,
  is_reference_only     boolean     NOT NULL DEFAULT false,
  notes                 text        NULL,
  created_by            uuid        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid        NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bom_lines_pkey
    PRIMARY KEY (id),
  CONSTRAINT bom_lines_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT bom_lines_bom_version_id_fkey
    FOREIGN KEY (bom_version_id) REFERENCES bom_versions(id),
  CONSTRAINT bom_lines_parent_line_id_fkey
    FOREIGN KEY (parent_line_id) REFERENCES bom_lines(id),
  CONSTRAINT bom_lines_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES skus(id),
  CONSTRAINT bom_lines_virtual_component_id_fkey
    FOREIGN KEY (virtual_component_id) REFERENCES virtual_components(id),
  CONSTRAINT bom_lines_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT bom_lines_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  -- C-03: exactly one of sku_id or virtual_component_id must be set
  CONSTRAINT bom_lines_exactly_one_ref_check
    CHECK (
      (sku_id IS NOT NULL AND virtual_component_id IS NULL) OR
      (sku_id IS NULL AND virtual_component_id IS NOT NULL)
    ),
  -- C-01: quantity must be positive
  CONSTRAINT bom_lines_quantity_check
    CHECK (quantity > 0),
  CONSTRAINT bom_lines_line_type_check
    CHECK (line_type IN ('sku', 'virtual_component'))
);

CREATE TRIGGER trg_bom_lines_updated_at
  BEFORE UPDATE ON bom_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE bom_lines IS
  'Single ingredient in a BOM Version recipe. Self-referencing tree via parent_line_id (ADR-004).';
COMMENT ON COLUMN bom_lines.parent_line_id IS
  'NULL = root-level line. Self-reference for tree structure. Cycle detection at write time (ADR-106).';
COMMENT ON COLUMN bom_lines.is_reference_only IS
  'If true: shown in BOM structure but excluded from cost rollup calculation.';

-- ─── Deferred FK patch: manual_cost_adjustments.bom_version_id ───────────────
-- Stub was created in M-013. bom_versions now exists.
ALTER TABLE manual_cost_adjustments
  ADD CONSTRAINT manual_cost_adjustments_bom_version_id_fkey
  FOREIGN KEY (bom_version_id) REFERENCES bom_versions(id);

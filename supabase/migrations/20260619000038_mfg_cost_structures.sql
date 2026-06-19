-- ═══════════════════════════════════════════════════════════════════════════════
-- M-038: Manufacturing Cost Structures
-- Enables BOM_PLUS_PROCESS and PROCESS_ONLY costing modes for manufactured SKUs.
-- Process steps (Turning, Coating, etc.) are represented by service SKUs whose
-- costs come from the existing strategy engine (PRICE_LIST, LAST_PURCHASE, etc.).
--
-- New tables:
--   manufacturing_cost_structures  — versioned structure per SKU, defines mode
--   mfg_cost_elements              — ordered process/material elements per structure
--
-- Modified:
--   site_cost_builds.default_strategy  CHECK — adds MFG_COST_ROLLUP
--   site_cost_builds.status            CHECK — adds complete_with_warnings
--   site_cost_build_lines              — adds process_cost_breakdown JSONB
--   audit_log.event_type               CHECK — adds mfg structure events
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. manufacturing_cost_structures ─────────────────────────────────────────
-- One record per SKU per version. Only one version may be active per SKU at a time
-- (enforced by partial unique index below).

CREATE TABLE IF NOT EXISTS manufacturing_cost_structures (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id),
  sku_id          uuid        NOT NULL REFERENCES skus(id),
  version_number  integer     NOT NULL DEFAULT 1,
  effective_date  date        NOT NULL,
  name            text        NOT NULL,
  mode            text        NOT NULL,
  is_active       boolean     NOT NULL DEFAULT false,
  notes           text,
  created_by      uuid        NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid        NOT NULL REFERENCES profiles(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT manufacturing_cost_structures_pkey PRIMARY KEY (id),
  CONSTRAINT mcs_mode_check CHECK (mode IN ('BOM_PLUS_PROCESS', 'PROCESS_ONLY')),
  CONSTRAINT mcs_version_positive CHECK (version_number > 0),
  CONSTRAINT mcs_org_sku_version_unique UNIQUE (organization_id, sku_id, version_number)
);

-- Only one active version per SKU per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcs_one_active_per_sku
  ON manufacturing_cost_structures (organization_id, sku_id)
  WHERE is_active = true;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_mcs_org        ON manufacturing_cost_structures (organization_id);
CREATE INDEX IF NOT EXISTS idx_mcs_org_sku    ON manufacturing_cost_structures (organization_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_mcs_sku_active ON manufacturing_cost_structures (sku_id, is_active);

-- RLS
ALTER TABLE manufacturing_cost_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY mcs_select ON manufacturing_cost_structures
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY mcs_insert ON manufacturing_cost_structures
  FOR INSERT WITH CHECK (
    organization_id = auth_org_id()
    AND auth_has_role(ARRAY['cost_analyst', 'admin'])
  );

CREATE POLICY mcs_update ON manufacturing_cost_structures
  FOR UPDATE USING (organization_id = auth_org_id())
  WITH CHECK (
    organization_id = auth_org_id()
    AND auth_has_role(ARRAY['cost_analyst', 'admin'])
  );

-- ── 2. mfg_cost_elements ─────────────────────────────────────────────────────
-- Ordered cost elements within a structure version.
-- Service/process elements MUST reference a service SKU (reference_sku_id NOT NULL
-- when cost_source != 'FIXED'). FIXED elements use fixed_cost + fixed_currency.

CREATE TABLE IF NOT EXISTS mfg_cost_elements (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id),
  structure_id     uuid        NOT NULL REFERENCES manufacturing_cost_structures(id) ON DELETE CASCADE,
  sequence         integer     NOT NULL,
  element_type     text        NOT NULL,
  process_category text        NOT NULL DEFAULT 'OTHER',
  name             text        NOT NULL,
  supplier_id      uuid        REFERENCES suppliers(id),
  reference_sku_id uuid        REFERENCES skus(id),
  quantity         numeric     NOT NULL DEFAULT 1,
  cost_source      text        NOT NULL,
  fixed_cost       numeric,
  fixed_currency   text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mfg_cost_elements_pkey PRIMARY KEY (id),

  CONSTRAINT mce_element_type_check CHECK (element_type IN (
    'MATERIAL', 'SUBCONTRACT_PROCESS', 'OVERHEAD', 'MANUAL'
  )),
  CONSTRAINT mce_process_category_check CHECK (process_category IN (
    'MACHINING', 'SURFACE_TREATMENT', 'STERILIZATION',
    'PACKAGING', 'INSPECTION', 'ASSEMBLY', 'OTHER'
  )),
  CONSTRAINT mce_cost_source_check CHECK (cost_source IN (
    'FIXED', 'PRICE_LIST', 'LAST_PURCHASE', 'AVERAGE_PURCHASE'
  )),
  CONSTRAINT mce_sequence_positive  CHECK (sequence > 0),
  CONSTRAINT mce_quantity_positive  CHECK (quantity > 0),

  -- FIXED elements must carry cost + currency; non-FIXED must reference a SKU
  CONSTRAINT mce_fixed_requires_cost CHECK (
    cost_source != 'FIXED' OR (fixed_cost IS NOT NULL AND fixed_currency IS NOT NULL)
  ),
  CONSTRAINT mce_non_fixed_requires_sku CHECK (
    cost_source = 'FIXED' OR reference_sku_id IS NOT NULL
  ),
  CONSTRAINT mce_fixed_currency_len  CHECK (fixed_currency IS NULL OR char_length(fixed_currency) = 3),
  CONSTRAINT mce_fixed_cost_nonneg   CHECK (fixed_cost IS NULL OR fixed_cost >= 0),

  UNIQUE (structure_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_mce_structure     ON mfg_cost_elements (structure_id, sequence);
CREATE INDEX IF NOT EXISTS idx_mce_org           ON mfg_cost_elements (organization_id);
CREATE INDEX IF NOT EXISTS idx_mce_reference_sku ON mfg_cost_elements (reference_sku_id)
  WHERE reference_sku_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mce_supplier      ON mfg_cost_elements (supplier_id)
  WHERE supplier_id IS NOT NULL;

-- RLS
ALTER TABLE mfg_cost_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY mce_select ON mfg_cost_elements
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY mce_insert ON mfg_cost_elements
  FOR INSERT WITH CHECK (
    organization_id = auth_org_id()
    AND auth_has_role(ARRAY['cost_analyst', 'admin'])
  );

CREATE POLICY mce_update ON mfg_cost_elements
  FOR UPDATE USING (organization_id = auth_org_id())
  WITH CHECK (
    organization_id = auth_org_id()
    AND auth_has_role(ARRAY['cost_analyst', 'admin'])
  );

CREATE POLICY mce_delete ON mfg_cost_elements
  FOR DELETE USING (
    organization_id = auth_org_id()
    AND auth_has_role(ARRAY['cost_analyst', 'admin'])
  );

-- ── 3. site_cost_build_lines: process_cost_breakdown ─────────────────────────

ALTER TABLE site_cost_build_lines
  ADD COLUMN IF NOT EXISTS process_cost_breakdown jsonb;

-- ── 4. site_cost_builds: extend strategy CHECK ───────────────────────────────

ALTER TABLE site_cost_builds DROP CONSTRAINT IF EXISTS site_cost_builds_strategy_check;

ALTER TABLE site_cost_builds ADD CONSTRAINT site_cost_builds_strategy_check
  CHECK (default_strategy IN (
    'PRICE_LIST',
    'LAST_PURCHASE',
    'AVERAGE_PURCHASE',
    'BOM_ROLLUP',
    'MFG_COST_ROLLUP',
    'MAKE_OR_BUY',
    'MANUAL_OVERRIDE',
    'STANDARD_COST',
    'CONTRACT_PRICE',
    'CUSTOMER_SPECIFIC_COST'
  ));

-- ── 5. site_cost_builds: extend status CHECK ─────────────────────────────────

ALTER TABLE site_cost_builds DROP CONSTRAINT IF EXISTS site_cost_builds_status_check;

ALTER TABLE site_cost_builds ADD CONSTRAINT site_cost_builds_status_check
  CHECK (status IN (
    'draft', 'running', 'complete', 'complete_with_warnings', 'failed', 'archived'
  ));

-- ── 6. audit_log: extend event_type ─────────────────────────────────────────

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_event_type_check;

ALTER TABLE audit_log ADD CONSTRAINT audit_log_event_type_check
  CHECK (event_type IN (
    'data_insert', 'data_update', 'data_delete',
    'bom_approved', 'bom_rejected', 'bom_superseded',
    'snapshot_approved',
    'rule_activated', 'rule_deactivated',
    'exception_approved', 'exception_rejected',
    'calculation_executed', 'valuation_executed',
    'user_invited', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'cost_set_locked', 'adjustment_approved',
    'site_archived', 'site_delete_requested', 'site_restored', 'site_deleted',
    'price_list_version_created',
    'cost_build_approved', 'cost_build_locked',
    'warehouse_created', 'warehouse_updated', 'warehouse_archived', 'warehouse_restored',
    'fx_rate_upserted',
    'import_committed',
    'user_login', 'user_logout',
    'purchase_history_imported',
    -- M-038
    'mfg_structure_created',
    'mfg_structure_updated',
    'mfg_structure_activated'
  ));

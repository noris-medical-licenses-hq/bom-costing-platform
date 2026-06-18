-- M-013: manual_cost_adjustments
-- Explicit, approved cost overrides for situations that cannot be expressed as Cost Set Items
-- or Cost Rules (e.g., one-time contractual adjustments, dispute settlement prices).
-- OQ-04 resolved: manual_cost_adjustments apply at HIGHEST precedence (Priority 0, before Cost Set Items).
-- Requires approval before taking effect. Use should be minimized and reviewed regularly.

CREATE TABLE manual_cost_adjustments (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL,
  sku_id                uuid        NOT NULL,
  cost_set_id           uuid        NULL,
  bom_version_id        uuid        NULL,
  adjustment_type       text        NOT NULL,
  adjustment_value      numeric     NOT NULL,
  adjustment_currency   text        NULL,
  reason                text        NOT NULL,
  status                text        NOT NULL DEFAULT 'requested',
  approved_by           uuid        NULL,
  approved_at           timestamptz NULL,
  effective_from        date        NOT NULL,
  effective_to          date        NULL,
  created_by            uuid        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid        NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT manual_cost_adjustments_pkey
    PRIMARY KEY (id),
  CONSTRAINT manual_cost_adjustments_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT manual_cost_adjustments_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES skus(id),
  CONSTRAINT manual_cost_adjustments_cost_set_id_fkey
    FOREIGN KEY (cost_set_id) REFERENCES cost_sets(id),
  CONSTRAINT manual_cost_adjustments_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id),
  CONSTRAINT manual_cost_adjustments_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT manual_cost_adjustments_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  -- bom_version_id FK added in M-015 after bom_versions exists
  CONSTRAINT manual_cost_adjustments_adjustment_type_check
    CHECK (adjustment_type IN ('fixed_override', 'percentage_addition', 'fixed_addition')),
  CONSTRAINT manual_cost_adjustments_status_check
    CHECK (status IN ('requested', 'approved', 'active', 'expired', 'rejected')),
  CONSTRAINT manual_cost_adjustments_currency_check
    CHECK (adjustment_currency IS NULL OR char_length(adjustment_currency) = 3),
  CONSTRAINT manual_cost_adjustments_reason_check
    CHECK (char_length(trim(reason)) > 0),
  CONSTRAINT manual_cost_adjustments_effective_dates_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TRIGGER trg_manual_cost_adjustments_updated_at
  BEFORE UPDATE ON manual_cost_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE manual_cost_adjustments IS
  'Explicit approved overrides at Priority 0 (above all Cost Set Items). Use minimally; requires approval.';
COMMENT ON COLUMN manual_cost_adjustments.reason IS
  'Required non-empty (C-19). Documents why the manual adjustment is necessary.';
COMMENT ON COLUMN manual_cost_adjustments.cost_set_id IS
  'NULL = applies in any cost set context. Set to restrict to a specific cost set.';
COMMENT ON COLUMN manual_cost_adjustments.bom_version_id IS
  'FK constraint added in M-015 (deferred: bom_versions does not exist yet). NULL = applies to all BOMs.';

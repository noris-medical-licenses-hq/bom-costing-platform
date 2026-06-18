-- M-011: cost_items
-- Single cost parameter within a Cost Set. Defines a value, how it applies, and to what.
-- Scope resolution (most specific wins): sku > subfamily > family > supplier > supplier_country > global
-- OQ-01 resolved: MVP enforces single currency at app layer (base_currency match via Zod).

CREATE TABLE cost_items (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  cost_set_id      uuid        NOT NULL,
  item_type        text        NOT NULL,
  scope_type       text        NOT NULL,
  scope_id         uuid        NULL,
  scope_code       text        NULL,
  value            numeric     NOT NULL,
  value_unit       text        NOT NULL,
  currency         text        NULL,
  applies_to       text        NOT NULL,
  effective_from   date        NOT NULL,
  effective_to     date        NULL,
  is_active        boolean     NOT NULL DEFAULT true,
  notes            text        NULL,
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cost_items_pkey
    PRIMARY KEY (id),
  CONSTRAINT cost_items_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT cost_items_cost_set_id_fkey
    FOREIGN KEY (cost_set_id) REFERENCES cost_sets(id),
  CONSTRAINT cost_items_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT cost_items_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT cost_items_item_type_check
    CHECK (item_type IN (
      'material_price', 'labor_rate', 'overhead_pct', 'freight_pct',
      'duty_rate', 'tooling_fixed', 'scrap_rate', 'custom'
    )),
  CONSTRAINT cost_items_scope_type_check
    CHECK (scope_type IN (
      'global', 'family', 'subfamily', 'sku',
      'supplier', 'supplier_country', 'virtual_component'
    )),
  CONSTRAINT cost_items_value_unit_check
    CHECK (value_unit IN (
      'currency_amount', 'percentage', 'rate_per_hour', 'rate_per_unit'
    )),
  CONSTRAINT cost_items_applies_to_check
    CHECK (applies_to IN (
      'per_unit', 'material_subtotal', 'labor_subtotal', 'bom_total'
    )),
  CONSTRAINT cost_items_currency_check
    CHECK (currency IS NULL OR char_length(currency) = 3),
  CONSTRAINT cost_items_effective_dates_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- scope_id is a polymorphic FK depending on scope_type:
--   family          → families.id
--   subfamily       → subfamilies.id
--   sku             → skus.id
--   supplier        → suppliers.id
--   virtual_component → virtual_components.id
--   global/supplier_country → scope_id must be NULL; scope_code used for country
-- Enforced at application layer (polymorphic FK cannot be a DB constraint).

CREATE TRIGGER trg_cost_items_updated_at
  BEFORE UPDATE ON cost_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE cost_items IS
  'Single cost parameter within a Cost Set. Primary mechanism for assigning costs to SKUs and categories.';
COMMENT ON COLUMN cost_items.scope_type IS
  'Precedence: sku(1) > subfamily(2) > family(3) > supplier(4) > supplier_country(5) > global(6)';
COMMENT ON COLUMN cost_items.scope_id IS
  'Polymorphic FK — target table varies by scope_type. NULL for global and supplier_country scopes.';
COMMENT ON COLUMN cost_items.scope_code IS
  'Used when scope_type = supplier_country: ISO 3166-1 alpha-2 country code.';
COMMENT ON COLUMN cost_items.currency IS
  'Required when value_unit = currency_amount. MVP: must match cost_set.base_currency (enforced at app layer).';

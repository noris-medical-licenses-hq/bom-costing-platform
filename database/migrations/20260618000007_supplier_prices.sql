-- M-007: supplier_prices
-- Time-ranged unit price for a SKU from a specific supplier.
-- Priority 6 (lowest) in the cost precedence hierarchy.
-- Historical prices are retained by closing effective_to; never deleted.
-- Schema included in MVP; supplier price management UI is Phase 2.

CREATE TABLE supplier_prices (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL,
  sku_id             uuid        NOT NULL,
  supplier_id        uuid        NOT NULL,
  unit_price         numeric     NOT NULL,
  currency           text        NOT NULL,
  moq                integer     NULL,
  price_break_qty    integer     NULL,
  effective_from     date        NOT NULL,
  effective_to       date        NULL,
  is_quoted          boolean     NOT NULL DEFAULT false,
  quote_reference    text        NULL,
  quote_valid_until  date        NULL,
  created_by         uuid        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid        NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT supplier_prices_pkey
    PRIMARY KEY (id),
  CONSTRAINT supplier_prices_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT supplier_prices_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES skus(id),
  CONSTRAINT supplier_prices_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT supplier_prices_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT supplier_prices_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT supplier_prices_unit_price_check
    CHECK (unit_price > 0),
  CONSTRAINT supplier_prices_currency_check
    CHECK (char_length(currency) = 3),
  CONSTRAINT supplier_prices_moq_check
    CHECK (moq IS NULL OR moq > 0),
  CONSTRAINT supplier_prices_effective_dates_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TRIGGER trg_supplier_prices_updated_at
  BEFORE UPDATE ON supplier_prices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE supplier_prices IS
  'Time-ranged unit price for a SKU from a specific supplier. Priority 6 in cost precedence hierarchy.';
COMMENT ON COLUMN supplier_prices.effective_to IS
  'NULL means this price is still current. Close by setting effective_to to supersede; never DELETE.';
COMMENT ON COLUMN supplier_prices.moq IS
  'Minimum order quantity. Validated at write time: price_break_qty must be >= moq if both set.';
-- Validation V-SP-001 (non-overlapping dates for same sku_id+supplier_id) is enforced at app layer.
-- Active price resolution: effective_from <= target_date AND (effective_to IS NULL OR effective_to >= target_date)

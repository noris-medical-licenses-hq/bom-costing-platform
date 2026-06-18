-- ═══════════════════════════════════════════════════════════════════════════════
-- M-030: Site Cost Build Architecture
-- Business flow: Site → Cost Build → Cost Set → Inventory Valuation
--
-- Primary entity: site_cost_builds
-- Supporting:     site_cost_build_lines (per-SKU trace), sku_cost_overrides
-- Modified:       skus (item_cost_type), cost_sets (site_id, source_build_id, is_frozen),
--                 calculation_traces (site_id, cost_strategy, source_type, source_reference, fallback_path)
--
-- Extensibility: default_strategy is a text column with a CHECK constraint.
--   To add STANDARD_COST / CONTRACT_PRICE etc., extend the constraint only.
--   No new tables or columns required.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. item_cost_type on skus ─────────────────────────────────────────────────
-- Determines which cost resolution strategies are valid for this SKU.

ALTER TABLE skus ADD COLUMN IF NOT EXISTS item_cost_type text;

UPDATE skus
SET item_cost_type = CASE
  WHEN item_type = 'service'      THEN 'SERVICE'
  WHEN make_buy  = 'make'         THEN 'MANUFACTURED'
  WHEN make_buy  = 'make_or_buy'  THEN 'MAKE_OR_BUY'
  WHEN make_buy  = 'buy'          THEN 'PURCHASED'
  ELSE 'PURCHASED'
END
WHERE item_cost_type IS NULL;

ALTER TABLE skus ALTER COLUMN item_cost_type SET NOT NULL;
ALTER TABLE skus ALTER COLUMN item_cost_type SET DEFAULT 'PURCHASED';

ALTER TABLE skus ADD CONSTRAINT skus_item_cost_type_check
  CHECK (item_cost_type IN (
    'PURCHASED',
    'MANUFACTURED',
    'MAKE_OR_BUY',
    'SERVICE',
    'MANUAL'
  ));

-- ── 2. Extend cost_sets ───────────────────────────────────────────────────────

ALTER TABLE cost_sets
  ADD COLUMN IF NOT EXISTS site_id       uuid REFERENCES sites(id),
  ADD COLUMN IF NOT EXISTS is_frozen     boolean NOT NULL DEFAULT false;
-- source_build_id FK added below, after site_cost_builds table exists

-- ── 3. Extend calculation_traces ──────────────────────────────────────────────

ALTER TABLE calculation_traces
  ADD COLUMN IF NOT EXISTS site_id          uuid REFERENCES sites(id),
  ADD COLUMN IF NOT EXISTS cost_strategy    text,
  ADD COLUMN IF NOT EXISTS source_type      text,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS fallback_path    jsonb;

-- ── 4. site_cost_builds ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_cost_builds (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL REFERENCES organizations(id),
  site_id               uuid        NOT NULL REFERENCES sites(id),
  name                  text        NOT NULL,
  description           text,
  default_strategy      text        NOT NULL,
  status                text        NOT NULL DEFAULT 'draft',
  cost_set_id           uuid        REFERENCES cost_sets(id),
  source_bom_version_id uuid        REFERENCES bom_versions(id),
  parameters_snapshot   jsonb,
  line_count            int         NOT NULL DEFAULT 0,
  error_count           int         NOT NULL DEFAULT 0,
  built_at              timestamptz,
  built_by              uuid        REFERENCES auth.users(id),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        REFERENCES auth.users(id),

  CONSTRAINT site_cost_builds_strategy_check CHECK (default_strategy IN (
    'PRICE_LIST',
    'LAST_PURCHASE',
    'AVERAGE_PURCHASE',
    'BOM_ROLLUP',
    'MAKE_OR_BUY',
    'MANUAL_OVERRIDE',
    'STANDARD_COST',
    'CONTRACT_PRICE',
    'CUSTOMER_SPECIFIC_COST'
  )),
  CONSTRAINT site_cost_builds_status_check CHECK (status IN (
    'draft', 'running', 'complete', 'failed', 'archived'
  ))
);

-- ── 5. FK from cost_sets to site_cost_builds (circular — added after table) ──

ALTER TABLE cost_sets
  ADD COLUMN IF NOT EXISTS source_build_id uuid REFERENCES site_cost_builds(id);

-- ── 6. site_cost_build_lines ──────────────────────────────────────────────────
-- One row per SKU per build: the complete cost trace for that SKU in that run.

CREATE TABLE IF NOT EXISTS site_cost_build_lines (
  id                   uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  site_cost_build_id   uuid           NOT NULL REFERENCES site_cost_builds(id) ON DELETE CASCADE,
  organization_id      uuid           NOT NULL REFERENCES organizations(id),
  sku_id               uuid           NOT NULL REFERENCES skus(id),
  item_cost_type       text           NOT NULL,
  cost_strategy_used   text           NOT NULL,
  source_record_type   text,
  source_record_id     uuid,
  source_reference     text,
  fallback_path        jsonb          NOT NULL DEFAULT '[]',
  resolved_cost        numeric(18,6)  NOT NULL,
  currency             text           NOT NULL DEFAULT 'USD',
  effective_from       date,
  created_at           timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT site_cost_build_lines_item_cost_type_check CHECK (item_cost_type IN (
    'PURCHASED', 'MANUFACTURED', 'MAKE_OR_BUY', 'SERVICE', 'MANUAL'
  )),
  UNIQUE (site_cost_build_id, sku_id)
);

-- ── 7. sku_cost_overrides ─────────────────────────────────────────────────────
-- Per-site per-SKU strategy override (e.g., SKU B at Germany site = LAST_PURCHASE
-- even though site default = PRICE_LIST).

CREATE TABLE IF NOT EXISTS sku_cost_overrides (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES organizations(id),
  site_id              uuid        NOT NULL REFERENCES sites(id),
  sku_id               uuid        NOT NULL REFERENCES skus(id),
  preferred_strategy   text        NOT NULL,
  fallback_strategies  jsonb       NOT NULL DEFAULT '[]',
  active               boolean     NOT NULL DEFAULT true,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, site_id, sku_id)
);

-- ── 8. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS site_cost_builds_org_site_idx
  ON site_cost_builds (organization_id, site_id);
CREATE INDEX IF NOT EXISTS site_cost_builds_status_idx
  ON site_cost_builds (organization_id, status);
CREATE INDEX IF NOT EXISTS site_cost_builds_cost_set_idx
  ON site_cost_builds (cost_set_id);

CREATE INDEX IF NOT EXISTS site_cost_build_lines_build_idx
  ON site_cost_build_lines (site_cost_build_id);
CREATE INDEX IF NOT EXISTS site_cost_build_lines_sku_idx
  ON site_cost_build_lines (organization_id, sku_id);

CREATE INDEX IF NOT EXISTS sku_cost_overrides_lookup_idx
  ON sku_cost_overrides (organization_id, site_id, sku_id);

CREATE INDEX IF NOT EXISTS cost_sets_site_idx
  ON cost_sets (site_id)
  WHERE site_id IS NOT NULL;

-- ── 9. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE site_cost_builds   ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_cost_build_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_cost_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON site_cost_builds
  FOR ALL USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation" ON site_cost_build_lines
  FOR ALL USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation" ON sku_cost_overrides
  FOR ALL USING (organization_id = auth_org_id());

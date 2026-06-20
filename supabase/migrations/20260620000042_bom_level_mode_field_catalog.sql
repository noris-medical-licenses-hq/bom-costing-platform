-- M-042: BOM Level-Mode Field Catalog Entries
--
-- Seeds import_field_definitions with the three fields required for
-- level-mode BOM imports (BG-021/022). Without these rows the mapping UI
-- does not offer Level, SKU, or Description as target fields, making
-- level-mode invisible to end users.
--
-- Fields added for import_type = 'bom_lines':
--   sku         — part number of each row (level-mode equivalent of child_sku)
--   description — written to auto-created SKU when SKU does not exist in master
--   level       — tree depth integer: 0 = root / finished product, 1 = direct child, etc.
--
-- ON CONFLICT DO NOTHING: idempotent — safe to run multiple times.

INSERT INTO import_field_definitions
  (import_type, field_key, display_name, description,
   data_type, field_category, required_by_default,
   is_system, is_deprecated, sort_order, active)
VALUES
  ('bom_lines', 'sku',
   'SKU',
   'Part number of this row — used in level-mode BOM import as the component identifier.',
   'text', 'structure', false, true, false, 5, true),

  ('bom_lines', 'description',
   'Description',
   'Item description — written to the auto-created SKU master record when this SKU does not already exist.',
   'text', 'core', false, true, false, 7, true),

  ('bom_lines', 'level',
   'Level',
   'BOM tree depth: 0 = root / finished product, 1 = direct child, 2 = grandchild, etc. Enables multi-level BOM import from a single flat file.',
   'integer', 'structure', false, true, false, 35, true)

ON CONFLICT (import_type, field_key) DO NOTHING;

-- Synonyms for auto-column-mapping at upload time
INSERT INTO import_field_synonyms (import_type, field_key, synonym, is_global)
VALUES
  ('bom_lines', 'level', 'Level',       true),
  ('bom_lines', 'level', 'BOM Level',   true),
  ('bom_lines', 'level', 'Depth',       true),
  ('bom_lines', 'level', 'Indent',      true),
  ('bom_lines', 'level', 'Hierarchy',   true),
  ('bom_lines', 'sku',   'SKU',         true),
  ('bom_lines', 'sku',   'Part Number', true),
  ('bom_lines', 'sku',   'Item',        true),
  ('bom_lines', 'sku',   'Component',   true)
ON CONFLICT DO NOTHING;

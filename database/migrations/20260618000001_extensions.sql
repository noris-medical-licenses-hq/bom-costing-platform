-- M-001: PostgreSQL extensions and shared utility functions
-- Must run first. All subsequent migrations depend on these helpers.

-- Core extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Shared trigger: auto-update updated_at on any table that has the column.
-- Applied to every business table via individual triggers.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS
  'Generic BEFORE UPDATE trigger function that sets updated_at = NOW(). Applied to all business tables.';

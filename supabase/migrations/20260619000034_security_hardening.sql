-- M-034: Sprint 2A Security Hardening
-- Scope: auth helper function hardening only.
-- All other Sprint 2A fixes are API-layer TypeScript changes (no schema impact).
--
-- Changes:
--   1. auth_org_id() — add is_active = true guard so deactivated users cannot
--      satisfy any RLS org-isolation policy (previously they could still SELECT
--      across all org data until their JWT expired).

CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM   profiles
  WHERE  id        = auth.uid()
  AND    is_active = true
$$;

COMMENT ON FUNCTION auth_org_id() IS
  'Returns current active user org_id. Deactivated users return NULL, failing all org-isolation RLS policies.';

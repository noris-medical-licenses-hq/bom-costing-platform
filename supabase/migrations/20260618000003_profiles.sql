-- M-003: profiles table + auth helper functions
-- profiles extends auth.users with organization membership, display name, and role.
-- One profile per auth user per organization. Cross-org users not supported in MVP.

CREATE TABLE profiles (
  id               uuid        NOT NULL,
  organization_id  uuid        NOT NULL,
  full_name        text        NOT NULL,
  email            text        NOT NULL,
  role             text        NOT NULL DEFAULT 'viewer',
  is_active        boolean     NOT NULL DEFAULT true,
  last_seen_at     timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profiles_pkey
    PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT profiles_org_email_key
    UNIQUE (organization_id, email),
  CONSTRAINT profiles_role_check
    CHECK (role IN ('viewer', 'editor', 'cost_analyst', 'procurement', 'approver', 'admin'))
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE profiles IS
  'Extends auth.users. Stores org membership, display name, and role for every authenticated user.';
COMMENT ON COLUMN profiles.id IS
  'Matches auth.users.id (Supabase auth UID). Not a generated UUID — set by Supabase on signup.';
COMMENT ON COLUMN profiles.email IS
  'Denormalized from auth.users for UI display and uniqueness enforcement within the org.';
COMMENT ON COLUMN profiles.is_active IS
  'false = deactivated user. Blocks login but preserves all historical references (audit, created_by, etc.).';
COMMENT ON COLUMN profiles.last_seen_at IS
  'Updated only on session creation (not per-request) to avoid high write frequency on this table.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Auth helper functions (SECURITY DEFINER = bypass RLS to read own profile)
-- Used in RLS policies throughout the schema.
-- ─────────────────────────────────────────────────────────────────────────────

-- Returns the organization_id of the currently authenticated user.
CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM   profiles
  WHERE  id = auth.uid()
$$;

-- Returns the role of the currently authenticated user (or NULL if no active profile).
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM   profiles
  WHERE  id = auth.uid()
  AND    is_active = true
$$;

-- Returns true if the current user has one of the supplied roles.
CREATE OR REPLACE FUNCTION auth_has_role(required_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   profiles
    WHERE  id        = auth.uid()
    AND    is_active = true
    AND    role      = ANY(required_roles)
  )
$$;

COMMENT ON FUNCTION auth_org_id()           IS 'Returns current user org_id. Used in all RLS WHERE clauses.';
COMMENT ON FUNCTION auth_user_role()        IS 'Returns current user role string. Used in RLS write policies.';
COMMENT ON FUNCTION auth_has_role(text[])   IS 'True if current user holds one of the supplied roles.';

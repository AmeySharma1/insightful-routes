CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE app_role AS ENUM ('admin', 'operator', 'viewer');
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'viewer',
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_sessions_user_idx ON refresh_sessions(user_id);
CREATE INDEX IF NOT EXISTS refresh_sessions_family_idx ON refresh_sessions(family_id);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'password_reset')),
  code_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_challenges_lookup_idx ON otp_challenges(email, purpose, created_at DESC);

REVOKE ALL ON app_users, profiles, user_roles, refresh_sessions, otp_challenges FROM PUBLIC;

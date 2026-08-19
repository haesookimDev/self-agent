CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('windows','macos','android','ios','web')),
  kind text NOT NULL CHECK (kind IN ('executor','controller')),
  capabilities jsonb NOT NULL,
  online boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL,
  credential_hash text NOT NULL
);
CREATE INDEX IF NOT EXISTS devices_user_idx ON devices(user_id);

CREATE TABLE IF NOT EXISTS commands (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  target_device_id uuid NOT NULL REFERENCES devices(id),
  tool text NOT NULL,
  args jsonb NOT NULL,
  idempotency_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  risk text NOT NULL CHECK (risk IN ('read','write','destructive','privileged')),
  status text NOT NULL CHECK (status IN ('queued','awaiting_approval','dispatched','running','succeeded','failed','expired','cancelled')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS commands_dispatch_idx ON commands(target_device_id,status,expires_at);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY,
  command_id uuid NOT NULL UNIQUE REFERENCES commands(id),
  user_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('pending','approved','denied')),
  biometric_required boolean NOT NULL,
  biometric_verified boolean NOT NULL DEFAULT false,
  decided_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS action_results (
  command_id uuid PRIMARY KEY REFERENCES commands(id),
  status text NOT NULL,
  output jsonb,
  error text,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_items (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('preference','fact','instruction','summary')),
  content text NOT NULL,
  source text NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  embedding vector,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_user_idx ON memory_items(user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  run_id uuid,
  kind text NOT NULL,
  score real,
  content text,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS improvement_candidates (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('memory','prompt','tool_policy')),
  title text NOT NULL,
  before_value text NOT NULL,
  after_value text NOT NULL,
  rationale text NOT NULL,
  status text NOT NULL,
  evaluation_score real,
  safety_passed boolean,
  created_at timestamptz NOT NULL,
  activated_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_candidate_per_kind
  ON improvement_candidates(user_id,kind) WHERE status='active';

CREATE TABLE IF NOT EXISTS sync_roots (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  device_id uuid NOT NULL REFERENCES devices(id),
  display_name text NOT NULL,
  local_path text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS file_versions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  device_id uuid NOT NULL REFERENCES devices(id),
  root_id uuid NOT NULL,
  relative_path text NOT NULL,
  base_version_id uuid,
  sha256 char(64) NOT NULL,
  size bigint NOT NULL CHECK (size >= 0),
  object_key text NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  conflict boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS file_versions_head_idx
  ON file_versions(user_id,root_id,relative_path,created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  device_id uuid,
  command_id uuid,
  kind text NOT NULL,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_events(user_id,created_at DESC);

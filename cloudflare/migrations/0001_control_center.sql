PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'art/control-center-organization/v1'),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  canton TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE digital_properties (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'art/control-center-property/v1'),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1))
);

CREATE TABLE assessment_cases (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'art/control-center-case/v1'),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  property_id TEXT NOT NULL REFERENCES digital_properties(id),
  kind TEXT NOT NULL CHECK (kind = 'accessibility_assessment'),
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'art/control-center-run/v1'),
  case_id TEXT NOT NULL REFERENCES assessment_cases(id),
  property_id TEXT NOT NULL REFERENCES digital_properties(id),
  kind TEXT NOT NULL CHECK (kind IN ('scan', 'journeys', 'assessment')),
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  idempotency_key TEXT NOT NULL UNIQUE,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  engine_revision TEXT NOT NULL,
  execution_provider TEXT NOT NULL CHECK (execution_provider IN ('nebuchadnezzar_worker', 'github_actions')),
  stage TEXT NOT NULL DEFAULT 'queued' CHECK (stage IN ('queued', 'claimed', 'scout', 'probes', 'journeys', 'semantic', 'uploading', 'finalizing', 'completed')),
  execution_policy_json TEXT NOT NULL,
  worker_id TEXT,
  lease_token_sha256 TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  progress_json TEXT NOT NULL DEFAULT '{}',
  error TEXT
);
CREATE INDEX runs_case_requested_at ON runs(case_id, requested_at DESC);
CREATE INDEX runs_provider_queue ON runs(execution_provider, state, requested_at);
CREATE INDEX runs_lease_expiry ON runs(state, lease_expires_at);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'art/control-center-artifact/v1'),
  run_id TEXT NOT NULL REFERENCES runs(id),
  kind TEXT NOT NULL,
  content_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(run_id, kind, sha256)
);
CREATE INDEX artifacts_run_created_at ON artifacts(run_id, created_at);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT,
  email TEXT,
  role TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE outreach (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES assessment_cases(id),
  contact_id TEXT REFERENCES contacts(id),
  state TEXT NOT NULL CHECK (state IN ('draft', 'approved', 'sent', 'cancelled')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'art/control-center-audit-event/v1'),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_events_object ON audit_events(object_type, object_id, occurred_at);

CREATE TABLE operators (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 0 CHECK (can_read IN (0, 1)),
  can_execute INTEGER NOT NULL DEFAULT 0 CHECK (can_execute IN (0, 1)),
  can_outreach INTEGER NOT NULL DEFAULT 0 CHECK (can_outreach IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO operators
  (id, email, display_name, can_read, can_execute, can_outreach, active, created_at, updated_at)
VALUES
  ('operator_achim_imboden', 'achim.imboden@bridge-work.ai', 'Achim Imboden', 1, 1, 0, 1,
   '2026-09-29T00:00:00.000Z', '2026-09-29T00:00:00.000Z');

CREATE TABLE runner_agents (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('nebuchadnezzar_worker', 'github_actions')),
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_seen_at TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO runner_agents
  (id, provider, display_name, enabled, created_at, updated_at)
VALUES
  ('nebuchadnezzar', 'nebuchadnezzar_worker', 'Nebuchadnezzar', 1,
   '2026-09-29T00:00:00.000Z', '2026-09-29T00:00:00.000Z');

CREATE TABLE run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  worker_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('stage', 'throttle', 'backoff', 'lease', 'progress', 'partial')),
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX run_events_run_occurred_at ON run_events(run_id, occurred_at);

CREATE TABLE workflow_dispatches (
  run_id TEXT PRIMARY KEY REFERENCES runs(id),
  state TEXT NOT NULL CHECK (state IN ('dispatching', 'dispatched', 'failed')),
  github_run_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER artifacts_no_update
BEFORE UPDATE ON artifacts BEGIN SELECT RAISE(ABORT, 'artifacts are append-only'); END;
CREATE TRIGGER artifacts_no_delete
BEFORE DELETE ON artifacts BEGIN SELECT RAISE(ABORT, 'artifacts are append-only'); END;
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
CREATE TRIGGER run_events_no_update
BEFORE UPDATE ON run_events BEGIN SELECT RAISE(ABORT, 'run events are append-only'); END;
CREATE TRIGGER run_events_no_delete
BEFORE DELETE ON run_events BEGIN SELECT RAISE(ABORT, 'run events are append-only'); END;

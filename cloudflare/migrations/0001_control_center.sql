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
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  idempotency_key TEXT NOT NULL UNIQUE,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  engine_revision TEXT NOT NULL,
  error TEXT
);
CREATE INDEX runs_case_requested_at ON runs(case_id, requested_at DESC);

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

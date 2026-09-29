-- Per-host claim exclusion: at most one leased run per canonical host across all providers.
ALTER TABLE digital_properties ADD COLUMN host_key TEXT;

UPDATE digital_properties SET host_key = lower(
  CASE WHEN instr(substr(url, instr(url, '://') + 3), '/') > 0
    THEN substr(substr(url, instr(url, '://') + 3), 1, instr(substr(url, instr(url, '://') + 3), '/') - 1)
    ELSE substr(url, instr(url, '://') + 3) END)
WHERE host_key IS NULL;

CREATE TRIGGER digital_properties_host_key_insert
AFTER INSERT ON digital_properties WHEN NEW.host_key IS NULL BEGIN
  UPDATE digital_properties SET host_key = lower(
    CASE WHEN instr(substr(NEW.url, instr(NEW.url, '://') + 3), '/') > 0
      THEN substr(substr(NEW.url, instr(NEW.url, '://') + 3), 1, instr(substr(NEW.url, instr(NEW.url, '://') + 3), '/') - 1)
      ELSE substr(NEW.url, instr(NEW.url, '://') + 3) END)
  WHERE id = NEW.id;
END;

CREATE TRIGGER digital_properties_url_immutable
BEFORE UPDATE OF url, host_key ON digital_properties
WHEN OLD.host_key IS NOT NULL AND (NEW.url IS NOT OLD.url OR NEW.host_key IS NOT OLD.host_key) BEGIN
  SELECT RAISE(ABORT, 'property URL is canonical; create a new property instead');
END;

CREATE INDEX digital_properties_host_key ON digital_properties(host_key);
CREATE INDEX runs_property_state ON runs(property_id, state, lease_expires_at);

-- Harmless runner self-tests: exercise Access service auth, lease hashing and heartbeat
-- without touching the run queue or any external site.
CREATE TABLE runner_selftests (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES runner_agents(id),
  state TEXT NOT NULL CHECK (state IN ('claimed', 'completed')),
  engine_revision TEXT,
  lease_token_sha256 TEXT,
  lease_expires_at TEXT,
  heartbeats INTEGER NOT NULL DEFAULT 0 CHECK (heartbeats >= 0),
  created_at TEXT NOT NULL,
  heartbeat_at TEXT,
  completed_at TEXT
);
CREATE INDEX runner_selftests_worker_created_at ON runner_selftests(worker_id, created_at);

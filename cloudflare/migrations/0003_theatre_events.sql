-- Fine-grained theatre events (see theatre/events.schema.json), separate from the operational run_events.
-- id is the SSE Last-Event-ID cursor.
CREATE TABLE theatre_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  received_at TEXT NOT NULL
);
CREATE INDEX theatre_events_run ON theatre_events(run_id, id);
CREATE TRIGGER theatre_events_no_update
BEFORE UPDATE ON theatre_events BEGIN SELECT RAISE(ABORT, 'theatre events are append-only'); END;
CREATE TRIGGER theatre_events_no_delete
BEFORE DELETE ON theatre_events BEGIN SELECT RAISE(ABORT, 'theatre events are append-only'); END;

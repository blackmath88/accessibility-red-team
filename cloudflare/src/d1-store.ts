import { ArtifactSchema, RunSchema, type Artifact, type Run } from "../../src/control-center/contracts.js";
import type { ControlCenterStore } from "../../src/control-center/store.js";
import { assertRunTransition } from "../../src/control-center/state.js";

type RunRow = {
  id: string; case_id: string; property_id: string; kind: Run["kind"]; state: Run["state"];
  idempotency_key: string; requested_by: string; requested_at: string; started_at: string | null;
  completed_at: string | null; engine_revision: string; error: string | null;
};

type ArtifactRow = {
  id: string; run_id: string; kind: Artifact["kind"]; content_type: string; storage_key: string;
  sha256: string; bytes: number; created_at: string;
};

function runFromRow(row: RunRow): Run {
  return RunSchema.parse({
    schema: "art/control-center-run/v1", id: row.id, caseId: row.case_id,
    propertyId: row.property_id, kind: row.kind, state: row.state,
    idempotencyKey: row.idempotency_key, requestedBy: row.requested_by,
    requestedAt: row.requested_at, startedAt: row.started_at,
    completedAt: row.completed_at, engineRevision: row.engine_revision, error: row.error,
  });
}

function artifactFromRow(row: ArtifactRow): Artifact {
  return ArtifactSchema.parse({
    schema: "art/control-center-artifact/v1", id: row.id, runId: row.run_id,
    kind: row.kind, contentType: row.content_type, storageKey: row.storage_key,
    sha256: row.sha256, bytes: row.bytes, createdAt: row.created_at,
  });
}

export class D1ControlCenterStore implements ControlCenterStore {
  constructor(private readonly db: D1Database) {}

  async getRun(id: string): Promise<Run | null> {
    const row = await this.db.prepare("SELECT * FROM runs WHERE id = ?").bind(id).first<RunRow>();
    return row ? runFromRow(row) : null;
  }

  async findRunByIdempotencyKey(key: string): Promise<Run | null> {
    const row = await this.db.prepare("SELECT * FROM runs WHERE idempotency_key = ?").bind(key).first<RunRow>();
    return row ? runFromRow(row) : null;
  }

  async createRun(run: Run): Promise<void> {
    await this.db.prepare(`INSERT INTO runs
      (id, schema_version, case_id, property_id, kind, state, idempotency_key, requested_by,
       requested_at, started_at, completed_at, engine_revision, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(run.id, run.schema, run.caseId, run.propertyId, run.kind, run.state,
        run.idempotencyKey, run.requestedBy, run.requestedAt, run.startedAt,
        run.completedAt, run.engineRevision, run.error).run();
  }

  async updateRun(run: Run): Promise<void> {
    const current = await this.getRun(run.id);
    if (!current) throw new Error(`Unknown run: ${run.id}`);
    if (current.state !== run.state) assertRunTransition(current.state, run.state);
    const result = await this.db.prepare(`UPDATE runs SET state = ?, started_at = ?, completed_at = ?, error = ?
      WHERE id = ? AND state = ?`)
      .bind(run.state, run.startedAt, run.completedAt, run.error, run.id, current.state).run();
    if (result.meta.changes !== 1) throw new Error(`Concurrent update rejected for run: ${run.id}`);
  }

  async listRunsForCase(caseId: string): Promise<Run[]> {
    const result = await this.db.prepare("SELECT * FROM runs WHERE case_id = ? ORDER BY requested_at DESC")
      .bind(caseId).all<RunRow>();
    return result.results.map(runFromRow);
  }

  async addArtifact(artifact: Artifact): Promise<void> {
    await this.db.prepare(`INSERT INTO artifacts
      (id, schema_version, run_id, kind, content_type, storage_key, sha256, bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(artifact.id, artifact.schema, artifact.runId, artifact.kind, artifact.contentType,
        artifact.storageKey, artifact.sha256, artifact.bytes, artifact.createdAt).run();
  }

  async listArtifactsForRun(runId: string): Promise<Artifact[]> {
    const result = await this.db.prepare("SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at")
      .bind(runId).all<ArtifactRow>();
    return result.results.map(artifactFromRow);
  }

  async findArtifact(runId: string, kind: Artifact["kind"], sha256: string): Promise<Artifact | null> {
    const row = await this.db.prepare("SELECT * FROM artifacts WHERE run_id = ? AND kind = ? AND sha256 = ?")
      .bind(runId, kind, sha256).first<ArtifactRow>();
    return row ? artifactFromRow(row) : null;
  }

  async claimRun(id: string, at: string): Promise<Run | null> {
    const result = await this.db.prepare(`UPDATE runs SET state = 'running', started_at = ?
      WHERE id = ? AND state = 'queued'`).bind(at, id).run();
    return result.meta.changes === 1 ? this.getRun(id) : null;
  }

  async appendAudit(actor: string, action: string, objectType: string, objectId: string, metadata: unknown): Promise<void> {
    await this.db.prepare(`INSERT INTO audit_events
      (id, schema_version, actor, action, object_type, object_id, occurred_at, metadata_json)
      VALUES (?, 'art/control-center-audit-event/v1', ?, ?, ?, ?, ?, ?)`)
      .bind(`audit_${crypto.randomUUID()}`, actor, action, objectType, objectId,
        new Date().toISOString(), JSON.stringify(metadata)).run();
  }
}

import { ArtifactSchema, RunSchema, type Artifact, type ExecutionProvider, type Run } from "../../src/control-center/contracts.js";
import type { ControlCenterStore } from "../../src/control-center/store.js";
import { assertRunTransition } from "../../src/control-center/state.js";

type RunRow = {
  id: string; case_id: string; property_id: string; kind: Run["kind"]; state: Run["state"];
  idempotency_key: string; requested_by: string; requested_at: string; started_at: string | null;
  completed_at: string | null; engine_revision: string; execution_provider: Run["executionProvider"];
  stage: Run["stage"]; execution_policy_json: string; worker_id: string | null;
  lease_token_sha256: string | null; lease_expires_at: string | null; heartbeat_at: string | null;
  attempt: number; progress_json: string; error: string | null;
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
    completedAt: row.completed_at, engineRevision: row.engine_revision,
    executionProvider: row.execution_provider, stage: row.stage,
    executionPolicy: JSON.parse(row.execution_policy_json), workerId: row.worker_id,
    leaseExpiresAt: row.lease_expires_at, heartbeatAt: row.heartbeat_at,
    attempt: row.attempt, progress: JSON.parse(row.progress_json), error: row.error,
  });
}

function artifactFromRow(row: ArtifactRow): Artifact {
  return ArtifactSchema.parse({
    schema: "art/control-center-artifact/v1", id: row.id, runId: row.run_id,
    kind: row.kind, contentType: row.content_type, storageKey: row.storage_key,
    sha256: row.sha256, bytes: row.bytes, createdAt: row.created_at,
  });
}

// Bounded retry budget: an expired lease is reclaimable only while attempts remain. A run that
// exhausts it stays visible as an expired running run until an operator cancels it.
export const MAX_RUN_ATTEMPTS = 3;
// Each fragment binds exactly one `now` parameter.
const CLAIMABLE = (alias: string) => `(${alias}.state = 'queued' OR (${alias}.state = 'running'
  AND ${alias}.lease_expires_at IS NOT NULL AND ${alias}.lease_expires_at <= ? AND ${alias}.attempt < ${MAX_RUN_ATTEMPTS}))`;
// Per-host concurrency 1 across every provider: no other unexpired lease on the same canonical host.
const HOST_IDLE = (run: string, property: string) => `NOT EXISTS (SELECT 1 FROM runs o
  JOIN digital_properties op ON op.id = o.property_id WHERE o.id != ${run}.id AND o.state = 'running'
  AND o.lease_expires_at > ? AND op.host_key = ${property}.host_key)`;

export type RunnerSelftest = {
  id: string; workerId: string; state: "claimed" | "completed"; engineRevision: string | null;
  leaseExpiresAt: string | null; heartbeats: number; createdAt: string; heartbeatAt: string | null; completedAt: string | null;
};
type SelftestRow = {
  id: string; worker_id: string; state: RunnerSelftest["state"]; engine_revision: string | null;
  lease_expires_at: string | null; heartbeats: number; created_at: string; heartbeat_at: string | null; completed_at: string | null;
};
function selftestFromRow(row: SelftestRow): RunnerSelftest {
  return { id: row.id, workerId: row.worker_id, state: row.state, engineRevision: row.engine_revision,
    leaseExpiresAt: row.lease_expires_at, heartbeats: row.heartbeats, createdAt: row.created_at,
    heartbeatAt: row.heartbeat_at, completedAt: row.completed_at };
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
       requested_at, started_at, completed_at, engine_revision, execution_provider, stage,
       execution_policy_json, worker_id, lease_expires_at, heartbeat_at, attempt, progress_json, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(run.id, run.schema, run.caseId, run.propertyId, run.kind, run.state,
        run.idempotencyKey, run.requestedBy, run.requestedAt, run.startedAt,
        run.completedAt, run.engineRevision, run.executionProvider, run.stage,
        JSON.stringify(run.executionPolicy), run.workerId, run.leaseExpiresAt, run.heartbeatAt,
        run.attempt, JSON.stringify(run.progress), run.error).run();
  }

  async updateRun(run: Run): Promise<void> {
    const current = await this.getRun(run.id);
    if (!current) throw new Error(`Unknown run: ${run.id}`);
    if (current.state !== run.state) assertRunTransition(current.state, run.state);
    const result = await this.db.prepare(`UPDATE runs SET state = ?, stage = ?, started_at = ?,
      completed_at = ?, worker_id = ?, lease_expires_at = ?, heartbeat_at = ?, attempt = ?,
      progress_json = ?, error = ? WHERE id = ? AND state = ?`)
      .bind(run.state, run.stage, run.startedAt, run.completedAt, run.workerId,
        run.leaseExpiresAt, run.heartbeatAt, run.attempt, JSON.stringify(run.progress), run.error,
        run.id, current.state).run();
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

  async claimNextRun(input: {
    provider: ExecutionProvider; workerId: string; now: string; leaseExpiresAt: string; leaseTokenSha256: string;
    engineRevision?: string;
  }): Promise<Run | null> {
    const row = await this.db.prepare(`UPDATE runs SET state = 'running', stage = 'claimed',
      started_at = COALESCE(started_at, ?), worker_id = ?, lease_token_sha256 = ?,
      lease_expires_at = ?, heartbeat_at = ?, attempt = attempt + 1
      WHERE id = (SELECT r.id FROM runs r JOIN digital_properties p ON p.id = r.property_id
        WHERE r.execution_provider = ? AND (? IS NULL OR r.engine_revision = ?) AND ${CLAIMABLE("r")} AND ${HOST_IDLE("r", "p")}
        ORDER BY r.requested_at LIMIT 1)
      AND ${CLAIMABLE("runs")}
      RETURNING *`)
      .bind(input.now, input.workerId, input.leaseTokenSha256, input.leaseExpiresAt, input.now,
        input.provider, input.engineRevision ?? null, input.engineRevision ?? null, input.now, input.now, input.now)
      .first<RunRow>();
    return row ? runFromRow(row) : null;
  }

  async claimRunById(input: {
    id: string; provider: ExecutionProvider; workerId: string; now: string;
    leaseExpiresAt: string; leaseTokenSha256: string;
  }): Promise<Run | null> {
    const row = await this.db.prepare(`UPDATE runs SET state = 'running', stage = 'claimed',
      started_at = COALESCE(started_at, ?), worker_id = ?, lease_token_sha256 = ?,
      lease_expires_at = ?, heartbeat_at = ?, attempt = attempt + 1
      WHERE id = (SELECT r.id FROM runs r JOIN digital_properties p ON p.id = r.property_id
        WHERE r.id = ? AND r.execution_provider = ? AND ${CLAIMABLE("r")} AND ${HOST_IDLE("r", "p")})
      AND ${CLAIMABLE("runs")}
      RETURNING *`)
      .bind(input.now, input.workerId, input.leaseTokenSha256, input.leaseExpiresAt, input.now,
        input.id, input.provider, input.now, input.now, input.now)
      .first<RunRow>();
    return row ? runFromRow(row) : null;
  }

  async renewLease(input: {
    id: string; workerId: string; leaseTokenSha256: string; now: string; leaseExpiresAt: string;
    stage: Run["stage"]; progress: Record<string, unknown>;
  }): Promise<Run | null> {
    const row = await this.db.prepare(`UPDATE runs SET lease_expires_at = ?, heartbeat_at = ?,
      stage = ?, progress_json = ? WHERE id = ? AND state = 'running' AND worker_id = ?
      AND lease_token_sha256 = ? AND lease_expires_at > ? RETURNING *`)
      .bind(input.leaseExpiresAt, input.now, input.stage, JSON.stringify(input.progress), input.id,
        input.workerId, input.leaseTokenSha256, input.now).first<RunRow>();
    return row ? runFromRow(row) : null;
  }

  async validLease(id: string, workerId: string, leaseTokenSha256: string, now: string): Promise<boolean> {
    const row = await this.db.prepare(`SELECT id FROM runs WHERE id = ? AND state = 'running'
      AND worker_id = ? AND lease_token_sha256 = ? AND lease_expires_at > ?`)
      .bind(id, workerId, leaseTokenSha256, now).first<{ id: string }>();
    return Boolean(row);
  }

  async finishLeasedRun(input: {
    id: string; workerId: string; leaseTokenSha256: string; now: string;
    state: "succeeded" | "partial" | "failed"; error: string | null; progress: Record<string, unknown>;
  }): Promise<Run | null> {
    const row = await this.db.prepare(`UPDATE runs SET state = ?, stage = 'completed', completed_at = ?,
      heartbeat_at = ?, lease_token_sha256 = NULL, lease_expires_at = NULL,
      progress_json = ?, error = ? WHERE id = ? AND state = 'running' AND worker_id = ?
      AND lease_token_sha256 = ? AND lease_expires_at > ? RETURNING *`)
      .bind(input.state, input.now, input.now, JSON.stringify(input.progress), input.error,
        input.id, input.workerId, input.leaseTokenSha256, input.now).first<RunRow>();
    return row ? runFromRow(row) : null;
  }

  async cancelRun(id: string, now: string): Promise<Run | null> {
    const row = await this.db.prepare(`UPDATE runs SET state = 'cancelled', stage = 'completed',
      completed_at = ?, lease_token_sha256 = NULL, lease_expires_at = NULL
      WHERE id = ? AND state IN ('queued', 'running') RETURNING *`)
      .bind(now, id).first<RunRow>();
    return row ? runFromRow(row) : null;
  }

  async authorizeOperator(email: string, permission: "read" | "execute" | "outreach"): Promise<boolean> {
    const column = { read: "can_read", execute: "can_execute", outreach: "can_outreach" }[permission];
    const row = await this.db.prepare(`SELECT id FROM operators WHERE lower(email) = lower(?)
      AND active = 1 AND ${column} = 1`).bind(email).first<{ id: string }>();
    return Boolean(row);
  }

  async touchRunner(id: string, provider: ExecutionProvider, at: string): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE runner_agents SET last_seen_at = ?, updated_at = ?
      WHERE id = ? AND provider = ? AND enabled = 1`).bind(at, at, id, provider).run();
    return result.meta.changes === 1;
  }

  async createSelftest(input: {
    workerId: string; engineRevision: string | null; now: string; leaseExpiresAt: string; leaseTokenSha256: string;
  }): Promise<RunnerSelftest> {
    const row = await this.db.prepare(`INSERT INTO runner_selftests
      (id, worker_id, state, engine_revision, lease_token_sha256, lease_expires_at, created_at)
      VALUES (?, ?, 'claimed', ?, ?, ?, ?) RETURNING *`)
      .bind(`selftest_${crypto.randomUUID()}`, input.workerId, input.engineRevision, input.leaseTokenSha256,
        input.leaseExpiresAt, input.now).first<SelftestRow>();
    if (!row) throw new Error("Self-test could not be created");
    return selftestFromRow(row);
  }

  async heartbeatSelftest(input: {
    id: string; workerId: string; leaseTokenSha256: string; now: string; leaseExpiresAt: string;
  }): Promise<RunnerSelftest | null> {
    const row = await this.db.prepare(`UPDATE runner_selftests SET heartbeats = heartbeats + 1, heartbeat_at = ?,
      lease_expires_at = ? WHERE id = ? AND worker_id = ? AND state = 'claimed' AND lease_token_sha256 = ?
      AND lease_expires_at > ? RETURNING *`)
      .bind(input.now, input.leaseExpiresAt, input.id, input.workerId, input.leaseTokenSha256, input.now).first<SelftestRow>();
    return row ? selftestFromRow(row) : null;
  }

  async completeSelftest(input: { id: string; workerId: string; leaseTokenSha256: string; now: string }): Promise<RunnerSelftest | null> {
    const row = await this.db.prepare(`UPDATE runner_selftests SET state = 'completed', completed_at = ?,
      lease_token_sha256 = NULL, lease_expires_at = NULL WHERE id = ? AND worker_id = ? AND state = 'claimed'
      AND heartbeats > 0 AND lease_token_sha256 = ? AND lease_expires_at > ? RETURNING *`)
      .bind(input.now, input.id, input.workerId, input.leaseTokenSha256, input.now).first<SelftestRow>();
    return row ? selftestFromRow(row) : null;
  }

  async listRunners(): Promise<Array<{ id: string; provider: string; displayName: string; enabled: boolean; lastSeenAt: string | null }>> {
    const result = await this.db.prepare(`SELECT id, provider, display_name, enabled, last_seen_at FROM runner_agents ORDER BY id`)
      .all<{ id: string; provider: string; display_name: string; enabled: number; last_seen_at: string | null }>();
    return result.results.map((row) => ({ id: row.id, provider: row.provider, displayName: row.display_name,
      enabled: row.enabled === 1, lastSeenAt: row.last_seen_at }));
  }

  async appendRunEvent(runId: string, workerId: string | null, eventType: string, metadata: unknown): Promise<void> {
    await this.db.prepare(`INSERT INTO run_events
      (id, run_id, worker_id, event_type, occurred_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(`event_${crypto.randomUUID()}`, runId, workerId, eventType,
        new Date().toISOString(), JSON.stringify(metadata)).run();
  }

  async appendAudit(actor: string, action: string, objectType: string, objectId: string, metadata: unknown): Promise<void> {
    await this.db.prepare(`INSERT INTO audit_events
      (id, schema_version, actor, action, object_type, object_id, occurred_at, metadata_json)
      VALUES (?, 'art/control-center-audit-event/v1', ?, ?, ?, ?, ?, ?)`)
      .bind(`audit_${crypto.randomUUID()}`, actor, action, objectType, objectId,
        new Date().toISOString(), JSON.stringify(metadata)).run();
  }
}

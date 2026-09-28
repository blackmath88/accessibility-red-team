import type { Artifact, Run } from "./contracts.js";

export interface ControlCenterStore {
  getRun(id: string): Promise<Run | null>;
  findRunByIdempotencyKey(key: string): Promise<Run | null>;
  createRun(run: Run): Promise<void>;
  updateRun(run: Run): Promise<void>;
  listRunsForCase(caseId: string): Promise<Run[]>;
  addArtifact(artifact: Artifact): Promise<void>;
  listArtifactsForRun(runId: string): Promise<Artifact[]>;
}

export class MemoryControlCenterStore implements ControlCenterStore {
  private runs = new Map<string, Run>();
  private artifacts = new Map<string, Artifact>();

  async getRun(id: string) { return this.runs.get(id) ?? null; }
  async findRunByIdempotencyKey(key: string) {
    return Array.from(this.runs.values()).find((run) => run.idempotencyKey === key) ?? null;
  }
  async createRun(run: Run) {
    if (this.runs.has(run.id)) throw new Error(`Run already exists: ${run.id}`);
    if (await this.findRunByIdempotencyKey(run.idempotencyKey)) throw new Error(`Idempotency key already exists: ${run.idempotencyKey}`);
    this.runs.set(run.id, structuredClone(run));
  }
  async updateRun(run: Run) {
    if (!this.runs.has(run.id)) throw new Error(`Unknown run: ${run.id}`);
    this.runs.set(run.id, structuredClone(run));
  }
  async listRunsForCase(caseId: string) {
    return Array.from(this.runs.values()).filter((run) => run.caseId === caseId).map((run) => structuredClone(run));
  }
  async addArtifact(artifact: Artifact) {
    if (this.artifacts.has(artifact.id)) throw new Error(`Artifact already exists: ${artifact.id}`);
    this.artifacts.set(artifact.id, structuredClone(artifact));
  }
  async listArtifactsForRun(runId: string) {
    return Array.from(this.artifacts.values()).filter((artifact) => artifact.runId === runId).map((artifact) => structuredClone(artifact));
  }
}

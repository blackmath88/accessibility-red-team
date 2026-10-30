// State types of the experimental campaign (src/experimental/campaign), free of node imports; owned here so the
// control center never imports the experimental tree.
export type TaskKind = "scope" | "strategy" | "baseline" | "triage" | "investigate" | "replay" | "report";
export type TaskStatus = "queued" | "running" | "done" | "failed" | "skipped" | "paused";
export type Task = {
  id: string; kind: TaskKind; milestone: number; label: string; status: TaskStatus; deps: string[];
  input?: Record<string, unknown>; output?: Record<string, unknown>; error?: string; attempts: number;
  startedAt?: string; settledAt?: string; step?: string; // investigate: last completed sub-step, so resume continues there
};
export type Usage = { input: number; cacheCreation: number; cacheRead: number; output: number; thinking: number };
export type Decision = { at: string; taskId: string; kind: string; summary: string; reason: string };
export type CampaignStatus = "running" | "budget_exhausted" | "stopped" | "completed" | "partial" | "failed" | "fenced";
export type State = {
  schema: "art/campaign-state/v1"; campaignId: string; configVersion: number; scopeVersion: number; planRevision: number;
  status: CampaignStatus; statusReason: string; createdAt: string; updatedAt: string; heartbeatAt: string | null;
  controller: { pid: number; startedAt: string } | null; sessions: number; lastEventSeq: number;
  usage: { claudeInvocations: number; claudeInFlight: number; claudeFailed: number; wallMs: number; tokens: Usage; tokenCallsWithUsage: number; tokenCallsWithoutUsage: number };
  tasks: Task[]; decisions: Decision[]; failures: Array<{ at: string; taskId: string; error: string; recovery: string }>;
  cases: Array<{ id: string; task: string; page: string; viewport: string; outcome: "supported" | "rejected" | "inconclusive" | "open"; summary: string; evidence: string[] }>;
  evidence: Array<{ id: string; kind: string; sha256: string; taskId: string }>;
  nextAction: string; report: { path: string; partial: boolean; at: string } | null;
};


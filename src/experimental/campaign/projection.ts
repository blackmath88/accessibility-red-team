// Read-only projection of campaign state for the report and the control-center adapter. No fs, no zod: importable from
// both the controller and the Vite dev adapter. Counts are against the current plan revision, never percentages.
import type { State, Task } from "./types.js";

export const MILESTONES = ["Understand scope", "Set strategy", "Discover and assess", "Investigate signals", "Reproduce and consolidate", "Deliver dossier"] as const;
export type MilestoneState = "planned" | "active" | "complete" | "partial" | "blocked";
export type Milestone = { n: number; title: string; state: MilestoneState; done: number; total: number; failed: number; paused: number; note: string };

export function milestones(s: Pick<State, "tasks" | "status" | "planRevision">): Milestone[] {
  return MILESTONES.map((title, i) => {
    const ts = s.tasks.filter((t: Task) => t.milestone === i + 1);
    const c = (st: Task["status"]) => ts.filter((t) => t.status === st).length;
    const done = c("done") + c("skipped"), failed = c("failed"), paused = c("paused"), running = c("running"), queued = c("queued");
    let state: MilestoneState = "planned";
    if (!ts.length) state = "planned";
    else if (running) state = "active";
    else if (paused) state = "blocked";
    else if (queued) state = done || failed ? "active" : "planned";
    else if (failed) state = "partial";
    else state = "complete";
    if (state === "active" && s.status !== "running") state = "blocked";
    return { n: i + 1, title, state, done, total: ts.length, failed, paused, note: ts.length ? `${done}/${ts.length} tasks in plan revision ${s.planRevision}` : "no tasks planned yet" };
  });
}

// What the control center may see: no filesystem paths beyond artifact ids, no prompts, no model controls.
export function publicView(s: State, limits: unknown, heartbeatStaleMs = 10_000) {
  const alive = s.heartbeatAt !== null && Date.now() - Date.parse(s.heartbeatAt) < heartbeatStaleMs;
  return {
    schema: "art/campaign-view/v1", campaignId: s.campaignId, status: s.status, statusReason: s.statusReason, configVersion: s.configVersion, scopeVersion: s.scopeVersion,
    planRevision: s.planRevision, updatedAt: s.updatedAt, heartbeatAt: s.heartbeatAt, controllerAlive: alive, sessions: s.sessions, limits, usage: s.usage,
    milestones: milestones(s),
    tasks: s.tasks.map((t) => ({ id: t.id, kind: t.kind, milestone: t.milestone, label: t.label, status: t.status, attempts: t.attempts, step: t.step ?? null, error: t.error ?? null, startedAt: t.startedAt ?? null, settledAt: t.settledAt ?? null })),
    decisions: s.decisions.slice(-12), failures: s.failures.slice(-12), cases: s.cases, evidenceCount: s.evidence.length, nextAction: s.nextAction, report: s.report ? { partial: s.report.partial, at: s.report.at } : null,
  };
}
export type CampaignView = ReturnType<typeof publicView>;

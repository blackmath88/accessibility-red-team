import type { Run } from "../../src/control-center/contracts.js";
import { dispatchAssessmentRun } from "./github.js";

type ProviderEnv = Env & { GITHUB_APP_PRIVATE_KEY: string };

export async function queueWithProvider(env: ProviderEnv, run: Run): Promise<void> {
  if (run.executionProvider === "nebuchadnezzar_worker") return;

  const now = new Date().toISOString();
  const current = await env.DB.prepare("SELECT state FROM workflow_dispatches WHERE run_id = ?")
    .bind(run.id).first<{ state: string }>();
  if (current?.state === "dispatched" || current?.state === "dispatching") return;

  const claimed = current
    ? await env.DB.prepare(`UPDATE workflow_dispatches SET state = 'dispatching', attempts = attempts + 1,
        last_error = NULL, updated_at = ? WHERE run_id = ? AND state = 'failed'`).bind(now, run.id).run()
    : await env.DB.prepare(`INSERT OR IGNORE INTO workflow_dispatches
        (run_id, state, attempts, updated_at) VALUES (?, 'dispatching', 1, ?)`).bind(run.id, now).run();
  if (claimed.meta.changes !== 1) return;

  try {
    const dispatched = await dispatchAssessmentRun(env, run.id, run.engineRevision);
    await env.DB.prepare(`UPDATE workflow_dispatches SET state = 'dispatched', github_run_id = ?,
      updated_at = ? WHERE run_id = ?`).bind(dispatched.workflowRunId, new Date().toISOString(), run.id).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dispatch failed";
    await env.DB.prepare(`UPDATE workflow_dispatches SET state = 'failed', last_error = ?,
      updated_at = ? WHERE run_id = ?`).bind(message, new Date().toISOString(), run.id).run();
    throw error;
  }
}

// Operator path for the experimental campaign. Local fixtures only.
//   npm run campaign:cli -- start <config.json> [--foreground]   create and launch (detached unless --foreground)
//   npm run campaign:cli -- status <id>
//   npm run campaign:cli -- stop <id>                            controller settles workers and checkpoints
//   npm run campaign:cli -- extend <id> --reason "<why>" [--invocations N] [--wall-minutes M]
//   npm run campaign:cli -- resume <id> [--foreground]           same campaign, same usage, completed work kept
import { spawn } from "node:child_process";
import { appendFile, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigSchema, Store, amendLimits, repairLog, createCampaign, dirOf, loadConfig, loadState, now, writeAtomic } from "./campaign.js";
import { pidAlive, runController } from "./controller.js";
import { milestones } from "../../../control-center/src/campaignProjection.js";
import { REPO_ROOT } from "../investigation/spend.js";

const [cmd, arg, ...rest] = process.argv.slice(2);
const flag = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
const DASHBOARD = "control center dev server (npm run campaign:ui), Investigations → Live campaign";

async function liveController(id: string) {
  const lock = await readFile(join(dirOf(id), "controller.lock"), "utf8").then((t) => JSON.parse(t) as { pid: number }, () => null);
  return lock && pidAlive(lock.pid) ? lock.pid : null;
}

async function launch(id: string, foreground: boolean) {
  if (await liveController(id)) throw new Error("a controller is already running for this campaign");
  if (foreground) { const s = await runController(id); console.log(`${id}: ${s.status} — ${s.statusReason}`); return; }
  await mkdir(dirOf(id), { recursive: true });
  const log = await open(join(dirOf(id), "controller.log"), "a");
  // Detached: closing the terminal or the dashboard does not stop the campaign.
  const child = spawn(process.execPath, [...process.execArgv, join(REPO_ROOT, "src/experimental/campaign/cli.ts"), "run", id], { cwd: REPO_ROOT, detached: true, stdio: ["ignore", log.fd, log.fd], env: process.env });
  child.unref(); await log.close();
  console.log(`campaign ${id} launched (pid ${child.pid}); log runs/campaign/${id}/controller.log; dashboard: ${DASHBOARD}`);
}

async function status(id: string) {
  const s = await loadState(id), c = await loadConfig(id), pid = await liveController(id);
  const u = s.usage, L = c.limits;
  console.log(`${id}: ${s.status} — ${s.statusReason}\ncontroller: ${pid ? `pid ${pid}` : "not running"}; heartbeat ${s.heartbeatAt ?? "never"}; sessions ${s.sessions}; config v${s.configVersion}, plan revision ${s.planRevision}`);
  for (const m of milestones(s)) console.log(`  ${m.n}. ${m.title.padEnd(26)} ${m.state.padEnd(9)} ${m.note}`);
  console.log(`claude invocations ${u.claudeInvocations}/${L.claudeInvocations} (in flight ${u.claudeInFlight}, failed ${u.claudeFailed}); wall ${Math.round(u.wallMs / 1000)} s / ${L.wallMinutes} min`);
  console.log(`tokens measured on ${u.tokenCallsWithUsage} calls (${u.tokenCallsWithoutUsage} unknown): input ${u.tokens.input} + cache-create ${u.tokens.cacheCreation} + cache-read ${u.tokens.cacheRead}, output ${u.tokens.output}; target ${L.tokenTarget.input}/${L.tokenTarget.output} (not enforced)`);
  for (const k of s.cases) console.log(`  case ${k.id}: ${k.outcome}`);
  console.log(`next: ${s.nextAction}`);
}

async function stop(id: string) {
  const pid = await liveController(id);
  if (pid) { await writeFile(join(dirOf(id), "stop.request"), now()); console.log(`stop requested; controller ${pid} settles workers and checkpoints`); return; }
  const s = await loadState(id), store = new Store(id, s);
  s.lastEventSeq = (await repairLog(id)).lastSeq; // the log is authoritative; never append at a stale sequence
  if (["completed", "partial", "stopped"].includes(s.status)) { console.log(`${id} is ${s.status}; nothing to stop`); return; }
  s.status = "stopped"; s.statusReason = "stopped by operator while no controller was running";
  await store.event("op", "stopped_offline", {}); await store.save(); console.log("marked stopped");
}

async function extend(id: string) {
  const reason = flag("--reason");
  if (!reason || reason.length < 8) throw new Error("--reason is required (at least 8 characters)");
  if (await liveController(id)) throw new Error("stop the controller or let it checkpoint before extending");
  const inv = flag("--invocations"), wall = flag("--wall-minutes");
  if (!inv && !wall) throw new Error("give --invocations and/or --wall-minutes");
  const c = await loadConfig(id), s = await loadState(id);
  const ev = await repairLog(id);
  if (ev.lastSeq !== s.lastEventSeq) throw new Error("checkpoint does not match the event log; resume once (it reconciles), then amend");
  const limits = amendLimits(c.limits, { ...(inv ? { claudeInvocations: Number(inv) } : {}), ...(wall ? { wallMinutes: Number(wall) } : {}) }, s.usage);
  // Only resource ceilings change. Scope, scope version, model, token target and paid authority are copied unchanged.
  const next = ConfigSchema.parse({ ...c, configVersion: c.configVersion + 1, limits });
  await writeAtomic(join(dirOf(id), "config.json"), JSON.stringify(next, null, 1));
  await appendFile(join(dirOf(id), "config-history.jsonl"), JSON.stringify({ at: now(), reason, previous: c.limits, next: limits, configVersion: next.configVersion }) + "\n");
  const store = new Store(id, s);
  s.configVersion = next.configVersion;
  await store.event("op", "budget_amended", { previous: { claudeInvocations: c.limits.claudeInvocations, wallMinutes: c.limits.wallMinutes }, next: { claudeInvocations: limits.claudeInvocations, wallMinutes: limits.wallMinutes }, reason, consumedAtAmendment: s.usage });
  s.nextAction = "resume"; await store.save();
  console.log(`config v${next.configVersion}: invocations ${c.limits.claudeInvocations} → ${limits.claudeInvocations}, wall ${c.limits.wallMinutes} → ${limits.wallMinutes} min; consumed usage unchanged`);
}

async function main() {
  if (cmd === "start" && arg) {
    const config = ConfigSchema.parse(JSON.parse(await readFile(arg, "utf8")));
    await createCampaign(config);
    await launch(config.campaignId, rest.includes("--foreground"));
  } else if (cmd === "run" && arg) { const s = await runController(arg); console.log(`${now()} ${arg}: ${s.status} — ${s.statusReason}`); }
  else if (cmd === "resume" && arg) {
    const s = await loadState(arg);
    if (["completed", "fenced"].includes(s.status)) throw new Error(`${arg} is ${s.status}; ${s.status === "fenced" ? "correct the enforcement failure first" : "nothing to resume"}`);
    await launch(arg, rest.includes("--foreground"));
  }
  else if (cmd === "status" && arg) await status(arg);
  else if (cmd === "stop" && arg) await stop(arg);
  else if (cmd === "extend" && arg) await extend(arg);
  else { console.error("usage: campaign start <config.json> [--foreground] | status|stop|resume <id> | extend <id> --reason <text> [--invocations N] [--wall-minutes M]"); process.exit(2); }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });

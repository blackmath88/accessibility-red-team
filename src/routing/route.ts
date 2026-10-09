import { modalityOf, type Modality } from "../evaluation/ambiguity-census.js";
import { validateSemanticDecision, type SemanticExperimentInput, type SemanticExperimentOutput } from "../evaluation/semantic-experiment.js";
import type { Emit } from "../theatre/emit.js";

// docs/SEMANTIC_COMPILER.md "Model routing": tiers cheapest first. Model selection is runtime policy, not business logic.
export const TIERS = ["NO_MODEL", "SMALL_CLASSIFIER", "SMALL_STRUCTURED", "GENERAL_SYNTHESIS", "FRONTIER_ESCALATION"] as const;
export type Tier = typeof TIERS[number];

// Each semantic task declares the highest tier it may ever reach and the evidence modalities a text model can decide.
// A struggling small model never escalates silently: it returns UNKNOWN and the finding goes to human review.
export const TASKS = {
  "incomplete-triage": { version: "0.1.0", maxTier: "SMALL_CLASSIFIER", modalities: ["text_semantic"] },
} as const satisfies Record<string, { version: string; maxTier: Tier; modalities: readonly Modality[] }>;
export type TaskId = keyof typeof TASKS;

export type Provider = {
  model: string;
  decide(input: SemanticExperimentInput): Promise<{ output: SemanticExperimentOutput; tokens: number }>;
};
export type RoutingPolicy = { enabled: readonly TaskId[]; providers: Partial<Record<Tier, Provider>> };

// ADR-0012: production enables no task and holds no provider, so every route resolves to NO_MODEL.
// Only an offline experiment on frozen evidence may pass another policy.
export const PRODUCTION_POLICY: RoutingPolicy = { enabled: [], providers: {} };

export type Route = { task: TaskId; tier: Tier; provider?: Provider; reason: string };

export function route(task: TaskId, probeId: string, policy: RoutingPolicy = PRODUCTION_POLICY): Route {
  const spec = TASKS[task];
  const modality = modalityOf(probeId.replace(/^axe\./, ""));
  if (!(spec.modalities as readonly Modality[]).includes(modality)) return { task, tier: "NO_MODEL", reason: `${modality}: not text-decidable` };
  if (!policy.enabled.includes(task)) return { task, tier: "NO_MODEL", reason: "task disabled (ADR-0012)" };
  for (const tier of TIERS.slice(1, TIERS.indexOf(spec.maxTier) + 1)) {
    const provider = policy.providers[tier];
    if (provider) return { task, tier, provider, reason: `${modality} · ${provider.model}` };
  }
  return { task, tier: "NO_MODEL", reason: `no provider at or below ${spec.maxTier}` };
}

const actorFor = (tier: Tier) => tier === "SMALL_CLASSIFIER" || tier === "SMALL_STRUCTURED" ? "small-model" : "large-model";

// Runs one routed decision. Every failure (schema, decision space, unsupplied evidence, provider error) falls back to
// needs-review and never changes an observation. Returns null when a human has to decide.
export async function interpret(input: SemanticExperimentInput, probeId: string, site: string, options: { policy?: RoutingPolicy; emit?: Emit } = {}) {
  const emit = options.emit ?? (() => {});
  const routed = route("incomplete-triage", probeId, options.policy);
  const subject = { kind: "finding", id: `${site}/${probeId}:incomplete`, site };
  if (!routed.provider) {
    emit({ stage: "interpret", actor: "code", verdict: "needs-review", subject, detail: `${probeId} · ${routed.tier} · ${routed.reason}` });
    return { route: routed, output: null };
  }
  const started = Date.now();
  const actor = actorFor(routed.tier);
  try {
    const { output, tokens } = await routed.provider.decide(input);
    validateSemanticDecision(input, output);
    const unresolved = output.requiresHumanReview || output.decision === "UNKNOWN";
    emit({ stage: "interpret", actor, verdict: unresolved ? "needs-review" : "explained", subject,
      detail: `${probeId} · ${routed.tier} · ${output.model} · ${output.decision}`, cost: { tokens, ms: Date.now() - started } });
    return { route: routed, output: unresolved ? null : output };
  } catch (error) {
    emit({ stage: "interpret", actor, verdict: "needs-review", subject,
      detail: `${probeId} · ${routed.tier} · failed: ${error instanceof Error ? error.message : String(error)}`, cost: { tokens: 0, ms: Date.now() - started } });
    return { route: routed, output: null };
  }
}

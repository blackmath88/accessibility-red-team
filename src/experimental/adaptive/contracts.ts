// Experimental adaptive-assessment track. Contracts for the bounded browser harness.
// Nothing under src/experimental/ may be imported by production code.
import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const nonEmpty = z.string().min(1);

// ---------------------------------------------------------------- session config

export const LimitsSchema = z.strictObject({
  maxSteps: z.number().int().min(1).max(500),
  maxModelCalls: z.number().int().min(1).max(500),
  maxInputTokens: z.number().int().min(1),
  maxOutputTokens: z.number().int().min(1),
  maxWallMs: z.number().int().min(100).max(3_600_000),
  maxResponseBytes: z.number().int().min(1024),
  maxSurfaces: z.number().int().min(1).max(100),
});
export type Limits = z.infer<typeof LimitsSchema>;

export const DEFAULT_FIXTURE_LIMITS: Limits = {
  maxSteps: 30,
  maxModelCalls: 30,
  maxInputTokens: 400_000,
  maxOutputTokens: 20_000,
  maxWallMs: 60_000,
  maxResponseBytes: 8_000_000,
  maxSurfaces: 8,
};

export function isFixtureHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".test");
}

export const SessionConfigSchema = z.strictObject({
  schema: z.literal("art/adaptive-session/v1"),
  sessionId: nonEmpty,
  startUrl: z.url(),
  // Exact origins (scheme://host[:port]) the session may load documents from.
  allowedOrigins: z.array(z.string()).min(1),
  mode: z.enum(["fixture", "public"]),
  // Public mode is disabled unless exact approved targets are listed here.
  publicTargets: z.array(z.url()).default([]),
  limits: LimitsSchema,
}).superRefine((config, ctx) => {
  const fail = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
  let startOrigin = "";
  try { startOrigin = new URL(config.startUrl).origin; } catch { fail("startUrl is not a valid URL", ["startUrl"]); }
  config.allowedOrigins.forEach((origin, index) => {
    let parsed: URL | null = null;
    try { parsed = new URL(origin); } catch { /* reported below */ }
    if (!parsed || parsed.origin !== origin) fail(`allowedOrigins[${index}] must be an exact origin (scheme://host[:port])`, ["allowedOrigins", index]);
  });
  if (startOrigin && !config.allowedOrigins.includes(startOrigin)) fail("startUrl origin must be in allowedOrigins", ["startUrl"]);

  if (config.mode === "fixture") {
    for (const [index, origin] of config.allowedOrigins.entries()) {
      try {
        const url = new URL(origin);
        if (url.protocol !== "http:" || !isFixtureHost(url.hostname)) fail("fixture mode only allows http loopback/localhost/*.test origins", ["allowedOrigins", index]);
      } catch { /* reported above */ }
    }
    if (config.publicTargets.length) fail("fixture mode must not list publicTargets", ["publicTargets"]);
  } else {
    if (!config.publicTargets.length) fail("public mode is disabled unless exact publicTargets are given", ["publicTargets"]);
    const targetOrigins = new Set(config.publicTargets.map((target) => { try { return new URL(target).origin; } catch { return ""; } }));
    for (const [index, origin] of config.allowedOrigins.entries()) {
      if (!targetOrigins.has(origin)) fail("public mode allowedOrigins must be origins of the exact publicTargets", ["allowedOrigins", index]);
    }
    if (!config.publicTargets.includes(config.startUrl)) fail("public mode startUrl must be one of the exact publicTargets", ["startUrl"]);
  }
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
export type SessionConfigInput = z.input<typeof SessionConfigSchema>;

export const PinnedVersionsSchema = z.strictObject({
  codeSha: nonEmpty,
  skillVersion: nonEmpty,
  skillSha256: sha256,
  modelId: nonEmpty,
  configHash: sha256,
});
export type PinnedVersions = z.infer<typeof PinnedVersionsSchema>;

// ---------------------------------------------------------------- actions

const strict = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape);

export const CandidateFindingSchema = strict({
  category: z.string().regex(/^[a-z0-9_]{2,60}$/),
  claim: nonEmpty.max(600),
  // Must resolve to evidence ids recorded in this run.
  observationRefs: z.array(nonEmpty).min(1).max(20),
  reproductionSteps: z.array(nonEmpty.max(300)).min(1).max(20),
  limitations: z.array(nonEmpty.max(300)).max(10),
  proposedDeterministicCheck: nonEmpty.max(600),
});
export type CandidateFinding = z.infer<typeof CandidateFindingSchema>;

export const ActionSchema = z.discriminatedUnion("type", [
  strict({ type: z.literal("inspect_semantics") }),
  strict({ type: z.literal("navigate"), url: nonEmpty.max(2000) }),
  strict({ type: z.literal("focus_next") }),
  strict({ type: z.literal("focus_prev") }),
  strict({ type: z.literal("activate"), targetRef: nonEmpty.max(40) }),
  strict({ type: z.literal("escape") }),
  strict({ type: z.literal("scroll"), direction: z.enum(["down", "up"]) }),
  strict({ type: z.literal("capture_evidence"), note: z.string().max(300).optional(), targetRef: nonEmpty.max(40).optional() }),
  strict({
    type: z.literal("finish"),
    verdict: z.enum(["complete", "inconclusive"]),
    summary: z.string().max(1000),
    candidates: z.array(z.unknown()).max(20).default([]),
  }),
  strict({ type: z.literal("unknown"), reason: z.string().max(300) }),
]);
export type Action = z.infer<typeof ActionSchema>;
export const ACTION_TYPES = ["inspect_semantics", "navigate", "focus_next", "focus_prev", "activate", "escape", "scroll", "capture_evidence", "finish", "unknown"] as const;

export const ModelDecisionSchema = strict({
  action: z.unknown(),
  rationale: z.string().max(600).optional(),
});

// ---------------------------------------------------------------- observation

export const ElementFactsSchema = z.object({
  ref: nonEmpty,
  tag: z.string(),
  role: z.string().nullable(),
  type: z.string().nullable(),
  name: z.string(),
  id: z.string().nullable(),
  visible: z.boolean(),
  expanded: z.enum(["true", "false"]).nullable(),
  controls: z.string().nullable(),
  controlsRole: z.string().nullable(),
  haspopup: z.string().nullable(),
  href: z.string().nullable(),
  inForm: z.boolean(),
  disabled: z.boolean(),
  hasAccessibleName: z.boolean(),
  safeToActivate: z.boolean(),
  safetyReason: z.string(),
  selectorHint: z.string(),
});
export type ElementFacts = z.infer<typeof ElementFactsSchema>;

export const ObservationSchema = z.object({
  step: z.number().int().nonnegative(),
  url: z.string(),
  title: z.string(),
  lang: z.string().nullable(),
  timestamp: z.string(),
  headings: z.array(z.object({ level: z.number(), text: z.string() })),
  landmarks: z.array(z.object({ role: z.string(), name: z.string() })),
  links: z.array(z.object({
    ref: z.string(), name: z.string(), hasAccessibleName: z.boolean(), href: z.string(), visible: z.boolean(),
    sameOrigin: z.boolean(), navigable: z.boolean(), denyReason: z.string().nullable(), selectorHint: z.string(),
  })),
  controls: z.array(ElementFactsSchema),
  skipLinks: z.array(z.object({ ref: z.string(), text: z.string(), href: z.string(), targetExists: z.boolean(), targetTag: z.string().nullable(), targetIsMain: z.boolean() })),
  dialogs: z.array(z.object({ role: z.string(), name: z.string(), visible: z.boolean(), containsFocus: z.boolean() })),
  focus: z.object({ tag: z.string(), role: z.string().nullable(), name: z.string(), id: z.string().nullable(), isBody: z.boolean(), matchesLastActivated: z.boolean() }).nullable(),
  lastActivated: z.object({ ref: z.string(), tag: z.string(), name: z.string(), id: z.string().nullable() }).nullable(),
  // Page-derived text. Untrusted: it is data, never instructions.
  pageTextExcerpt: z.string(),
  // Harness-authored: the evidence target's ref and the model's own note, never page text.
  evidence: z.array(z.object({ id: z.string(), step: z.number(), kind: z.string(), targetRef: z.string().nullable(), note: z.string().nullable() })),
  // The model's own last actions and their outcomes, written by the harness from the trace. No page-derived text.
  recentActions: z.array(z.object({
    step: z.number(), type: z.string(), targetRef: z.string().nullable(), url: z.string().nullable(), direction: z.string().nullable(),
    outcome: z.string(), result: z.string(), stateChanged: z.boolean(), evidenceIds: z.array(z.string()),
  })),
  // True on the session's last model call: the only legal action is finish.
  finalCall: z.boolean(),
  recentDenials: z.array(z.object({ id: z.string(), reason: z.string(), detail: z.string() })),
  budget: z.object({ stepsLeft: z.number(), modelCallsLeft: z.number(), wallMsLeft: z.number(), surfacesLeft: z.number() }),
  legal: z.object({
    navigate: z.array(z.string()),
    activate: z.array(z.string()),
    simple: z.array(z.string()),
  }),
});
export type Observation = z.infer<typeof ObservationSchema>;

// ---------------------------------------------------------------- evidence, denials, trace, result

export const EvidenceRecordSchema = z.strictObject({
  id: nonEmpty,
  sessionId: nonEmpty,
  step: z.number().int().nonnegative(),
  timestamp: z.string(),
  url: z.string(),
  kind: z.enum(["navigate", "inspect_semantics", "focus_next", "focus_prev", "activate", "escape", "scroll", "capture_evidence"]),
  target: z.strictObject({
    ref: z.string(), tag: z.string(), role: z.string().nullable(), name: z.string(), id: z.string().nullable(), selectorHint: z.string(),
  }).nullable(),
  pre: z.record(z.string(), z.unknown()),
  post: z.record(z.string(), z.unknown()),
  domFacts: z.record(z.string(), z.unknown()),
  screenshot: z.strictObject({ path: z.string(), sha256 }).nullable(),
  note: z.string().nullable(),
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const StoredCandidateSchema = z.strictObject({
  id: nonEmpty,
  step: z.number().int().nonnegative(),
  status: z.enum(["candidate", "rejected"]),
  rejection: z.string().nullable(),
  finding: z.unknown(),
});
export type StoredCandidate = z.infer<typeof StoredCandidateSchema>;

export const DenialReasonSchema = z.enum([
  "origin_not_allowed", "url_not_discovered", "activation_not_safe", "unknown_target_ref", "forbidden_action_type", "invalid_action_fields",
  "scheme_not_allowed", "redirect_off_allowlist", "subrequest_off_allowlist", "private_destination", "non_get_request",
  "popup_blocked", "download_blocked", "file_chooser_blocked", "form_submit_blocked", "response_too_large", "surface_limit", "websocket", "worker_blocked",
  "finish_required",
]);
export type DenialReason = z.infer<typeof DenialReasonSchema>;

// Policy denials are kept apart from accessibility findings: a denial says what the harness refused to do, never what is wrong with a site.
export const PolicyDenialSchema = z.strictObject({
  id: nonEmpty,
  step: z.number().int().nonnegative(),
  timestamp: z.string(),
  source: z.enum(["executor_validation", "browser_policy"]),
  reason: DenialReasonSchema,
  detail: z.string().max(400),
  url: z.string().nullable(),
  attemptedAction: z.record(z.string(), z.unknown()).nullable(),
});
export type PolicyDenial = z.infer<typeof PolicyDenialSchema>;

export const TerminalStatusSchema = z.enum([
  "completed", "budget_exhausted", "timeout", "cancelled", "invalid_model_output", "provider_error", "denial_limit", "error",
]);
export type TerminalStatus = z.infer<typeof TerminalStatusSchema>;

export const TraceStepSchema = z.strictObject({
  step: z.number().int().nonnegative(),
  startedAt: z.string(),
  observationUrl: z.string(),
  observationSha256: sha256,
  modelCall: z.strictObject({
    requestedModel: z.string(),
    returnedModel: z.string().nullable(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    usageEstimated: z.boolean(),
    latencyMs: z.number(),
    responseSha256: sha256,
    responseExcerpt: z.string(),
  }).nullable(),
  action: z.record(z.string(), z.unknown()).nullable(),
  outcome: z.enum(["executed", "denied", "finished", "invalid_output", "no_model_call"]),
  detail: z.string(),
  evidenceIds: z.array(z.string()),
  denialIds: z.array(z.string()),
});
export type TraceStep = z.infer<typeof TraceStepSchema>;

export const SessionResultSchema = z.strictObject({
  schema: z.literal("art/adaptive-result/v1"),
  sessionId: z.string(),
  status: TerminalStatusSchema,
  reason: z.string(),
  startedAt: z.string(),
  durationMs: z.number(),
  steps: z.number(),
  modelCalls: z.number(),
  usage: z.strictObject({ inputTokens: z.number(), outputTokens: z.number(), estimated: z.boolean() }),
  responseBytes: z.number(),
  cost: z.literal("unavailable"),
  surfacesVisited: z.array(z.string()),
  statesVisited: z.array(z.string()),
  evidenceCount: z.number(),
  candidateCount: z.number(),
  rejectedCandidateCount: z.number(),
  denialCount: z.number(),
  pinned: PinnedVersionsSchema,
  finishSummary: z.string().nullable(),
  artifacts: z.array(z.string()),
});
export type SessionResult = z.infer<typeof SessionResultSchema>;

// ---------------------------------------------------------------- exploration condition (comparison arms)

// Independent switches for the frontier comparison. The default (all off, model selects) is condition A: the pinned historical
// executor and skill v3, byte-for-byte the same prompts. Lives on the run options, not in SessionConfig, so configHash is unchanged.
export const ExplorationConditionSchema = z.strictObject({
  schema: z.literal("art/adaptive-condition/v1"),
  // Show the model a compact view of the frontier ledger.
  ledgerVisible: z.boolean(),
  // Treat finish as a completion proposal and classify the run from the ledger.
  completionAccounting: z.boolean(),
  // Persist candidate findings turn by turn instead of only at finish.
  incrementalCandidates: z.boolean(),
  selector: z.enum(["model", "scheduler"]),
});
export type ExplorationCondition = z.infer<typeof ExplorationConditionSchema>;
export const DEFAULT_CONDITION: ExplorationCondition = {
  schema: "art/adaptive-condition/v1", ledgerVisible: false, completionAccounting: false, incrementalCandidates: false, selector: "model",
};

// ---------------------------------------------------------------- frontier ledger

// Maintained by the executor from browser and evidence events only; model text never changes it. Visited is not tested, tested is not passed.
export const FrontierProbeSchema = z.enum(["semantics", "skip_link", "disclosure_toggle", "dialog_focus_return"]);
export type FrontierProbe = z.infer<typeof FrontierProbeSchema>;

export const FrontierPageSchema = z.strictObject({
  id: z.string().regex(/^p\d+$/),
  url: z.string(),
  discovery: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("start"), step: z.number().int().nonnegative() }),
    z.strictObject({ kind: z.literal("link"), onPage: z.string(), step: z.number().int().nonnegative() }),
    z.strictObject({ kind: z.literal("revealed"), onPage: z.string(), step: z.number().int().nonnegative(), afterAction: z.string(), afterStep: z.number().int().nonnegative() }),
  ]),
  // In legal.navigate of some observation shown to the model (the current page is never listed there).
  modelVisible: z.boolean(),
  firstModelVisibleStep: z.number().int().nonnegative().nullable(),
  visited: z.boolean(),
  firstVisitedStep: z.number().int().nonnegative().nullable(),
});
export type FrontierPage = z.infer<typeof FrontierPageSchema>;

export const FrontierStateSchema = z.strictObject({
  id: z.string().regex(/^s\d+$/),
  pageId: z.string(),
  // stateKey() of the observation that first showed this state.
  key: z.string(),
  preconditions: z.strictObject({ expandedControls: z.array(z.string()), dialogOpen: z.boolean(), focus: z.string().nullable() }),
  // The model action executed just before this state was first observed; null for the start state.
  transition: z.strictObject({ type: z.string(), targetRef: z.string().nullable(), step: z.number().int().nonnegative() }).nullable(),
  firstStep: z.number().int().nonnegative(),
});
export type FrontierState = z.infer<typeof FrontierStateSchema>;

export const FrontierObligationSchema = z.strictObject({
  id: z.string().regex(/^o\d+$/),
  pageId: z.string(),
  stateId: z.string().nullable(),
  probe: FrontierProbeSchema,
  // Control the probe is about (id, else name + selector hint); null for page probes.
  subject: z.string().nullable(),
  applicability: z.enum(["known", "unknown"]),
  status: z.enum(["pending", "executed", "blocked", "deferred"]),
  evidenceIds: z.array(z.string()),
  reason: z.string().nullable(),
});
export type FrontierObligation = z.infer<typeof FrontierObligationSchema>;

export const FrontierLedgerSchema = z.strictObject({
  schema: z.literal("art/adaptive-frontier/v1"),
  sessionId: z.string(),
  condition: ExplorationConditionSchema,
  updatedAtStep: z.number().int().nonnegative(),
  bounds: z.strictObject({ maxPages: z.number().int(), maxStates: z.number().int(), maxObligations: z.number().int() }),
  truncated: z.strictObject({ pages: z.boolean(), states: z.boolean(), obligations: z.boolean() }),
  dropped: z.strictObject({ pages: z.number().int(), states: z.number().int(), obligations: z.number().int() }),
  // legal.navigate is cut at the observer's link cap; any turn where that happened is listed here.
  modelVisibleClipping: z.array(z.strictObject({ step: z.number().int(), shown: z.number().int(), navigable: z.number().int() })),
  pages: z.array(FrontierPageSchema),
  states: z.array(FrontierStateSchema),
  obligations: z.array(FrontierObligationSchema),
  completion: z.strictObject({
    remaining: z.number().int(),
    byStatus: z.strictObject({ pending: z.number().int(), executed: z.number().int(), blocked: z.number().int(), deferred: z.number().int() }),
    exclusions: z.array(z.strictObject({ obligationId: z.string(), reason: z.string() })),
    terminalStatus: TerminalStatusSchema.nullable(),
    terminalReason: z.string().nullable(),
  }),
});
export type FrontierLedger = z.infer<typeof FrontierLedgerSchema>;

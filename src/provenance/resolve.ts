import type { ProbeResult } from "../contracts.js";
import {
  RequirementResolutionSchema,
  type JurisdictionProfile,
  type RequirementResolution,
  type SourceRegistry,
} from "./contracts.js";

function levelRank(level: string): number {
  return level === "A" ? 1 : level === "AA" ? 2 : level === "AAA" ? 3 : 99;
}

export function levelFromAxeTags(tags: string[]): "A" | "AA" | "AAA" | null {
  const lowered = tags.map((tag) => tag.toLowerCase());

  if (lowered.some((tag) => /wcag(?:2|20|21|22)aaa$/.test(tag))) return "AAA";
  if (lowered.some((tag) => /wcag(?:2|20|21|22)aa$/.test(tag))) return "AA";
  if (lowered.some((tag) => /wcag(?:2|20|21|22)a$/.test(tag))) return "A";
  return null;
}

function sourceWithAssertion(
  registry: SourceRegistry,
  sourceId: string,
  assertionId: string | null,
  fallbackStatement: string,
) {
  const source = registry.sources.find((item) => item.id === sourceId);
  if (!source) return null;

  const assertion = assertionId
    ? source.assertions.find((item) => item.id === assertionId)
    : undefined;

  return {
    sourceId: source.id,
    title: source.title,
    issuer: source.issuer,
    authorityClass: source.authority_class,
    url: source.url,
    assertionId: assertion?.id ?? null,
    assertion: assertion?.statement ?? fallbackStatement,
    strength: assertion?.strength ?? "UNKNOWN" as const,
  };
}

function bindingAssertionId(sourceId: string): string | null {
  if (sourceId === "ch.federal.ebgb.eaccessibility") return "ech0059-binding-federal";
  return null;
}

function wcagAssertionId(sourceId: string, version: string, level: string): string | null {
  if (sourceId === "ch.ech.0059.v3" && version === "2.1" && level === "AA") return "web-wcag21-aa";
  if (sourceId === "ch.zh.accessibility-requirements" && version === "2.2" && level === "AA") return "wcag22-aa";
  if (sourceId === "ch.be.accessibility-requirements" && version === "2.2" && level === "AA") return "wcag22-aa";
  if (sourceId === "ch.bs.accessibility-statement" && version === "2.1" && level === "AA") return "wcag21-aa";
  return null;
}

export function resolveRequirement(
  criterion: string,
  tags: string[],
  profile: JurisdictionProfile,
  registry: SourceRegistry,
): RequirementResolution {
  const observedLevel = levelFromAxeTags(tags);
  const baseline = profile.baseline.wcag;
  const baselineApplies =
    observedLevel !== null &&
    levelRank(observedLevel) <= levelRank(baseline.level) &&
    !tags.some((tag) => tag.toLowerCase().startsWith("wcag22")) || baseline.version === "2.2";

  if (baselineApplies) {
    const chain = [];

    const ech = profile.baseline.ech;
    if (ech) {
      const jurisdictionSource = sourceWithAssertion(
        registry,
        ech.source_ref,
        bindingAssertionId(ech.source_ref),
        `${ech.id} ${ech.version} is the adopted accessibility baseline for this target.`,
      );
      if (jurisdictionSource) chain.push(jurisdictionSource);
    }

    const incorporation = sourceWithAssertion(
      registry,
      baseline.incorporation_source_ref,
      wcagAssertionId(baseline.incorporation_source_ref, baseline.version, baseline.level),
      `The applicable standard incorporates WCAG ${baseline.version} Level ${baseline.level}.`,
    );
    if (incorporation) chain.push(incorporation);

    return RequirementResolutionSchema.parse({
      framework: "WCAG",
      criterion,
      profileId: profile.id,
      profileAsOf: profile.as_of,
      status: "APPLICABLE",
      strength: baseline.strength,
      standardVersion: baseline.version,
      conformanceLevel: baseline.level,
      chain,
      explanation: `WCAG ${baseline.version} criterion ${criterion} falls within the applicable Level ${baseline.level} baseline for ${profile.id}.`,
    });
  }

  const best = profile.best_practice?.wcag;
  if (best && observedLevel !== null && levelRank(observedLevel) <= levelRank(best.level)) {
    return RequirementResolutionSchema.parse({
      framework: "WCAG",
      criterion,
      profileId: profile.id,
      profileAsOf: profile.as_of,
      status: "BEST_PRACTICE",
      strength: best.strength,
      standardVersion: best.version,
      conformanceLevel: best.level,
      chain: [],
      explanation: `Criterion ${criterion} is retained as current best practice but is not demonstrated here as part of the binding baseline.`,
    });
  }

  return RequirementResolutionSchema.parse({
    framework: "WCAG",
    criterion,
    profileId: profile.id,
    profileAsOf: profile.as_of,
    status: "UNKNOWN",
    strength: "UNKNOWN",
    standardVersion: baseline.version,
    conformanceLevel: baseline.level,
    chain: [],
    explanation: `Applicability of criterion ${criterion} could not be established from the selected profile and axe metadata.`,
  });
}

export function resolveProbeRequirements(
  probe: ProbeResult,
  profile: JurisdictionProfile,
  registry: SourceRegistry,
): RequirementResolution[] {
  return probe.requirements.map((requirement) =>
    resolveRequirement(requirement.criterion, probe.tags, profile, registry),
  );
}

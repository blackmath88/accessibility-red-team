import type { JourneyRun } from "../journeys/contracts.js";
import { SiteJourneySummarySchema } from "./site-contracts.js";

export function summarizeJourneys(runs: JourneyRun[]) {
  const groups = new Map<string, {
    journeyId: string;
    journeyVersion: string;
    kind: string;
    outcome: "pass" | "violation" | "incomplete" | "inapplicable" | "error";
    surfaceIds: Set<string>;
    resultCount: number;
    summaries: Set<string>;
  }>();

  for (const run of runs) {
    for (const result of run.results) {
      const key = `${result.journeyId}:${result.outcome}`;
      const current = groups.get(key) ?? {
        journeyId: result.journeyId,
        journeyVersion: result.journeyVersion,
        kind: result.kind,
        outcome: result.outcome,
        surfaceIds: new Set<string>(),
        resultCount: 0,
        summaries: new Set<string>(),
      };
      current.surfaceIds.add(result.surfaceId);
      current.resultCount += 1;
      current.summaries.add(result.summary);
      groups.set(key, current);
    }
  }

  return Array.from(groups.values())
    .map((group) => SiteJourneySummarySchema.parse({
      journeyId: group.journeyId,
      journeyVersion: group.journeyVersion,
      kind: group.kind,
      outcome: group.outcome,
      affectedSurfaces: group.surfaceIds.size,
      resultCount: group.resultCount,
      surfaceIds: Array.from(group.surfaceIds).sort(),
      summaries: Array.from(group.summaries),
    }))
    .sort((a, b) =>
      a.journeyId.localeCompare(b.journeyId) ||
      a.outcome.localeCompare(b.outcome)
    );
}

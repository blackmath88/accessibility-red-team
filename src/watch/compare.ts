import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SiteAccessibilityReportSchema } from "../report/site-contracts.js";
import { WatchResultSchema } from "./contracts.js";

function key(probeId: string, outcome: string): string {
  return createHash("sha256").update(`${probeId}:${outcome}`).digest("hex").slice(0, 16);
}

function snapshot(finding: {
  prevalence: number;
  occurrenceCount: number;
  affectedSurfaces: number;
  probeVersion: string;
}) {
  return {
    prevalence: finding.prevalence,
    occurrenceCount: finding.occurrenceCount,
    affectedSurfaces: finding.affectedSurfaces,
    probeVersion: finding.probeVersion,
  };
}

export async function compareSiteReports(options: {
  previousPath: string;
  currentPath: string;
  outPath: string;
}) {
  const [previousRaw, currentRaw] = await Promise.all([
    readFile(options.previousPath, "utf8"),
    readFile(options.currentPath, "utf8"),
  ]);

  const previous = SiteAccessibilityReportSchema.parse(JSON.parse(previousRaw));
  const current = SiteAccessibilityReportSchema.parse(JSON.parse(currentRaw));

  const comparable = previous.profileId === current.profileId;
  const reason = comparable ? null : "Jurisdiction/requirement profile changed between runs.";

  const previousMap = new Map(
    previous.findings.map(({ finding }) => [
      key(finding.probeId, finding.outcome),
      finding,
    ]),
  );
  const currentMap = new Map(
    current.findings.map(({ finding }) => [
      key(finding.probeId, finding.outcome),
      finding,
    ]),
  );

  const allKeys = Array.from(new Set([...previousMap.keys(), ...currentMap.keys()])).sort();
  const changes = allKeys.map((findingKey) => {
    const before = previousMap.get(findingKey) ?? null;
    const after = currentMap.get(findingKey) ?? null;

    let state: "NEW" | "PERSISTING" | "RESOLVED" | "RULE_CHANGED" | "NOT_COMPARABLE";
    if (!comparable) {
      state = "NOT_COMPARABLE";
    } else if (before && after && before.probeVersion !== after.probeVersion) {
      state = "RULE_CHANGED";
    } else if (!before && after) {
      state = "NEW";
    } else if (before && !after) {
      state = "RESOLVED";
    } else {
      state = "PERSISTING";
    }

    const probeId = after?.probeId ?? before!.probeId;
    return {
      findingKey,
      probeId,
      state,
      previous: before ? snapshot(before) : null,
      current: after ? snapshot(after) : null,
    };
  });

  const result = WatchResultSchema.parse({
    schema: "art/watch-result/v1",
    generatedAt: new Date().toISOString(),
    previousProfileId: previous.profileId,
    currentProfileId: current.profileId,
    comparable,
    reason,
    summary: {
      new: changes.filter((change) => change.state === "NEW").length,
      persisting: changes.filter((change) => change.state === "PERSISTING").length,
      resolved: changes.filter((change) => change.state === "RESOLVED").length,
      ruleChanged: changes.filter((change) => change.state === "RULE_CHANGED").length,
      notComparable: changes.filter((change) => change.state === "NOT_COMPARABLE").length,
    },
    changes,
    aiCalls: 0,
  });

  await writeFile(options.outPath, JSON.stringify(result, null, 2));
  return result;
}

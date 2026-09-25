import type { RequirementRefSchema } from "./contracts.js";
import type { z } from "zod";

type RequirementRef = z.infer<typeof RequirementRefSchema>;

const WCAG_CRITERION_TAG = /^wcag(\d)(\d)(\d)$/i;

export function requirementsFromAxeTags(tags: string[]): RequirementRef[] {
  const refs: RequirementRef[] = [];

  for (const tag of tags) {
    const match = tag.match(WCAG_CRITERION_TAG);
    if (!match) continue;
    refs.push({
      framework: "WCAG",
      criterion: `${match[1]}.${match[2]}.${match[3]}`,
      sourceTag: tag,
    });
  }

  return Array.from(
    new Map(refs.map((ref) => [`${ref.framework}:${ref.criterion}`, ref])).values(),
  );
}

import type { EvaluationFinding } from "./contracts.js";

export function validationMetrics(findings: EvaluationFinding[]) {
  const reviewed = findings.filter((f) => f.validation !== "not_reviewed");
  const confirmed = reviewed.filter((f) => f.validation === "confirmed").length;
  const falsePositive = reviewed.filter((f) => f.validation === "false_positive").length;
  const uncertain = reviewed.filter((f) => f.validation === "uncertain").length;
  const actionable = reviewed.filter((f) => f.actionability === "actionable").length;
  return {
    reviewed: reviewed.length,
    confirmed,
    falsePositive,
    uncertain,
    precisionAmongDecided: confirmed + falsePositive === 0 ? null : confirmed / (confirmed + falsePositive),
    actionableShare: reviewed.length === 0 ? null : actionable / reviewed.length,
  };
}

export function addedValue(findings: EvaluationFinding[]) {
  const baselineKeys = new Set(findings.filter(f=>f.source==="baseline_axe").map(f=>`${f.ruleId}|${f.surfaceId}`));
  const observatory = findings.filter(f=>f.source!=="baseline_axe");
  return {
    behavioral: observatory.filter(f=>f.source==="observatory_behavioral").length,
    staticBeyondBaseline: observatory.filter(f=>f.source==="observatory_static"&&!baselineKeys.has(`${f.ruleId}|${f.surfaceId}`)).length,
    requiresHumanReview: observatory.filter(f=>f.outcome==="incomplete").length,
  };
}

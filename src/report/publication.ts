import { createHash } from "node:crypto";
import { readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { AssessmentResultSchema, DigestSchema, EvidenceRefSchema } from "../evidence/contracts.js";
import { decidePublication, type PublicationInput } from "../evidence/policy.js";
import { AccessibilityReportSchema } from "./contracts.js";
import { SiteAccessibilityReportSchema } from "./site-contracts.js";

const IdSchema = z.string().trim().min(1);

export const PublicationCandidateSchema = z.strictObject({
  candidateId: IdSchema,
  record: z.unknown(),
  entry: z.unknown().optional(),
  currentDigests: z.unknown().optional(),
  execution: z.unknown().optional(),
  observation: z.unknown().optional(),
  adjudication: z.unknown().optional(),
}).readonly();

export const PublicationCandidateSetSchema = z.strictObject({
  schema: z.literal("art/publication-candidate-set/v1"),
  candidates: z.array(PublicationCandidateSchema).readonly(),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.candidates.forEach((candidate, index) => {
    if (seen.has(candidate.candidateId)) context.addIssue({ code: "custom", path: ["candidates", index, "candidateId"], message: "Duplicate candidateId" });
    seen.add(candidate.candidateId);
  });
}).readonly();

// This file is trusted caller context. Candidate input cannot assert its own
// reviewer authority, and a reviewer name alone is never sufficient.
const ProbeDigestsSchema = z.strictObject({ entryDigest: DigestSchema, implementationDigest: DigestSchema }).readonly();
const TrustedCandidateContextSchema = z.strictObject({
  candidateId: IdSchema,
  assessmentDigest: DigestSchema,
  observationDigest: DigestSchema.optional(),
  executionDigest: DigestSchema.optional(),
  verifiedEvidenceRefs: z.array(EvidenceRefSchema).readonly(),
  scope: z.strictObject({
    subjectId: IdSchema,
    obligationId: IdSchema,
    applicable: z.boolean(),
  }).readonly(),
  currentDigests: ProbeDigestsSchema.optional(),
}).readonly();
export const PublicationAuthoritySchema = z.strictObject({
  schema: z.literal("art/publication-authority/v1"),
  authorityId: IdSchema,
  sourceReportSha256: DigestSchema,
  authorizedReviewerIds: z.array(IdSchema).readonly(),
  authorizedReviewDigests: z.array(DigestSchema).readonly(),
  candidates: z.array(TrustedCandidateContextSchema).readonly(),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.candidates.forEach((candidate, index) => {
    if (seen.has(candidate.candidateId)) context.addIssue({ code: "custom", path: ["candidates", index, "candidateId"], message: "Duplicate trusted candidateId" });
    seen.add(candidate.candidateId);
  });
}).readonly();

const SourceReportSchema = z.union([AccessibilityReportSchema, SiteAccessibilityReportSchema]);
const PublishedFindingSchema = z.strictObject({
  candidateId: IdSchema,
  eligibility: z.enum(["automatic", "reviewer_approved"]),
  reasons: z.array(z.string()).readonly(),
  assessment: AssessmentResultSchema,
}).readonly();
const RejectedCandidateSchema = z.strictObject({
  candidateId: IdSchema,
  assessmentId: IdSchema.nullable(),
  reasons: z.array(z.string()).readonly(),
}).readonly();

export const PublicationExportSchema = z.strictObject({
  schema: z.literal("art/publication-export/v1"),
  generatedAt: z.string().datetime(),
  authorityId: IdSchema,
  sourceReport: z.strictObject({
    schema: z.enum(["art/accessibility-report/v1", "art/site-accessibility-report/v1", "art/site-accessibility-report/v2"]),
    sha256: DigestSchema,
    claimClass: z.literal("legacy_snapshot_not_policy_evaluated"),
    findingCount: z.number().int().nonnegative(),
  }).readonly(),
  summary: z.strictObject({
    included: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    automatic: z.number().int().nonnegative(),
    reviewerApproved: z.number().int().nonnegative(),
  }).readonly(),
  findings: z.array(PublishedFindingSchema).readonly(),
  rejected: z.array(RejectedCandidateSchema).readonly(),
}).readonly();

export type PublicationExport = z.infer<typeof PublicationExportSchema>;
export type PublicationAuthority = z.infer<typeof PublicationAuthoritySchema>;

function findingCount(report: z.infer<typeof SourceReportSchema>): number {
  return report.findings.length;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function publicationRecordDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export async function buildPublicationExportFromTrustedContext(options: {
  sourceReportPath: string;
  candidatesPath: string;
  authority: unknown;
  outPath: string;
  additionalInputPaths?: readonly string[];
  trustedAdjudications?: ReadonlyMap<string, unknown>;
  now?: () => Date;
}): Promise<PublicationExport> {
  const outPath = resolve(options.outPath);
  const inputPaths = [options.sourceReportPath, options.candidatesPath, ...(options.additionalInputPaths ?? [])].map((path) => resolve(path));
  const [inputRealPaths, outDirectory] = await Promise.all([
    Promise.all(inputPaths.map((path) => realpath(path))),
    realpath(dirname(outPath)),
  ]);
  const canonicalOutPath = await realpath(outPath).catch(() => join(outDirectory, basename(outPath)));
  if (inputRealPaths.includes(canonicalOutPath)) throw new Error("Publication export output must not overwrite a source report, candidate set or authority file.");
  const [sourceBytes, candidatesRaw] = await Promise.all([
    readFile(options.sourceReportPath),
    readFile(options.candidatesPath, "utf8"),
  ]);
  const sourceReport = SourceReportSchema.parse(JSON.parse(sourceBytes.toString("utf8")));
  const candidateSet = PublicationCandidateSetSchema.parse(JSON.parse(candidatesRaw));
  const authority = PublicationAuthoritySchema.parse(options.authority);
  const sourceReportSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  if (authority.sourceReportSha256 !== sourceReportSha256) throw new Error("Publication authority does not match the exact source report bytes.");
  const trustedCandidates = new Map(authority.candidates.map((candidate) => [candidate.candidateId, candidate]));

  const findings: z.infer<typeof PublishedFindingSchema>[] = [];
  const rejected: z.infer<typeof RejectedCandidateSchema>[] = [];
  const publishedAssessmentIds = new Set<string>();
  for (const candidate of candidateSet.candidates) {
    const trusted = trustedCandidates.get(candidate.candidateId);
    if (!trusted) {
      rejected.push({ candidateId: candidate.candidateId, assessmentId: null, reasons: ["Missing trusted evidence, scope and version context for this candidate."] });
      continue;
    }
    const exactRecords = trusted.assessmentDigest === publicationRecordDigest(candidate.record)
      && (candidate.observation === undefined
        ? trusted.observationDigest === undefined
        : trusted.observationDigest === publicationRecordDigest(candidate.observation))
      && (candidate.execution === undefined
        ? trusted.executionDigest === undefined
        : trusted.executionDigest === publicationRecordDigest(candidate.execution));
    if (!exactRecords) {
      const assessment = AssessmentResultSchema.safeParse(candidate.record);
      rejected.push({ candidateId: candidate.candidateId, assessmentId: assessment.success ? assessment.data.assessmentId : null, reasons: ["Candidate assessment, observation or execution does not match trusted exact-version context."] });
      continue;
    }
    const input: PublicationInput = {
      record: candidate.record,
      entry: candidate.entry,
      ...(trusted.currentDigests ? { currentDigests: trusted.currentDigests } : {}),
      execution: candidate.execution,
      observation: candidate.observation,
      adjudication: options.trustedAdjudications?.get(candidate.candidateId) ?? candidate.adjudication,
      verifiedEvidenceRefs: trusted.verifiedEvidenceRefs,
      scope: trusted.scope,
      authorizedReviewerIds: authority.authorizedReviewerIds,
      authorizedReviewDigests: authority.authorizedReviewDigests,
    };
    const decision = decidePublication(input);
    const assessment = AssessmentResultSchema.safeParse(candidate.record);
    if (decision.eligibility !== "internal_only" && assessment.success && !publishedAssessmentIds.has(assessment.data.assessmentId)) {
      const publishedAssessment = AssessmentResultSchema.parse({ ...assessment.data, publication_eligibility: decision.eligibility });
      findings.push({ candidateId: candidate.candidateId, eligibility: decision.eligibility, reasons: decision.reasons, assessment: publishedAssessment });
      publishedAssessmentIds.add(assessment.data.assessmentId);
    } else {
      const reasons = decision.eligibility !== "internal_only" && assessment.success
        ? ["Duplicate assessmentId is already included in this publication export."]
        : decision.reasons;
      rejected.push({ candidateId: candidate.candidateId, assessmentId: assessment.success ? assessment.data.assessmentId : null, reasons });
    }
  }

  const result = PublicationExportSchema.parse({
    schema: "art/publication-export/v1",
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    authorityId: authority.authorityId,
    sourceReport: {
      schema: sourceReport.schema,
      sha256: sourceReportSha256,
      claimClass: "legacy_snapshot_not_policy_evaluated",
      findingCount: findingCount(sourceReport),
    },
    summary: {
      included: findings.length,
      rejected: rejected.length,
      automatic: findings.filter((finding) => finding.eligibility === "automatic").length,
      reviewerApproved: findings.filter((finding) => finding.eligibility === "reviewer_approved").length,
    },
    findings,
    rejected,
  });
  const temporaryPath = join(outDirectory, `.${basename(outPath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(temporaryPath, JSON.stringify(result, null, 2), { flag: "wx" });
    await rename(temporaryPath, outPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return result;
}

export async function buildPublicationExport(options: {
  sourceReportPath: string;
  candidatesPath: string;
  authorityPath: string;
  outPath: string;
  now?: () => Date;
}): Promise<PublicationExport> {
  const authorityRaw = await readFile(options.authorityPath, "utf8");
  return buildPublicationExportFromTrustedContext({
    sourceReportPath: options.sourceReportPath,
    candidatesPath: options.candidatesPath,
    authority: JSON.parse(authorityRaw),
    outPath: options.outPath,
    additionalInputPaths: [options.authorityPath],
    ...(options.now ? { now: options.now } : {}),
  });
}

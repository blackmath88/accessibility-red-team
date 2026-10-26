import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { AssessmentResultSchema, EvidenceRefSchema, type EvidenceRef } from "../evidence/contracts.js";
import {
  buildPublicationExportFromTrustedContext,
  PublicationCandidateSetSchema,
  publicationRecordDigest,
  type PublicationAuthority,
  type PublicationExport,
} from "./publication.js";

const IdSchema = z.string().trim().min(1);
const LocalEvidenceBindingSchema = z.strictObject({
  ref: IdSchema,
  path: z.string().trim().min(1),
}).readonly();

export const LocalEvidenceBindingSetSchema = z.strictObject({
  schema: z.literal("art/local-evidence-binding-set/v1"),
  bindings: z.array(LocalEvidenceBindingSchema).readonly(),
}).superRefine((value, context) => {
  const refs = new Set<string>();
  value.bindings.forEach((binding, index) => {
    if (refs.has(binding.ref)) context.addIssue({ code: "custom", path: ["bindings", index, "ref"], message: "Duplicate evidence ref" });
    refs.add(binding.ref);
  });
}).readonly();

export type LocalEvidenceBindingSet = z.infer<typeof LocalEvidenceBindingSetSchema>;

function inside(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return suffix !== "" && !suffix.startsWith("..") && !isAbsolute(suffix);
}

async function verifyLocalEvidenceFiles(options: {
  evidenceRoot: string;
  requiredRefs: readonly EvidenceRef[];
  bindings: unknown;
}): Promise<{ receipts: EvidenceRef[]; paths: string[] }> {
  const root = await realpath(resolve(options.evidenceRoot));
  const bindings = LocalEvidenceBindingSetSchema.parse(options.bindings);
  const byRef = new Map(bindings.bindings.map((binding) => [binding.ref, binding]));
  const expectedByRef = new Map<string, string>();
  for (const ref of options.requiredRefs.map((item) => EvidenceRefSchema.parse(item))) {
    const previous = expectedByRef.get(ref.ref);
    if (previous && previous !== ref.sha256) throw new Error(`Evidence ref ${ref.ref} has conflicting expected hashes.`);
    expectedByRef.set(ref.ref, ref.sha256);
  }

  const verified: EvidenceRef[] = [];
  const paths: string[] = [];
  for (const [ref, expectedSha256] of expectedByRef) {
    const binding = byRef.get(ref);
    if (!binding) throw new Error(`No local artifact binding exists for evidence ref ${ref}.`);
    const artifactPath = await realpath(resolve(root, binding.path));
    if (!inside(root, artifactPath)) throw new Error(`Evidence ref ${ref} resolves outside the evidence root.`);
    if (!(await stat(artifactPath)).isFile()) throw new Error(`Evidence ref ${ref} does not resolve to a regular file.`);
    const bytes = await readFile(artifactPath);
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== expectedSha256) throw new Error(`Evidence ref ${ref} does not match its expected SHA-256.`);
    verified.push({ ref, sha256: actualSha256 });
    paths.push(artifactPath);
  }
  return { receipts: verified, paths };
}

export async function verifyLocalEvidence(options: {
  evidenceRoot: string;
  requiredRefs: readonly EvidenceRef[];
  bindings: unknown;
}): Promise<EvidenceRef[]> {
  return (await verifyLocalEvidenceFiles(options)).receipts;
}

export async function buildIntegrityOnlyPublicationExport(options: {
  sourceReportPath: string;
  candidatesPath: string;
  bindingsPath: string;
  evidenceRoot: string;
  outPath: string;
  now?: () => Date;
}): Promise<{ export: PublicationExport; verifiedEvidenceRefs: readonly EvidenceRef[] }> {
  const [sourceBytes, candidatesRaw, bindingsRaw] = await Promise.all([
    readFile(options.sourceReportPath),
    readFile(options.candidatesPath, "utf8"),
    readFile(options.bindingsPath, "utf8"),
  ]);
  const candidateSet = PublicationCandidateSetSchema.parse(JSON.parse(candidatesRaw));
  const assessments = candidateSet.candidates.flatMap((candidate) => {
    const parsed = AssessmentResultSchema.safeParse(candidate.record);
    return parsed.success ? [{ candidate, assessment: parsed.data }] : [];
  });
  const verified = await verifyLocalEvidenceFiles({
    evidenceRoot: options.evidenceRoot,
    requiredRefs: assessments.flatMap(({ assessment }) => assessment.evidenceRefs),
    bindings: JSON.parse(bindingsRaw),
  });
  const verifiedEvidenceRefs = verified.receipts;
  const verifiedByRef = new Map(verifiedEvidenceRefs.map((ref) => [ref.ref, ref]));
  const authority: PublicationAuthority = {
    schema: "art/publication-authority/v1",
    authorityId: "local-integrity-only:review-authority-unavailable",
    sourceReportSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    authorizedReviewerIds: [],
    authorizedReviewDigests: [],
    candidates: assessments.map(({ candidate, assessment }) => ({
      candidateId: candidate.candidateId,
      assessmentDigest: publicationRecordDigest(candidate.record),
      ...(candidate.observation === undefined ? {} : { observationDigest: publicationRecordDigest(candidate.observation) }),
      ...(candidate.execution === undefined ? {} : { executionDigest: publicationRecordDigest(candidate.execution) }),
      verifiedEvidenceRefs: assessment.evidenceRefs.flatMap((ref) => verifiedByRef.get(ref.ref) ?? []),
      // Candidate data can name the subject and obligation, but cannot establish applicability.
      // Keeping applicable=false preserves the separate, currently unavailable scope/review authority gate.
      scope: { subjectId: assessment.subjectId, obligationId: assessment.obligationId, applicable: false },
    })),
  };
  const result = await buildPublicationExportFromTrustedContext({
    sourceReportPath: options.sourceReportPath,
    candidatesPath: options.candidatesPath,
    authority,
    outPath: options.outPath,
    additionalInputPaths: [options.bindingsPath, ...verified.paths],
    ...(options.now ? { now: options.now } : {}),
  });
  return { export: result, verifiedEvidenceRefs };
}

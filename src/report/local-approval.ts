import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { mkdtemp, open, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  AssessmentResultSchema,
  DigestSchema,
  EvidenceRefSchema,
  HumanAdjudicationSchema,
  ReproducedObservationSchema,
  reviewDigest,
} from "../evidence/contracts.js";
import { verifyLocalEvidenceArtifacts } from "./local-integrity.js";
import {
  buildPublicationExportFromTrustedContext,
  PublicationCandidateSetSchema,
  publicationRecordDigest,
  type PublicationAuthority,
  type PublicationExport,
} from "./publication.js";

const IdSchema = z.string().trim().min(1);
const REVIEW_NAMESPACE = "accessibility-red-team-finding-review-v1";
const SSH_KEYGEN_PATH = "/usr/bin/ssh-keygen";

const ProbeVersionSchema = z.strictObject({
  probeId: IdSchema.nullable(),
  implementationVersion: IdSchema.nullable(),
  entryDigest: DigestSchema.nullable(),
  implementationDigest: DigestSchema.nullable(),
}).readonly();

export const LocalReviewRequestSchema = z.strictObject({
  schema: z.literal("art/local-finding-review-request/v1"),
  approvalId: IdSchema,
  reviewerId: IdSchema,
  decision: z.literal("approve_finding"),
  decidedAt: z.string().datetime(),
  note: z.string().trim().min(1),
  candidateId: IdSchema,
  sourceReportSha256: DigestSchema,
  assessmentId: IdSchema,
  assessmentDigest: DigestSchema,
  assessment: z.unknown(),
  observationDigest: DigestSchema,
  observation: z.unknown(),
  executionDigest: DigestSchema.optional(),
  execution: z.unknown().optional(),
  subjectId: IdSchema,
  obligationId: IdSchema,
  claimVersion: DigestSchema,
  evidenceVersion: DigestSchema,
  evidenceRefs: z.array(EvidenceRefSchema).min(1).readonly(),
  probeVersion: ProbeVersionSchema,
  scope: z.strictObject({ applicable: z.literal(true) }).readonly(),
}).readonly();

const LocalApprovalEnvelopeSchema = z.strictObject({
  schema: z.literal("art/local-finding-approval-envelope/v1"),
  requestSha256: DigestSchema,
  request: LocalReviewRequestSchema,
  sshSignature: z.string().trim().min(1),
}).readonly();

export type LocalReviewRequest = z.infer<typeof LocalReviewRequestSchema>;

function reviewBytes(request: LocalReviewRequest): Buffer {
  return Buffer.from(`${JSON.stringify(request, null, 2)}\n`);
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifySshSignature(options: {
  requestBytes: Buffer;
  signature: string;
  allowedSignersPath: string;
  reviewerId: string;
}): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "art-review-signature-"));
  const signaturePath = join(directory, "request.sig");
  try {
    await writeFile(signaturePath, options.signature, { flag: "wx", mode: 0o600 });
    await new Promise<void>((accept, reject) => {
      const child = spawn(SSH_KEYGEN_PATH, [
        "-Y", "verify",
        "-f", options.allowedSignersPath,
        "-I", options.reviewerId,
        "-n", REVIEW_NAMESPACE,
        "-s", signaturePath,
      ], { stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", reject);
      child.stdin.on("error", reject);
      child.on("close", (code) => code === 0
        ? accept()
        : reject(new Error(`Approval signature is not authorized for reviewer ${options.reviewerId}.${stderr.trim() ? ` ${stderr.trim()}` : ""}`)));
      child.stdin.end(options.requestBytes);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function loadCandidateInputs(options: {
  sourceReportPath: string;
  candidatesPath: string;
  bindingsPath: string;
  evidenceRoot: string;
}) {
  const [sourceBytes, candidatesRaw, bindingsRaw] = await Promise.all([
    readFile(options.sourceReportPath),
    readFile(options.candidatesPath, "utf8"),
    readFile(options.bindingsPath, "utf8"),
  ]);
  const candidateSet = PublicationCandidateSetSchema.parse(JSON.parse(candidatesRaw));
  const bindings = JSON.parse(bindingsRaw);
  const assessments = candidateSet.candidates.flatMap((candidate) => {
    const assessment = AssessmentResultSchema.safeParse(candidate.record);
    return assessment.success ? [{ candidate, assessment: assessment.data }] : [];
  });
  const verified = await verifyLocalEvidenceArtifacts({
    evidenceRoot: options.evidenceRoot,
    requiredRefs: assessments.flatMap(({ assessment }) => assessment.evidenceRefs),
    bindings,
  });
  return { sourceBytes, candidateSet, assessments, verified };
}

export async function prepareLocalReviewRequest(options: {
  sourceReportPath: string;
  candidatesPath: string;
  bindingsPath: string;
  evidenceRoot: string;
  candidateId: string;
  reviewerId: string;
  note: string;
  outPath: string;
  now?: () => Date;
}): Promise<{ request: LocalReviewRequest; requestSha256: string }> {
  const loaded = await loadCandidateInputs(options);
  const selected = loaded.assessments.find(({ candidate }) => candidate.candidateId === options.candidateId);
  if (!selected) throw new Error(`Candidate ${options.candidateId} is missing or is not a valid assessment.`);
  const { candidate, assessment } = selected;
  if (assessment.assessment_mode === "automated") {
    throw new Error("Local finding approval does not promote or authorize automated probes.");
  }
  if (assessment.verification !== "human_adjudicated") {
    throw new Error("The assessment must explicitly require the existing human-adjudicated publication path.");
  }
  ReproducedObservationSchema.parse(candidate.observation);
  const request = LocalReviewRequestSchema.parse({
    schema: "art/local-finding-review-request/v1",
    approvalId: randomUUID(),
    reviewerId: options.reviewerId,
    decision: "approve_finding",
    decidedAt: (options.now ?? (() => new Date()))().toISOString(),
    note: options.note,
    candidateId: candidate.candidateId,
    sourceReportSha256: sha256(loaded.sourceBytes),
    assessmentId: assessment.assessmentId,
    assessmentDigest: publicationRecordDigest(candidate.record),
    assessment: candidate.record,
    observationDigest: publicationRecordDigest(candidate.observation),
    observation: candidate.observation,
    ...(candidate.execution === undefined ? {} : { executionDigest: publicationRecordDigest(candidate.execution), execution: candidate.execution }),
    subjectId: assessment.subjectId,
    obligationId: assessment.obligationId,
    claimVersion: assessment.claimVersion,
    evidenceVersion: assessment.evidenceVersion,
    evidenceRefs: assessment.evidenceRefs,
    probeVersion: {
      probeId: assessment.probeId,
      implementationVersion: assessment.implementationVersion,
      entryDigest: assessment.entryDigest,
      implementationDigest: assessment.implementationDigest,
    },
    scope: { applicable: true },
  });
  const bytes = reviewBytes(request);
  await writeFile(options.outPath, bytes, { flag: "wx", mode: 0o600 });
  return { request, requestSha256: sha256(bytes) };
}

export async function recordLocalApproval(options: {
  requestPath: string;
  signaturePath: string;
  allowedSignersPath: string;
  approvalsPath: string;
}): Promise<{ approvalId: string; requestSha256: string }> {
  const [requestRaw, signature, allowedSignersRealPath, requestRealPath, signatureRealPath] = await Promise.all([
    readFile(options.requestPath),
    readFile(options.signaturePath, "utf8"),
    realpath(options.allowedSignersPath),
    realpath(options.requestPath),
    realpath(options.signaturePath),
  ]);
  const request = LocalReviewRequestSchema.parse(JSON.parse(requestRaw.toString("utf8")));
  const canonical = reviewBytes(request);
  if (!requestRaw.equals(canonical)) throw new Error("Review request is not in canonical byte form.");
  await verifySshSignature({ requestBytes: canonical, signature, allowedSignersPath: allowedSignersRealPath, reviewerId: request.reviewerId });
  const requestSha256 = sha256(canonical);
  const envelope = LocalApprovalEnvelopeSchema.parse({
    schema: "art/local-finding-approval-envelope/v1",
    requestSha256,
    request,
    sshSignature: signature,
  });
  const approvalsPath = resolve(options.approvalsPath);
  const protectedStats = await Promise.all([allowedSignersRealPath, requestRealPath, signatureRealPath].map((path) => stat(path)));
  const handle = await open(approvalsPath, constants.O_APPEND | constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error("Approval store must be a regular file.");
    if (protectedStats.some((item) => item.dev === metadata.dev && item.ino === metadata.ino)) {
      throw new Error("Approval store must not overwrite or alias the request, signature or reviewer configuration.");
    }
    if (metadata.size > 0) {
      const lastByte = Buffer.alloc(1);
      await handle.read(lastByte, 0, 1, metadata.size - 1);
      if (lastByte[0] !== 0x0a) throw new Error("Existing approval store must end with a newline before appending.");
    }
    await handle.writeFile(`${JSON.stringify(envelope)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  return { approvalId: request.approvalId, requestSha256 };
}

async function loadVerifiedApprovals(approvalsPath: string, allowedSignersPath: string) {
  const raw = await readFile(approvalsPath, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  const approvals = [] as Array<z.infer<typeof LocalApprovalEnvelopeSchema>>;
  for (const [index, line] of lines.entries()) {
    let envelope: z.infer<typeof LocalApprovalEnvelopeSchema>;
    try {
      envelope = LocalApprovalEnvelopeSchema.parse(JSON.parse(line));
    } catch (error) {
      throw new Error(`Approval store line ${index + 1} is malformed.`, { cause: error });
    }
    const bytes = reviewBytes(envelope.request);
    if (sha256(bytes) !== envelope.requestSha256) throw new Error(`Approval store line ${index + 1} has a modified request.`);
    await verifySshSignature({
      requestBytes: bytes,
      signature: envelope.sshSignature,
      allowedSignersPath,
      reviewerId: envelope.request.reviewerId,
    });
    approvals.push(envelope);
  }
  return approvals;
}

export async function buildApprovedLocalPublicationExport(options: {
  sourceReportPath: string;
  candidatesPath: string;
  bindingsPath: string;
  evidenceRoot: string;
  approvalsPath: string;
  allowedSignersPath: string;
  outPath: string;
  now?: () => Date;
}): Promise<{ export: PublicationExport; verifiedEvidenceRefs: number; verifiedApprovals: number }> {
  const loaded = await loadCandidateInputs(options);
  const approvals = await loadVerifiedApprovals(options.approvalsPath, options.allowedSignersPath);
  const sourceReportSha256 = sha256(loaded.sourceBytes);
  const verifiedByRef = new Map(loaded.verified.receipts.map((ref) => [ref.ref, ref]));
  const trustedAdjudications = new Map<string, unknown>();
  const authorizedReviewerIds = new Set<string>();
  const authorizedReviewDigests = new Set<string>();
  const acceptedRequestDigests: string[] = [];

  const contexts: PublicationAuthority["candidates"] = loaded.assessments.map(({ candidate, assessment }) => {
    const current = approvals.find(({ request }) => request.candidateId === candidate.candidateId
      && request.sourceReportSha256 === sourceReportSha256
      && request.assessmentId === assessment.assessmentId
      && request.assessmentDigest === publicationRecordDigest(candidate.record)
      && request.assessmentDigest === publicationRecordDigest(request.assessment)
      && request.observationDigest === (candidate.observation === undefined ? "" : publicationRecordDigest(candidate.observation))
      && request.observationDigest === publicationRecordDigest(request.observation)
      && request.executionDigest === (candidate.execution === undefined ? undefined : publicationRecordDigest(candidate.execution))
      && request.executionDigest === (request.execution === undefined ? undefined : publicationRecordDigest(request.execution))
      && request.subjectId === assessment.subjectId
      && request.obligationId === assessment.obligationId
      && request.claimVersion === assessment.claimVersion
      && request.evidenceVersion === assessment.evidenceVersion
      && publicationRecordDigest(request.evidenceRefs) === publicationRecordDigest(assessment.evidenceRefs)
      && request.probeVersion.probeId === assessment.probeId
      && request.probeVersion.implementationVersion === assessment.implementationVersion
      && request.probeVersion.entryDigest === assessment.entryDigest
      && request.probeVersion.implementationDigest === assessment.implementationDigest);
    if (current) {
      const adjudication = HumanAdjudicationSchema.parse({
        schema: "art/human-adjudication/v1",
        adjudicationId: current.request.approvalId,
        assessmentId: current.request.assessmentId,
        reviewerId: current.request.reviewerId,
        author: { kind: "human", id: current.request.reviewerId },
        decidedAt: current.request.decidedAt,
        decision: current.request.decision,
        claimVersion: current.request.claimVersion,
        evidenceVersion: current.request.evidenceVersion,
        synthetic: false,
        note: current.request.note,
      });
      trustedAdjudications.set(candidate.candidateId, adjudication);
      authorizedReviewerIds.add(adjudication.reviewerId);
      authorizedReviewDigests.add(reviewDigest(adjudication));
      acceptedRequestDigests.push(current.requestSha256);
    }
    return {
      candidateId: candidate.candidateId,
      assessmentDigest: publicationRecordDigest(candidate.record),
      ...(candidate.observation === undefined ? {} : { observationDigest: publicationRecordDigest(candidate.observation) }),
      ...(candidate.execution === undefined ? {} : { executionDigest: publicationRecordDigest(candidate.execution) }),
      verifiedEvidenceRefs: assessment.evidenceRefs.flatMap((ref) => verifiedByRef.get(ref.ref) ?? []),
      scope: { subjectId: assessment.subjectId, obligationId: assessment.obligationId, applicable: Boolean(current) },
    };
  });
  const authority: PublicationAuthority = {
    schema: "art/publication-authority/v1",
    authorityId: `local-ssh-review:${sha256(acceptedRequestDigests.sort().join("\n"))}`,
    sourceReportSha256,
    authorizedReviewerIds: [...authorizedReviewerIds],
    authorizedReviewDigests: [...authorizedReviewDigests],
    candidates: contexts,
  };
  const result = await buildPublicationExportFromTrustedContext({
    sourceReportPath: options.sourceReportPath,
    candidatesPath: options.candidatesPath,
    authority,
    outPath: options.outPath,
    additionalInputPaths: [options.bindingsPath, options.approvalsPath, options.allowedSignersPath, ...loaded.verified.paths],
    trustedAdjudications,
    ...(options.now ? { now: options.now } : {}),
  });
  return { export: result, verifiedEvidenceRefs: loaded.verified.receipts.length, verifiedApprovals: approvals.length };
}

export { REVIEW_NAMESPACE };

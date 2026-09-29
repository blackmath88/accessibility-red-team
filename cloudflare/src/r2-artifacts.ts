import { ArtifactKindSchema, ArtifactSchema, type Artifact } from "../../src/control-center/contracts.js";

const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

function hexToBytes(hex: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error("x-artifact-sha256 must be lowercase SHA-256 hex");
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

export function artifactStorageKey(sha256: string): string {
  hexToBytes(sha256);
  return `sha256/${sha256.slice(0, 2)}/${sha256}`;
}

export async function storeArtifact(
  bucket: R2Bucket,
  runId: string,
  request: Request,
): Promise<Artifact> {
  if (!request.body) throw new Error("Artifact body is required");
  const sha256 = request.headers.get("x-artifact-sha256") ?? "";
  const kind = ArtifactKindSchema.parse(request.headers.get("x-artifact-kind"));
  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const lengthHeader = request.headers.get("content-length");
  const bytes = lengthHeader === null ? NaN : Number(lengthHeader);
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_ARTIFACT_BYTES) {
    throw new Error(`content-length must be between 0 and ${MAX_ARTIFACT_BYTES}`);
  }

  const storageKey = artifactStorageKey(sha256);
  const existing = await bucket.head(storageKey);
  if (!existing) {
    const stored = await bucket.put(storageKey, request.body, {
      sha256: hexToBytes(sha256),
      httpMetadata: { contentType },
      customMetadata: { sha256 },
      onlyIf: { etagDoesNotMatch: "*" },
    });
    if (!stored) {
      const raced = await bucket.head(storageKey);
      if (!raced) throw new Error("Artifact write precondition failed");
    }
  } else if (existing.size !== bytes || existing.customMetadata?.sha256 !== sha256) {
    throw new Error("Content-addressed R2 object metadata mismatch");
  }

  return ArtifactSchema.parse({
    schema: "art/control-center-artifact/v1",
    id: `artifact_${crypto.randomUUID()}`,
    runId,
    kind,
    contentType,
    storageKey,
    sha256,
    bytes,
    createdAt: new Date().toISOString(),
  });
}

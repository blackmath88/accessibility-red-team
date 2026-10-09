import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

// Minimal D1 adapter over node:sqlite so the real Worker, SQL and migrations run in tests.
type Value = string | number | null;
class Statement {
  constructor(private readonly db: DatabaseSync, private readonly sql: string, private readonly params: Value[] = []) {}
  bind(...params: Value[]) { return new Statement(this.db, this.sql, params.map((p) => p === undefined ? null : p)); }
  async first<T>() { return (this.db.prepare(this.sql).get(...this.params) ?? null) as T | null; }
  async all<T>() { return { results: this.db.prepare(this.sql).all(...this.params) as T[] }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.params); return { meta: { changes: Number(r.changes) } }; }
}
export function sqliteD1(): { d1: D1Database; db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(file, dir), "utf8"));
  const batch = async (statements: Statement[]) => { db.exec("BEGIN"); try { const out = []; for (const s of statements) out.push(await s.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } };
  return { db, d1: { prepare: (sql: string) => new Statement(db, sql), batch } as unknown as D1Database };
}

export function memoryR2(): R2Bucket & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async head(key: string) { const o = objects.get(key); return o ? { size: o.byteLength, customMetadata: { sha256: key.split("/").at(-1) } } : null; },
    async put(key: string, body: ReadableStream | ArrayBuffer, options: { sha256: Uint8Array }) {
      if (objects.has(key)) return null;
      const bytes = new Uint8Array(body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer());
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      if (Buffer.compare(Buffer.from(digest), Buffer.from(options.sha256)) !== 0) throw new Error("checksum mismatch");
      objects.set(key, bytes); return { key };
    },
  } as unknown as R2Bucket & { objects: Map<string, Uint8Array> };
}

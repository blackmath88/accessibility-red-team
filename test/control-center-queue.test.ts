import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionPolicySchema, canonicalHostKey, retryDelaySeconds } from "../src/control-center/leases.js";
import { MemoryRunQueue } from "../src/control-center/queue.js";
import { RunSchema } from "../src/control-center/contracts.js";

const run=(id:string,propertyId:string)=>RunSchema.parse({schema:"art/control-center-run/v1",id,caseId:"case",propertyId,kind:"assessment",state:"queued",idempotencyKey:id,requestedBy:"op",requestedAt:"2026-09-29T05:00:00.000Z",startedAt:null,completedAt:null,engineRevision:"git:x",error:null});

test("canonical host key is stable",()=>assert.equal(canonicalHostKey("https://WWW.Example.com./a"),"www.example.com"));
test("retry policy backs off exponentially",()=>{const p=ExecutionPolicySchema.parse({retryBaseSeconds:30});assert.equal(retryDelaySeconds(1,p),30);assert.equal(retryDelaySeconds(3,p),120)});

test("queue prevents concurrent claims against same host",async()=>{
 const p=ExecutionPolicySchema.parse({maxConcurrentPerHost:1,leaseSeconds:300});
 const q=new MemoryRunQueue([run("r1","p1"),run("r2","p2")],{p1:"https://example.com/a",p2:"https://example.com/b"});
 const now=new Date("2026-09-29T05:00:00Z");
 const first=await q.claimNext({workerId:"w1",now,policy:p}); assert.equal(first?.run.id,"r1");
 const second=await q.claimNext({workerId:"w2",now,policy:p}); assert.equal(second,null);
 await q.releaseLease({runId:"r1",workerId:"w1"});
 const third=await q.claimNext({workerId:"w2",now,policy:p}); assert.equal(third?.run.id,"r1");
});

test("expired lease can be reclaimed",async()=>{
 const p=ExecutionPolicySchema.parse({leaseSeconds:30});
 const q=new MemoryRunQueue([run("r1","p1")],{p1:"https://example.com"});
 const first=await q.claimNext({workerId:"w1",now:new Date("2026-09-29T05:00:00Z"),policy:p}); assert.ok(first);
 const second=await q.claimNext({workerId:"w2",now:new Date("2026-09-29T05:01:00Z"),policy:p}); assert.equal(second?.run.id,"r1");
});

export type RunSummary={id:string;kind:"scan"|"journeys"|"assessment";state:"queued"|"running"|"succeeded"|"partial"|"failed"|"cancelled";stage:string;executionProvider:"nebuchadnezzar_worker"|"github_actions";workerId:string|null;attempt:number;requestedAt:string;completedAt:string|null};
export type QueueItem={caseId:string;organizationId:string;organizationName:string;organizationType:string;canton:string|null;propertyId:string;propertyUrl:string;caseState:string;latestRun:RunSummary|null;artifactCounts:Record<string,number>;needsHumanReview:boolean;nextAction:"run"|"review"|"report"|"outreach"|"wait"|"rescan"};
export type QueueResponse={generatedAt:string;items:QueueItem[]};
export type Runtime={environment:string;engineRevision:string|null;operator:string;canExecute:boolean;runners:Array<{id:string;provider:string;displayName:string;enabled:boolean;lastSeenAt:string|null}>};
export interface ControlCenterApi{listCases():Promise<QueueResponse>;runtime():Promise<Runtime|null>;requestAssessment(item:QueueItem,engineRevision:string):Promise<RunSummary>;cancelRun(runId:string):Promise<RunSummary>}
async function send<T>(path:string,body:unknown):Promise<T>{const r=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(payload.error??`Request failed: ${r.status}`);return payload as T}
export class StaticControlCenterApi implements ControlCenterApi{
  constructor(private readonly base=import.meta.env.DEV?"./data":"/api/v1"){}
  async listCases(){const path=import.meta.env.DEV?`${this.base}/case-queue.json`:`${this.base}/cases`;const r=await fetch(path);if(!r.ok)throw new Error(`Case queue failed: ${r.status}`);return r.json() as Promise<QueueResponse>}
  async runtime(){if(import.meta.env.DEV)return null;const r=await fetch(`${this.base}/runtime`);if(!r.ok)throw new Error(`Runtime failed: ${r.status}`);return r.json() as Promise<Runtime>}
  // One request per case, engine revision and UTC day: double clicks replay instead of queuing twice.
  async requestAssessment(item:QueueItem,engineRevision:string){const day=new Date().toISOString().slice(0,10);return (await send<{run:RunSummary}>(`${this.base}/runs`,{organizationId:item.organizationId,propertyId:item.propertyId,caseId:item.caseId,kind:"assessment",engineRevision,executionProvider:"nebuchadnezzar_worker",idempotencyKey:`ui:${item.caseId}:assessment:${engineRevision}:${day}`})).run}
  async cancelRun(runId:string){return (await send<{run:RunSummary}>(`${this.base}/runs/${encodeURIComponent(runId)}/cancel`,{})).run}
}

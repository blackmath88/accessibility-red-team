export type RunSummary={id:string;kind:"scan"|"journeys"|"assessment";state:"queued"|"running"|"succeeded"|"partial"|"failed"|"cancelled";stage:string;executionProvider:"nebuchadnezzar_worker"|"github_actions";workerId:string|null;attempt:number;requestedAt:string;completedAt:string|null};
export type QueueItem={caseId:string;organizationId:string;organizationName:string;organizationType:string;canton:string|null;propertyId:string;propertyUrl:string;caseState:string;latestRun:RunSummary|null;artifactCounts:Record<string,number>;needsHumanReview:boolean;nextAction:"run"|"review"|"report"|"outreach"|"wait"|"rescan"};
export type QueueResponse={generatedAt:string;items:QueueItem[]};
export interface ControlCenterApi{listCases():Promise<QueueResponse>}
export class StaticControlCenterApi implements ControlCenterApi{
  constructor(private readonly base=import.meta.env.DEV?"./data":"/api/v1"){}
  async listCases(){const path=import.meta.env.DEV?`${this.base}/case-queue.json`:`${this.base}/cases`;const r=await fetch(path);if(!r.ok)throw new Error(`Case queue failed: ${r.status}`);return r.json() as Promise<QueueResponse>}
}

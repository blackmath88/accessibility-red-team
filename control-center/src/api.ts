export type QueueItem={caseId:string;organizationId:string;organizationName:string;organizationType:string;canton:string|null;propertyId:string;propertyUrl:string;caseState:string;latestRun:unknown|null;artifactCounts:Record<string,number>;needsHumanReview:boolean;nextAction:"run"|"review"|"report"|"outreach"|"wait"|"rescan"};
export type QueueResponse={generatedAt:string;items:QueueItem[]};
export interface ControlCenterApi{listCases():Promise<QueueResponse>}
export class StaticControlCenterApi implements ControlCenterApi{
  constructor(private readonly base="./data"){}
  async listCases(){const r=await fetch(`${this.base}/case-queue.json`);if(!r.ok)throw new Error(`Case queue failed: ${r.status}`);return r.json() as Promise<QueueResponse>}
}

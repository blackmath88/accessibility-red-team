import { z } from "zod";

const ReportSchema=z.object({
 schema:z.literal("art/accessibility-report/v1"),generatedAt:z.string(),profileId:z.string(),
 target:z.object({requestedUrl:z.string(),finalUrl:z.string()}),
 summary:z.object({violations:z.number(),incomplete:z.number(),applicable:z.number(),bestPractice:z.number(),unknownApplicability:z.number()}),
 findings:z.array(z.object({probe:z.object({probeId:z.string(),surfaceId:z.string(),stateId:z.string(),outcome:z.string(),impact:z.string(),help:z.string(),requirements:z.array(z.object({framework:z.string(),criterion:z.string(),sourceTag:z.string()})),nodes:z.array(z.unknown())})})),
 aiCalls:z.number()
});
type Row={case_id:string;organization_id:string;organization_name:string;canton:string|null;property_url:string;run_id:string;state:string;attempt:number;requested_at:string;started_at:string|null;completed_at:string|null;engine_revision:string;artifact_id:string|null;storage_key:string|null;sha256:string|null;bytes:number|null};
export async function buildPopulationAnalysis(db:D1Database,bucket:R2Bucket,canton:string){
 const rows=(await db.prepare(`WITH latest AS (SELECT r.*,ROW_NUMBER() OVER(PARTITION BY r.case_id ORDER BY r.requested_at DESC) rn FROM runs r)
 SELECT c.id case_id,o.id organization_id,o.name organization_name,o.canton,p.url property_url,r.id run_id,r.state,r.attempt,r.requested_at,r.started_at,r.completed_at,r.engine_revision,
 a.id artifact_id,a.storage_key,a.sha256,a.bytes FROM assessment_cases c JOIN organizations o ON o.id=c.organization_id JOIN digital_properties p ON p.id=c.property_id
 JOIN latest r ON r.case_id=c.id AND r.rn=1 LEFT JOIN artifacts a ON a.run_id=r.id AND a.kind='report_json' WHERE o.canton=? ORDER BY o.name`).bind(canton).all<Row>()).results;
 const findings:any[]=[],runs:any[]=[],diagnostics:any[]=[];
 for(const row of rows){let report:any=null;if(row.storage_key){try{const obj=await bucket.get(row.storage_key);if(!obj)throw new Error("R2 object missing");report=ReportSchema.parse(await obj.json())}catch(e){diagnostics.push({organizationId:row.organization_id,runId:row.run_id,artifactId:row.artifact_id,kind:"invalid_report",message:e instanceof Error?e.message:String(e)})}}else diagnostics.push({organizationId:row.organization_id,runId:row.run_id,kind:"missing_report"});
  runs.push({caseId:row.case_id,organizationId:row.organization_id,organizationName:row.organization_name,canton:row.canton,propertyUrl:row.property_url,runId:row.run_id,state:row.state,attempt:row.attempt,requestedAt:row.requested_at,startedAt:row.started_at,completedAt:row.completed_at,engineRevision:row.engine_revision,reportArtifact:row.artifact_id?{id:row.artifact_id,sha256:row.sha256,bytes:row.bytes}:null,summary:report?.summary??null,aiCalls:report?.aiCalls??null});
  for(const f of report?.findings??[])findings.push({organizationId:row.organization_id,organizationName:row.organization_name,propertyUrl:row.property_url,runId:row.run_id,reportArtifactId:row.artifact_id,reportSha256:row.sha256,probeId:f.probe.probeId,surfaceId:f.probe.surfaceId,stateId:f.probe.stateId,outcome:f.probe.outcome,impact:f.probe.impact,help:f.probe.help,wcag:f.probe.requirements.map((x:any)=>x.criterion),affectedNodes:f.probe.nodes.length});
 }
 return {schema:"art/population-analysis/v1",generatedAt:new Date().toISOString(),population:{country:"CH",canton,cases:rows.length,runs:runs.length,reports:runs.filter(r=>r.summary).length,findings:findings.length},runs,findings,diagnostics};
}

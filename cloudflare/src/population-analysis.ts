import { z } from "zod";

const RequirementRefSchema=z.object({framework:z.literal("WCAG"),criterion:z.string(),sourceTag:z.string()});
const OccurrenceSchema=z.object({surfaceId:z.string(),url:z.string(),target:z.array(z.string()),html:z.string(),failureSummary:z.string().nullable()});
const EvidenceFindingSchema=z.object({
 schema:z.literal("art/evidence-finding/v1"),findingId:z.string(),probeId:z.string(),probeVersion:z.string(),
 outcome:z.enum(["violation","incomplete"]),impact:z.enum(["minor","moderate","serious","critical","unknown"]),
 help:z.string(),helpUrl:z.string().url(),tags:z.array(z.string()),requirements:z.array(RequirementRefSchema),
 affectedSurfaces:z.number().int().nonnegative(),occurrenceCount:z.number().int().nonnegative(),prevalence:z.number().min(0).max(1),
 templateLeverage:z.enum(["single_surface","repeated"]),occurrences:z.array(OccurrenceSchema)
});
const ResolutionSchema=z.object({criterion:z.string(),status:z.string()}).passthrough();
const SiteFindingSchema=z.object({finding:EvidenceFindingSchema,requirements:z.array(ResolutionSchema)});
const SiteSummaryV1=z.object({findings:z.number(),repeatedFindings:z.number(),applicableFindings:z.number(),needsReview:z.number()});
const SiteSummaryV2=SiteSummaryV1.extend({journeyPasses:z.number(),journeyNeedsReview:z.number(),journeyViolations:z.number()});
const SiteReportV1=z.object({schema:z.literal("art/site-accessibility-report/v1"),generatedAt:z.string(),profileId:z.string(),entrypoint:z.string().url(),totalSurfaces:z.number(),summary:SiteSummaryV1,findings:z.array(SiteFindingSchema),aiCalls:z.number()});
const SiteReportV2=z.object({schema:z.literal("art/site-accessibility-report/v2"),generatedAt:z.string(),profileId:z.string(),entrypoint:z.string().url(),totalSurfaces:z.number(),summary:SiteSummaryV2,findings:z.array(SiteFindingSchema),journeys:z.array(z.unknown()),aiCalls:z.number()});
const SiteReportSchema=z.union([SiteReportV1,SiteReportV2]);
type Row={case_id:string;organization_id:string;organization_name:string;canton:string|null;property_url:string;run_id:string;state:string;attempt:number;requested_at:string;started_at:string|null;completed_at:string|null;engine_revision:string;artifact_id:string|null;storage_key:string|null;sha256:string|null;bytes:number|null};

export async function buildPopulationAnalysis(db:D1Database,bucket:R2Bucket,canton:string){
 const rows=(await db.prepare(`WITH latest AS (SELECT r.*,ROW_NUMBER() OVER(PARTITION BY r.case_id ORDER BY r.requested_at DESC) rn FROM runs r)
 SELECT c.id case_id,o.id organization_id,o.name organization_name,o.canton,p.url property_url,r.id run_id,r.state,r.attempt,r.requested_at,r.started_at,r.completed_at,r.engine_revision,
 a.id artifact_id,a.storage_key,a.sha256,a.bytes FROM assessment_cases c JOIN organizations o ON o.id=c.organization_id JOIN digital_properties p ON p.id=c.property_id
 JOIN latest r ON r.case_id=c.id AND r.rn=1 LEFT JOIN artifacts a ON a.id=(SELECT a2.id FROM artifacts a2 WHERE a2.run_id=r.id AND a2.kind='report_json' ORDER BY a2.created_at DESC,a2.id DESC LIMIT 1)
 WHERE o.canton=? ORDER BY o.name`).bind(canton).all<Row>()).results;
 const findings:any[]=[],runs:any[]=[],diagnostics:any[]=[];
 for(const row of rows){
  let report:z.infer<typeof SiteReportSchema>|null=null;
  if(row.storage_key){try{const obj=await bucket.get(row.storage_key);if(!obj)throw new Error("R2 object missing");report=SiteReportSchema.parse(await obj.json())}
  catch(e){diagnostics.push({organizationId:row.organization_id,runId:row.run_id,artifactId:row.artifact_id,kind:"invalid_report",message:e instanceof Error?e.message:String(e)})}}
  else diagnostics.push({organizationId:row.organization_id,runId:row.run_id,kind:"missing_report"});
  runs.push({caseId:row.case_id,organizationId:row.organization_id,organizationName:row.organization_name,canton:row.canton,propertyUrl:row.property_url,runId:row.run_id,state:row.state,attempt:row.attempt,requestedAt:row.requested_at,startedAt:row.started_at,completedAt:row.completed_at,engineRevision:row.engine_revision,reportArtifact:row.artifact_id?{id:row.artifact_id,sha256:row.sha256,bytes:row.bytes}:null,summary:report?.summary??null,aiCalls:report?.aiCalls??null});
  for(const wrapped of report?.findings??[]){const f=wrapped.finding;findings.push({organizationId:row.organization_id,organizationName:row.organization_name,propertyUrl:row.property_url,runId:row.run_id,reportArtifactId:row.artifact_id,reportSha256:row.sha256,findingId:f.findingId,probeId:f.probeId,outcome:f.outcome,impact:f.impact,help:f.help,wcag:f.requirements.map(x=>x.criterion),affectedSurfaces:f.affectedSurfaces,occurrenceCount:f.occurrenceCount,prevalence:f.prevalence,templateLeverage:f.templateLeverage});}
 }
 return {schema:"art/population-analysis/v1",generatedAt:new Date().toISOString(),population:{country:"CH",canton,cases:rows.length,runs:runs.length,reports:runs.filter(r=>r.summary).length,findings:findings.length},runs,findings,diagnostics};
}

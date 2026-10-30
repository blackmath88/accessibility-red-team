import React,{useEffect,useRef,useState} from "react";
import type {CampaignView} from "./campaignProjection";

// Live view of the local experimental campaign, read by polling the dev adapter (/campaign-api). Read-only: no controls.
// A failed poll keeps the last state on screen, marked as disconnected; the campaign itself keeps running.
const POLL_MS=2500;
const ago=(iso:string|null,now:number)=>iso?`${Math.max(0,Math.round((now-Date.parse(iso))/1000))} s ago`:"never";
const fmt=(n:number)=>n.toLocaleString("en-US");

export default function CampaignPanel(){
 const[ids,setIds]=useState<Array<{id:string;status:string}>>([]),[id,setId]=useState<string|null>(null),[view,setView]=useState<CampaignView|null>(null);
 const[conn,setConn]=useState<{ok:boolean;at:number;error?:string}>({ok:false,at:0}),[now,setNow]=useState(Date.now());
 const idRef=useRef(id);idRef.current=id;
 useEffect(()=>{
  let stop=false;
  const tick=async()=>{
   try{
    const list=await fetch("./campaign-api/campaigns").then(r=>{if(!r.ok)throw new Error(`campaign list ${r.status}`);return r.json()}) as Array<{id:string;status:string}>;
    if(stop)return; setIds(list);
    const cur=idRef.current??list[0]?.id??null; if(cur!==idRef.current)setId(cur);
    if(cur){const v=await fetch(`./campaign-api/state/${encodeURIComponent(cur)}`).then(r=>{if(!r.ok)throw new Error(`campaign state ${r.status}`);return r.json()}) as CampaignView;if(!stop)setView(v);}
    if(!stop)setConn({ok:true,at:Date.now()});
   }catch(e){if(!stop)setConn(c=>({ok:false,at:c.at,error:String((e as Error).message)}));}
  };
  void tick(); const t=setInterval(tick,POLL_MS), c=setInterval(()=>setNow(Date.now()),1000);
  return()=>{stop=true;clearInterval(t);clearInterval(c);};
 },[]);

 if(!view)return <section className="panel investigation-section" aria-labelledby="campaign-title"><div className="eyebrow">Experimental · local fixtures only</div><h2 id="campaign-title">Live campaign</h2><p role="status">{conn.error?`Campaign adapter unavailable (${conn.error}). This view needs the control-center dev or preview server; the campaign itself is unaffected.`:ids.length===0&&conn.ok?"No local campaign found. Start one with npm run campaign:cli -- start <config>.":"Loading campaign state…"}</p></section>;
 const v=view,L=v.limits as {claudeInvocations:number;wallMinutes:number;concurrency:number;reportingReserveFraction:number;tokenTarget:{input:number;output:number}},u=v.usage,tk=u.tokens;
 const running=v.tasks.filter(t=>t.status==="running"),paused=v.tasks.filter(t=>t.status==="paused"),failed=v.tasks.filter(t=>t.status==="failed");
 const tokensKnown=u.tokenCallsWithUsage>0;
 return <section className="panel investigation-section campaign" aria-labelledby="campaign-title">
  <div className="eyebrow">Experimental · local fixtures only · rehearsal, not a blind result</div>
  <h2 id="campaign-title">Live campaign <code>{v.campaignId}</code></h2>
  {ids.length>1&&<label className="investigation-filter">Campaign<select value={id??""} onChange={e=>{setId(e.target.value);setView(null);}}>{ids.map(c=><option key={c.id} value={c.id}>{c.id} · {c.status}</option>)}</select></label>}
  <p role="status" className={"campaign-conn "+(conn.ok?"ok":"down")}>{conn.ok?"Connected":"Disconnected: showing the last state received"} · polled {ago(conn.at?new Date(conn.at).toISOString():null,now)} · controller {v.controllerAlive?`heartbeat ${ago(v.heartbeatAt,now)}`:`not running (last heartbeat ${ago(v.heartbeatAt,now)})`}</p>
  <p><b>Status: {v.status.replace("_"," ")}</b> — {v.statusReason}. Config v{v.configVersion}, scope v{v.scopeVersion}, plan revision {v.planRevision}, session {v.sessions}.</p>
  <p><b>Next action:</b> {v.nextAction}</p>
  <ol className="campaign-milestones">{v.milestones.map(m=><li key={m.n} data-state={m.state}><span className="campaign-chip">{m.state}</span><b>{m.n}. {m.title}</b><span>{m.note}{m.failed?` · ${m.failed} failed`:""}{m.paused?` · ${m.paused} paused`:""}</span></li>)}</ol>
  <h3>Resources</h3>
  <dl className="investigation-case-facts campaign-resources">
   <dt>Claude invocations (enforced)</dt><dd>{u.claudeInvocations} of {L.claudeInvocations} used{u.claudeInFlight?`, ${u.claudeInFlight} in flight`:""}{u.claudeFailed?`, ${u.claudeFailed} failed`:""}; new investigations stop at {Math.floor(L.claudeInvocations*(1-L.reportingReserveFraction))}</dd>
   <dt>Wall time (enforced)</dt><dd>{Math.round(u.wallMs/1000)} s of {L.wallMinutes} min</dd>
   <dt>Concurrency (enforced)</dt><dd>{running.length} running, limit {L.concurrency}</dd>
   <dt>Tokens (measured, not enforced)</dt><dd>{tokensKnown?<>input {fmt(tk.input)} · cache creation {fmt(tk.cacheCreation)} · cache read {fmt(tk.cacheRead)} · output {fmt(tk.output)} (thinking {fmt(tk.thinking)}) over {u.tokenCallsWithUsage} calls{u.tokenCallsWithoutUsage?`; ${u.tokenCallsWithoutUsage} calls unknown`:""}</>:"unknown: no call has reported usage yet"}. Target {fmt(L.tokenTarget.input)} input / {fmt(L.tokenTarget.output)} output is a target, not a ceiling.</dd>
  </dl>
  <h3>Current work</h3>
  {running.length?<ul>{running.map(t=><li key={t.id}>{t.label}{t.step?` (step: ${t.step})`:""} · started {ago(t.startedAt,now)}</li>)}</ul>:<p className="investigation-muted">Nothing running.</p>}
  {paused.length>0&&<><h3>Paused branches</h3><ul>{paused.map(t=><li key={t.id}>{t.label}: {t.error}</li>)}</ul></>}
  <h3>Cases</h3>
  {v.cases.length?<ul>{v.cases.map(c=><li key={c.id}><b>{c.outcome}</b> · {c.page} @ {c.viewport} ({c.task}): {c.summary}</li>)}</ul>:<p className="investigation-muted">No cases yet.</p>}
  <h3>Recent decisions</h3>
  <ol className="campaign-decisions">{[...v.decisions].reverse().map(d=><li key={d.at+d.kind+d.summary}><b>{d.kind.replace(/_/g," ")}</b>: {d.summary}{d.reason&&<span> — {d.reason}</span>}</li>)}</ol>
  <h3>Failures</h3>
  {v.failures.length||failed.length?<ul>{v.failures.map(f=><li key={f.at+f.taskId}>{f.taskId}: {f.error} ({f.recovery})</li>)}</ul>:<p className="investigation-muted">None recorded.</p>}
  <p className="investigation-muted">{v.evidenceCount} evidence items recorded{v.report?` · ${v.report.partial?"partial ":""}report written ${ago(v.report.at,now)}`:""}. Screenshots are evidence; no model inspected them. Operate the campaign with the CLI (status, stop, extend, resume); this view has no controls.</p>
 </section>;
}

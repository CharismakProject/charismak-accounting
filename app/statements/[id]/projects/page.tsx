import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { ignoreCandidate, linkCandidateToProject } from "../candidate-actions";

const money=(value:number|string|null|undefined)=>value==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(value));

export default async function StatementProjectDiscoveryPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const {id}=await params;
  const query=await searchParams;
  const supabase=await createClient();
  const {data:auth}=await supabase.auth.getUser();
  if(!auth.user)redirect("/login");

  const {data:statement,error}=await supabase.from("statement_imports")
    .select("id,company_id,detected_institution_name,detected_account_name,period_start,period_end")
    .eq("id",id).single();
  if(error||!statement)notFound();

  const [{data:candidates},{data:projects},{data:clients}] = await Promise.all([
    supabase.from("statement_project_candidates").select("id,candidate_key,suggested_name,suggested_code,confidence,evidence,status").eq("import_id",id).eq("status","suggested").order("confidence",{ascending:false}),
    supabase.from("projects").select("id,project_code,name,client_id,client:clients(name)").eq("company_id",statement.company_id).in("status",["draft","active","on_hold"]).order("name"),
    supabase.from("clients").select("id,name,notes").eq("company_id",statement.company_id).order("name"),
  ]);

  const requestedClient=typeof query.client==="string"?query.client.trim():"";
  const allCandidates:any[]=candidates??[];
  const allClients:any[]=clients??[];
  const detectedClientSignals=allCandidates.filter((c:any)=>allClients.some((client:any)=>client.name.toLowerCase()===String(c.suggested_name||"").toLowerCase()));
  const defaultManaged=allClients.find((c:any)=>c.name.toLowerCase()==="kmsteel"&&detectedClientSignals.some((s:any)=>String(s.suggested_name).toLowerCase()==="kmsteel"))?.name||"";
  const managedClient=requestedClient||defaultManaged;
  const companySignalIds=new Set(detectedClientSignals.map((c:any)=>c.id));
  const projectCandidates=allCandidates.filter((c:any)=>!companySignalIds.has(c.id));
  const currentManaged=allClients.find((c:any)=>c.name===managedClient);

  return <main className="page-canvas"><div className="page-wrap" style={{maxWidth:1050}}>
    <div className="page-toolbar"><div style={{display:"flex",gap:9,flexWrap:"wrap"}}><Link href="/" className="back-link">← Dashboard</Link><Link href={`/statements/${id}`} className="secondary-link">Statement review</Link></div><Link href="/projects" className="secondary-link">All Projects</Link></div>

    <header className="page-heading compact"><p className="page-eyebrow green">Project intelligence</p><h1>Turn Statement Signals into Projects</h1><p>{statement.detected_institution_name||"Statement"} · {statement.detected_account_name||"Account"} · {statement.period_start||"—"} → {statement.period_end||"—"}</p></header>

    <section className="compact-card" style={{display:"grid",gap:11,marginBottom:12}}>
      <div><b style={{fontSize:13}}>Managed company / client</b><p style={{margin:"4px 0 0",fontSize:10,color:"#718195",lineHeight:1.5}}>Choose who these detected projects belong to. The selection is carried into every “Create Project” form; you can still change it before saving.</p></div>
      <form method="get" style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"end"}}>
        <label style={{display:"grid",gap:4,fontSize:9,fontWeight:800,minWidth:220}}>Company / client<select name="client" defaultValue={managedClient} style={{height:36,border:"1px solid #d0dce6",borderRadius:9,padding:"0 9px",background:"white"}}><option value="">No company selected</option>{allClients.map((client:any)=><option key={client.id} value={client.name}>{client.name}</option>)}</select></label>
        <button className="primary-action compact-button" type="submit">Use for these projects</button>
        <Link className="secondary-button" href="/projects/new">Create another project manually</Link>
      </form>
      {currentManaged&&<div style={{background:"#edf8f3",border:"1px solid #c3e6d4",borderRadius:10,padding:10,fontSize:10,color:"#145f46"}}><b>{currentManaged.name}</b> is selected as the managed company/client for new projects from this statement.</div>}
    </section>

    {detectedClientSignals.length>0&&<section className="compact-card" style={{display:"grid",gap:9,marginBottom:12}}><div><p className="page-eyebrow green" style={{margin:0}}>Company/account context</p><h2 style={{margin:"3px 0",fontSize:16}}>Managed company signal detected</h2><p style={{margin:0,fontSize:10,color:"#718195"}}>These signals look like company-level funding/loan/refund context rather than individual projects, so they are separated from the project list.</p></div>{detectedClientSignals.map((c:any)=>{const e=c.evidence??{};return <div key={c.id} style={{border:"1px solid #dce6ed",borderRadius:10,padding:10,display:"grid",gap:6}}><div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><b>{c.suggested_name}</b><span style={{fontSize:9,color:"#16825c",fontWeight:800}}>{e.transaction_count||0} rows · {Number(c.confidence||0).toFixed(0)}% signal</span></div><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:7,fontSize:10}}><span><small style={{display:"block",color:"#81909e"}}>Money in</small><b>{money(e.money_in)}</b></span><span><small style={{display:"block",color:"#81909e"}}>Money out</small><b>{money(e.money_out)}</b></span></div><p style={{margin:0,fontSize:9,color:"#6e7f90"}}>{Array.isArray(e.sample_memos)?e.sample_memos.slice(0,3).join(" · "):""}</p><div><Link href={`/statements/${id}?view=review&keyword=${encodeURIComponent(e.keyword||c.suggested_name)}#transactions`} className="secondary-button">Review company rows</Link></div></div>})}</section>}

    <section style={{display:"grid",gap:9}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"end",flexWrap:"wrap"}}><div><p className="page-eyebrow" style={{margin:0}}>Possible projects</p><h2 style={{margin:"3px 0",fontSize:17}}>Detected Project / Site Tags</h2></div><span style={{fontSize:10,color:"#718195"}}>{projectCandidates.length} signals waiting for your decision</span></div>
      {projectCandidates.length===0&&<article className="compact-card"><b>No unreviewed project signals.</b></article>}
      {projectCandidates.map((c:any)=>{const e=c.evidence??{};const createHref=`/projects/new?candidate=${encodeURIComponent(c.id)}&import=${encodeURIComponent(id)}&name=${encodeURIComponent(c.suggested_name||e.keyword||"")}&code=${encodeURIComponent(c.suggested_code||"")}${managedClient?`&client=${encodeURIComponent(managedClient)}`:""}`;return <article key={c.id} className="compact-card" style={{display:"grid",gap:9}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div><b style={{fontSize:14}}>{c.suggested_name}</b>{managedClient&&<small style={{display:"block",marginTop:2,color:"#6f8192",fontSize:9}}>Managed for {managedClient}</small>}</div><span style={{fontSize:9,color:Number(c.confidence)>=80?"#16825c":"#8f6818",fontWeight:850}}>{e.transaction_count||0} rows · {Number(c.confidence||0).toFixed(0)}% signal</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:7,fontSize:10}}><span><small style={{display:"block",color:"#81909e"}}>Money in</small><b>{money(e.money_in)}</b></span><span><small style={{display:"block",color:"#81909e"}}>Money out</small><b>{money(e.money_out)}</b></span><span><small style={{display:"block",color:"#81909e"}}>Period</small><b>{e.first_date||"—"} → {e.last_date||"—"}</b></span></div>
        {Array.isArray(e.sample_memos)&&<div style={{background:"#f7fafc",borderRadius:9,padding:8,fontSize:9,color:"#607286",lineHeight:1.45}}>{e.sample_memos.slice(0,4).map((memo:string)=><div key={memo}>• {memo}</div>)}</div>}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}><Link href={createHref} className="primary-link-button">Create {c.suggested_name} Project</Link><form action={linkCandidateToProject} style={{display:"flex",gap:5,flexWrap:"wrap"}}><input type="hidden" name="candidate_id" value={c.id}/><input type="hidden" name="import_id" value={id}/><select name="project_id" required defaultValue="" style={{border:"1px solid #cfd9e3",borderRadius:8,padding:"7px 8px",fontSize:10}}><option value="" disabled>Link existing…</option>{(projects??[]).map((p:any)=><option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select><button className="secondary-button" type="submit">Link</button></form><Link href={`/statements/${id}?view=review&keyword=${encodeURIComponent(e.keyword||c.suggested_name)}#transactions`} className="secondary-button">Review rows</Link><form action={ignoreCandidate}><input type="hidden" name="candidate_id" value={c.id}/><input type="hidden" name="import_id" value={id}/><button className="secondary-button" type="submit">Ignore</button></form></div>
      </article>})}
    </section>
  </div></main>;
}

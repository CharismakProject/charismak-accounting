import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { confirmStatementTransaction } from "./actions";
import AnalyseStatementButton from "./AnalyseStatementButton";
import DiscoverProjectsButton from "./DiscoverProjectsButton";

const money=(value:number|string|null|undefined)=>value==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:2}).format(Number(value));
const classifications=[["project_expense","Project expense"],["project_funding","Project funding / advance"],["company_expense","Company expense / overhead"],["company_income","Company income"],["company_financing","Company financing / owner loan"],["personal_non_business","Personal / non-business"],["internal_transfer","Internal transfer"]] as const;
const categoryOptions=["Masonry","Temporary Works","Ceiling","Tiling","Skirting","Clearing","Cement","Plumbing","Site Operations","Site Materials","Labour","Transport","Staff Accommodation","Staff Welfare","Staff Allowances","Staff Deployment","Business Administration","Professional/Tendering Services","Software & Subscriptions","IT/Digital Services","Office & Utilities","Bank Charges","Tax & Statutory","Other"];
const PAGE_SIZE=50;
type ReviewView="review"|"posted"|"known";

export default async function StatementReviewPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const {id}=await params; const query=await searchParams; const supabase=await createClient();
  const {data:authData}=await supabase.auth.getUser(); if(!authData.user)redirect("/login");

  const {data:statement,error}=await supabase.from("statement_imports")
    .select("id,company_id,detected_institution_name,detected_account_name,detected_account_number_masked,period_start,period_end,status,detected_as_new_account,rows_total,rows_new,rows_already_known,rows_need_review,rows_auto_posted,rows_pending_review,overlapping_import_id,document:source_documents(file_name,uploaded_at,metadata)")
    .eq("id",id).single();
  if(error||!statement)notFound();

  const requestedView=typeof query.view==="string"?query.view:"review"; const view:ReviewView=["review","posted","known"].includes(requestedView)?requestedView as ReviewView:"review";
  const page=Math.max(1,Number(typeof query.page==="string"?query.page:"1")||1); const keyword=typeof query.keyword==="string"?query.keyword.trim():""; const offset=(page-1)*PAGE_SIZE;

  const {data:queue,error:queueError}=await supabase.rpc("statement_review_queue",{target_import:id,target_view:view,target_keyword:keyword||null,target_limit:PAGE_SIZE,target_offset:offset});
  if(queueError)throw new Error(queueError.message);
  const rowIds=(queue??[]).map((r:any)=>r.row_id); const totalFiltered=Number((queue??[])[0]?.total_count??0);
  let rows:any[]=[];
  if(rowIds.length){
    const {data:rowData}=await supabase.from("statement_rows")
      .select("id,row_index,transaction_date,narration,reference,counterparty,signed_amount,running_balance,detection_status,links:statement_row_transaction_links(is_primary,reason,canonical_transaction:canonical_transactions(id,classification,category_name,status,project_id)),matches:statement_project_matches(confidence,status,project:projects(id,project_code,name))")
      .in("id",rowIds).order("row_index"); rows=rowData??[];
  }

  const {data:projects}=await supabase.from("projects").select("id,project_code,name").eq("company_id",statement.company_id).in("status",["draft","active","on_hold"]).order("name");
  const isSavingsLedger=/saving|owealth/i.test(String((statement as any).detected_account_name||""));
  const {data:discoveryRaw}=!isSavingsLedger&&Number((statement as any).rows_total??0)>0?await supabase.rpc("statement_project_discovery_summary",{target_import:id}):{data:null} as any;
  const discovery:any=discoveryRaw??{existing_projects:[],candidates:[]};
  const existingProjects:any[]=Array.isArray(discovery.existing_projects)?discovery.existing_projects:[];
  const candidates:any[]=Array.isArray(discovery.candidates)?discovery.candidates:[];
  const document=Array.isArray((statement as any).document)?(statement as any).document[0]:(statement as any).document;
  const duplicateNotice=query.duplicate==="1"; const confirmation=typeof query.confirmed==="string"?query.confirmed:undefined; const bulkResolution=typeof query.bulk==="string"?query.bulk:undefined; const bulkCount=Number(typeof query.count==="string"?query.count:"0")||0; const bulkSkipped=Number(typeof query.skipped==="string"?query.skipped:"0")||0;
  const showAnalyse=Number((statement as any).rows_total??0)===0&&["uploaded","failed","needs_review"].includes(String((statement as any).status));
  const totalPages=Math.max(1,Math.ceil(totalFiltered/PAGE_SIZE));
  const autoPosted=Number((statement as any).rows_auto_posted??0); const pendingReview=Number((statement as any).rows_pending_review??0); const known=Number((statement as any).rows_already_known??0); const parserExceptions=Number((statement as any).rows_need_review??0);
  const tabHref=(next:ReviewView)=>`/statements/${id}?view=${next}${keyword?`&keyword=${encodeURIComponent(keyword)}`:""}#transactions`;
  const candidateRows=candidates.reduce((sum:number,c:any)=>sum+Number(c.evidence?.transaction_count??0),0);
  const candidateOut=candidates.reduce((sum:number,c:any)=>sum+Number(c.evidence?.money_out??0),0);
  const candidateIn=candidates.reduce((sum:number,c:any)=>sum+Number(c.evidence?.money_in??0),0);

  return <main className="page-shell"><div className="content-wrap review-wrap">
    <div className="page-actions"><div className="button-row"><Link href="/" className="text-link">← Dashboard</Link><Link href="/statements" className="text-link">Statement History</Link></div><div className="button-row">{!isSavingsLedger&&<Link href={`/statements/${id}/projects`} className="secondary-button">Project Signals</Link>}<Link href="/statements/upload" className="primary-link-button">Upload Next Statement</Link></div></div>
    <header className="compact-header"><p className="mini-eyebrow">Import Review</p><h1>{(statement as any).detected_institution_name||"Bank Statement"} · {(statement as any).detected_account_name||"Account"}</h1><p>{document?.file_name} · {(statement as any).period_start||"Period unknown"} → {(statement as any).period_end||"—"}</p></header>

    {duplicateNotice&&<div className="notice notice-amber"><b>Exact duplicate detected.</b> Nothing was counted twice.</div>}
    {(statement as any).overlapping_import_id&&<div className="notice notice-blue"><b>Overlapping statement period.</b> Known rows are separated from genuinely new movements.</div>}
    {(statement as any).detected_as_new_account&&<div className="notice notice-green"><b>New financial account detected.</b> Future statements using this account identity will be compared against it.</div>}
    {autoPosted>0&&<div className="notice notice-green"><b>{autoPosted.toLocaleString()} transactions posted automatically.</b> {isSavingsLedger?"Savings transfers and interest were classified automatically.":"They had a unique high-confidence existing-project match."} {pendingReview.toLocaleString()} unresolved transactions remain for review.</div>}
    {confirmation==="posted"&&<div className="notice notice-green"><b>Transaction confirmed and posted.</b> Project and company totals were recalculated where applicable.</div>}
    {confirmation==="already"&&<div className="notice notice-amber"><b>Already recorded.</b> This statement row already has a primary accounting transaction.</div>}
    {bulkResolution&&<div className="notice notice-green"><b>{bulkCount.toLocaleString()} rows resolved.</b> The selected bulk decision was applied successfully.</div>}
    {bulkSkipped>0&&<div className="notice notice-amber"><b>{bulkSkipped.toLocaleString()} incomplete rows were not posted.</b> Their amount or transaction date is missing, so they remain safely in review.</div>}
    {showAnalyse&&<AnalyseStatementButton importId={id}/>} 

    <section className="review-kpis">
      {[["Statement rows",(statement as any).rows_total],["Auto-posted",autoPosted],["Needs action",pendingReview],["Already known",known],["Parser exceptions",parserExceptions]].map(([label,value])=><div className="mini-card" key={String(label)}><small>{label}</small><b>{value}</b></div>)}
    </section>

    {Number((statement as any).rows_total??0)>0&&isSavingsLedger&&<article className="review-card" style={{marginBottom:14}}>
      <div className="review-card-head"><div><small>Account Intelligence</small><h2>Project matching is not needed for this savings ledger</h2></div></div>
      <p style={{margin:0,color:"#65778b",fontSize:13,lineHeight:1.55}}>OPay Savings / OWealth is an internal savings account. Deposits and withdrawals are treated as transfers between your own accounts, while earned interest is company income. Charismak therefore skips project-keyword discovery here instead of presenting false project signals.</p>
    </article>}

    {Number((statement as any).rows_total??0)>0&&!isSavingsLedger&&<article className="review-card" style={{marginBottom:14}}>
      <div className="review-card-head"><div><small>Project Intelligence</small><h2>{candidates.length?`${candidates.length} possible new project/site signals`:`${existingProjects.length} existing project matches`}</h2></div><DiscoverProjectsButton importId={id} compact={existingProjects.length>0||candidates.length>0}/></div>
      <p style={{margin:"0 0 11px",color:"#65778b",fontSize:11,lineHeight:1.5}}>Known project matches can post automatically. New tags such as PCC, STW or SRT stay as suggestions until you create or link the real project.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(135px,1fr))",gap:8,marginBottom:11}}>
        <div className="mini-card"><small>Existing projects detected</small><b>{existingProjects.length}</b></div>
        <div className="mini-card"><small>Possible new projects</small><b>{candidates.length}</b></div>
        <div className="mini-card"><small>Rows behind new signals</small><b>{candidateRows.toLocaleString()}</b></div>
        <div className="mini-card"><small>Signal money out</small><b>{money(candidateOut)}</b></div>
        <div className="mini-card"><small>Signal money in</small><b>{money(candidateIn)}</b></div>
      </div>
      {candidates.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:11}}>{candidates.slice(0,8).map((c:any)=><span key={c.id} style={{background:"#f3f7fa",border:"1px solid #dce6ed",borderRadius:999,padding:"5px 8px",fontSize:9,fontWeight:800}}>{c.suggested_name} · {Number(c.confidence||0).toFixed(0)}%</span>)}</div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link href={`/statements/${id}/projects`} className="primary-link-button">Review / Create Projects →</Link><Link href="/projects" className="secondary-button">All Projects</Link></div>
    </article>}

    <article className="review-card" id="transactions">
      <div className="review-card-head"><div><small>Transaction Review</small><h2>{view==="review"?"Needs Action":view==="posted"?"Posted Transactions":"Already Known"}</h2></div><span>{totalFiltered?`Showing ${offset+1}–${Math.min(offset+PAGE_SIZE,totalFiltered)} of ${totalFiltered}`:"0 rows"}</span></div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}><Link href={tabHref("review")} className={view==="review"?"primary-link-button":"secondary-button"}>Needs Action ({pendingReview})</Link><Link href={tabHref("posted")} className={view==="posted"?"primary-link-button":"secondary-button"}>Posted ({autoPosted+Math.max(0,Number((statement as any).rows_total??0)-pendingReview-autoPosted-known)})</Link><Link href={tabHref("known")} className={view==="known"?"primary-link-button":"secondary-button"}>Already Known ({known})</Link></div>
      {keyword&&<div style={{marginBottom:10}}><b style={{fontSize:10}}>Filtered by “{keyword}”</b> · <Link href={`/statements/${id}?view=${view}#transactions`} className="text-link">Clear filter</Link></div>}
      {!rows.length?<div className="empty-review">{view==="review"?"No unresolved transactions in this view.":"No transactions in this view."}</div>:<div className="transaction-list">{rows.map((row:any)=>{
        const matches=row.matches??[]; const best=Array.isArray(matches)?[...matches].filter((m:any)=>m.status!=="rejected").sort((a:any,b:any)=>Number(b.confidence)-Number(a.confidence))[0]:undefined; const suggestedProject=best?(Array.isArray(best.project)?best.project[0]:best.project):null;
        const primaryLink=(row.links??[]).find((l:any)=>l.is_primary); const canonical=primaryLink?(Array.isArray(primaryLink.canonical_transaction)?primaryLink.canonical_transaction[0]:primaryLink.canonical_transaction):null; const signed=row.signed_amount==null?null:Number(row.signed_amount); const defaultClass=suggestedProject?(signed!=null&&signed<0?"project_expense":"project_funding"):(signed!=null&&signed<0?"company_expense":"company_income"); const canonicalProject=(projects??[]).find((p:any)=>p.id===canonical?.project_id);
        return <section className={`transaction-card ${canonical?"confirmed":""}`} key={row.id}><div className="transaction-summary"><span>{row.transaction_date||"—"}</span><div><b>{row.narration||row.counterparty||"Unlabelled transaction"}</b>{row.reference&&<small>{row.reference}</small>}</div><strong className={signed!=null&&signed<0?"negative":"positive"}>{money(row.signed_amount)}</strong><em>{canonical?"posted":String(row.detection_status).replaceAll("_"," ")}</em></div>
        {view==="review"&&!canonical?<form action={confirmStatementTransaction} className="classification-grid"><input type="hidden" name="statement_row_id" value={row.id}/><input type="hidden" name="import_id" value={id}/><label><span>What is this?</span><select name="classification" defaultValue={defaultClass}>{classifications.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label><span>Project</span><select name="project_id" defaultValue={suggestedProject?.id||""}><option value="">No project / company-level</option>{(projects??[]).map((p:any)=><option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select>{suggestedProject&&<small>Suggested: {suggestedProject.project_code} · {Number(best?.confidence||0).toFixed(0)}%</small>}</label><label><span>Expense category</span><select name="category_name" defaultValue="Other">{categoryOptions.map(c=><option key={c}>{c}</option>)}</select></label><button className="confirm-button" type="submit">Confirm</button></form>:<div style={{display:"flex",gap:12,flexWrap:"wrap",padding:"8px 3px 2px",fontSize:10,color:"#607286"}}><span><b>Classification:</b> {String(canonical?.classification||row.detection_status).replaceAll("_"," ")}</span>{canonicalProject&&<span><b>Project:</b> {canonicalProject.project_code} · {canonicalProject.name}</span>}{canonical?.category_name&&<span><b>Category:</b> {canonical.category_name}</span>}</div>}
        </section>})}</div>}
      {totalPages>1&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}><Link className="secondary-button" aria-disabled={page<=1} href={page<=1?"#transactions":`/statements/${id}?view=${view}&${keyword?`keyword=${encodeURIComponent(keyword)}&`:""}page=${page-1}#transactions`}>← Previous</Link><span style={{fontSize:10}}>Page {page} of {totalPages}</span><Link className="secondary-button" aria-disabled={page>=totalPages} href={page>=totalPages?"#transactions":`/statements/${id}?view=${view}&${keyword?`keyword=${encodeURIComponent(keyword)}&`:""}page=${page+1}#transactions`}>Next →</Link></div>}
    </article>
  </div></main>;
}

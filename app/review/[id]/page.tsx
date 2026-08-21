import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { confirmIntakeProject, confirmIntakeAccount, deleteIntakeRecord } from "./actions";

const nice=(v:any)=>String(v??"record").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default async function IntakeDecisionPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const {data:membership}=await supabase.from("company_memberships").select("company_id,is_owner").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();if(!membership)redirect("/login");
  const [{data:item},{data:projects},{data:accounts}]=await Promise.all([
    supabase.from("intake_items").select("id,document_id,detected_type,detected_project_id,confidence,status,message,suggested_action,document:source_documents(id,file_name,document_type,source_name,metadata)").eq("id",id).eq("company_id",membership.company_id).maybeSingle(),
    supabase.from("projects").select("id,project_code,name").eq("company_id",membership.company_id).neq("status","archived").order("name"),
    supabase.from("financial_accounts").select("id,institution_name,account_name,account_number_masked").eq("company_id",membership.company_id).eq("is_active",true).order("account_name"),
  ]);
  if(!item)notFound();const doc:any=Array.isArray((item as any).document)?(item as any).document[0]:(item as any).document;const action:any=item.suggested_action||{};const bank=item.detected_type==="bank_statement"||action.action==="confirm_financial_account";
  const candidate=action.candidate_project_id||item.detected_project_id||"";const institution=action.institution||doc?.source_name||doc?.metadata?.detected_institution||"";const accountNo=action.account_number||doc?.metadata?.detected_account_number||"";
  return <main className="simple-shell"><div className="simple-wrap">
    <div className="simple-top"><Link href="/review">← Needs your decision</Link><span style={{display:"flex",gap:12}}><Link href="/documents">Documents</Link><Link href="/add">+ Add</Link></span></div>
    <header className="add-hero"><span>REVIEW ONE RECORD</span><h1>{doc?.file_name||"Uploaded record"}</h1><p>{item.message||"Charismak needs one confirmation before it can place this record correctly."}</p></header>
    <section className="add-card" style={{display:"grid",gap:14}}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><span className="intake-tags"><span>{nice(item.detected_type||doc?.document_type)}</span></span><span style={{fontSize:11,color:"#6e8190"}}>{Math.round(Number(item.confidence||0))}% confidence</span></div>
      {bank?<form action={confirmIntakeAccount} style={{display:"grid",gap:12}}><input type="hidden" name="item_id" value={id}/><h2 style={{margin:0,color:"#173b55"}}>Which financial account does this statement belong to?</h2><p style={{margin:0,color:"#6d7f8e",fontSize:12}}>Choose an existing account or create one from the statement. After confirmation Charismak will parse the transactions and run project/keyword intelligence.</p><label style={field}>Use existing account<select name="financial_account_id" style={control}><option value="">Create a new account from this statement</option>{(accounts??[]).map((a:any)=><option key={a.id} value={a.id}>{a.account_name}{a.institution_name?` · ${a.institution_name}`:""}{a.account_number_masked?` · ${a.account_number_masked}`:""}</option>)}</select></label><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}><label style={field}>Institution<input name="institution_name" defaultValue={institution} placeholder="e.g. Access Bank, UBA, Kuda" style={control}/></label><label style={field}>Account name<input name="account_name" defaultValue={institution?`${institution} Account`:""} placeholder="e.g. Main Project Account" style={control}/></label><label style={field}>Account number / masked number<input name="account_number" defaultValue={accountNo} placeholder="Optional" style={control}/></label></div><button className="add-primary" type="submit">Confirm account & analyse statement</button></form>
      :<form action={confirmIntakeProject} style={{display:"grid",gap:12}}><input type="hidden" name="item_id" value={id}/><h2 style={{margin:0,color:"#173b55"}}>Which project does this record belong to?</h2><p style={{margin:0,color:"#6d7f8e",fontSize:12}}>Charismak has not applied anything yet. Confirm the project and the document will be analysed inside that project's records.</p><label style={field}>Project<select name="project_id" defaultValue={candidate} required style={control}><option value="">Choose project</option>{(projects??[]).map((p:any)=><option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label><button className="add-primary" type="submit">Confirm project & continue analysis</button></form>}
      <div style={{borderTop:"1px solid #e4ebf0",paddingTop:12}}><form action={deleteIntakeRecord}><input type="hidden" name="item_id" value={id}/><button className="secondary-button" style={{color:"#a33d3d",borderColor:"#e7caca"}} type="submit">Delete this record</button></form><small style={{display:"block",marginTop:6,color:"#7b8b98"}}>Deletion removes the active record but is retained in the audit trail.</small></div>
    </section>
  </div></main>;
}
const field={display:"grid",gap:5,fontSize:10,fontWeight:800,color:"#536879"} as const;
const control={height:42,border:"1px solid #ccd9e2",borderRadius:10,padding:"0 10px",background:"white",font:"inherit"} as const;

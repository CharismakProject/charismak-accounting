import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import UniversalAddClient from "./UniversalAddClient";
import RetryStoredUpload from "./RetryStoredUpload";

export default async function AddPage({searchParams}:{searchParams:Promise<{projectId?:string}>}){
  const query=await searchParams;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:membership}=await supabase.from("company_memberships").select("company_id").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(!membership)redirect("/login?message=No+active+company+membership");
  const [{data:projects},{data:pendingItems}]=await Promise.all([
    supabase.from("projects").select("id,project_code,name").eq("company_id",membership.company_id).neq("status","archived").order("name"),
    supabase.from("intake_items").select("id,batch_id,status,message,created_at,document:source_documents(id,file_name,document_type)").eq("company_id",membership.company_id).in("status",["failed","needs_review"]).order("created_at",{ascending:false}).limit(5),
  ]);
  const allowed=new Set((projects??[]).map((p:any)=>p.id));
  const defaultProjectId=query.projectId&&allowed.has(query.projectId)?query.projectId:"";
  const retry=(pendingItems??[]).map((row:any)=>({
    ...row,
    document:Array.isArray(row.document)?row.document[0]:row.document,
  })).find((row:any)=>row.document?.id&&row.document?.document_type==="other");
  return <main className="simple-shell"><div className="simple-wrap"><div className="simple-top"><Link href="/">← Home</Link><Link href="/projects">Projects</Link></div>{retry&&<RetryStoredUpload documentId={retry.document.id} batchId={retry.batch_id} fileName={retry.document.file_name} message={retry.message}/>}<UniversalAddClient companyId={membership.company_id} projects={projects??[]} defaultProjectId={defaultProjectId}/></div></main>;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import UniversalIntakeV2 from "./UniversalIntakeV2";
import RetryStoredUpload from "./RetryStoredUpload";

export default async function AddPage({searchParams}:{searchParams:Promise<{projectId?:string;onboarding?:string}>}){
  const query=await searchParams;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/welcome");
  const {data:membership}=await supabase.from("company_memberships").select("company_id,is_owner").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(!membership)redirect("/welcome");
  const onboarding=query.onboarding==="1"&&Boolean(membership.is_owner);
  const [{data:projects},{data:pendingItems}]=await Promise.all([
    supabase.from("projects").select("id,project_code,name").eq("company_id",membership.company_id).neq("status","archived").order("name"),
    supabase.from("intake_items").select("id,batch_id,status,message,created_at,document:source_documents(id,file_name,document_type)").eq("company_id",membership.company_id).in("status",["failed","needs_review"]).order("created_at",{ascending:false}).limit(5),
  ]);
  const allowed=new Set((projects??[]).map((p:any)=>p.id));
  const defaultProjectId=query.projectId&&allowed.has(query.projectId)?query.projectId:"";
  const retry=(pendingItems??[]).map((row:any)=>({...row,document:Array.isArray(row.document)?row.document[0]:row.document})).find((row:any)=>row.document?.id&&row.document?.document_type==="other");
  return <main className="simple-shell"><div className="simple-wrap"><div className="simple-top"><Link href={onboarding?"/onboarding/start":"/"}>← {onboarding?"Start choices":"Home"}</Link><Link href="/projects">Projects</Link></div>{retry&&!onboarding&&<RetryStoredUpload documentId={retry.document.id} batchId={retry.batch_id} fileName={retry.document.file_name} message={retry.message}/>}<UniversalIntakeV2 companyId={membership.company_id} projects={projects??[]} defaultProjectId={defaultProjectId} onboarding={onboarding}/></div></main>;
}

import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import TeamInviteForm from "./TeamInviteForm";

export default async function TeamOnboardingPage(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/welcome");
  const {data:membership}=await supabase.from("company_memberships").select("company_id,is_owner,company:companies(name,onboarding_completed)").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(!membership?.is_owner) redirect("/");
  const company:any=Array.isArray((membership as any).company)?(membership as any).company[0]:(membership as any).company;
  if(company?.onboarding_completed) redirect("/");
  const [{data:projects},{data:positions}]=await Promise.all([
    supabase.from("projects").select("id,project_code,name").eq("company_id",membership.company_id).neq("status","archived").order("name"),
    supabase.from("positions").select("code,name").eq("is_system_template",true).in("code",["CFO","PROJECT_DIRECTOR","PROJECT_MANAGER","SITE_MANAGER","SITE_ENGINEER","SUPERVISOR"]).order("name")
  ]);
  return <main style={{minHeight:"100vh",background:"#f4f8fb",padding:"28px 18px"}}><section style={{width:"min(900px,100%)",margin:"0 auto",display:"grid",gap:16}}>
    <header><small style={{fontWeight:900,letterSpacing:".13em",color:"#16826b"}}>TEAM SETUP</small><h1 style={{margin:"6px 0",fontSize:34,color:"#12334c"}}>Invite the people who will work in {company?.name||"your company"}</h1><p style={{margin:0,maxWidth:720,color:"#65798b",lineHeight:1.6}}>Use each person's real email. The invitation binds that email to the approved company position and selected projects. When they join, they see only the functions and project scope their access allows.</p></header>
    <TeamInviteForm companyId={membership.company_id} projects={projects??[]} positions={(positions??[]).length?positions??[]:[{code:"PROJECT_MANAGER",name:"Project / Construction Manager"},{code:"PROJECT_DIRECTOR",name:"Project Director"},{code:"CFO",name:"Accountant / CFO"}]}/>
  </section></main>;
}

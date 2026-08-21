import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

export default async function OnboardingStartPage(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/welcome");
  const {data:membership}=await supabase.from("company_memberships").select("company_id,is_owner,company:companies(name,onboarding_completed)").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(!membership) redirect("/onboarding/role");
  if(!membership.is_owner) redirect("/");
  const company:any=Array.isArray((membership as any).company)?(membership as any).company[0]:(membership as any).company;
  if(company?.onboarding_completed) redirect("/");
  const option={display:"grid",gap:11,padding:20,border:"1px solid #dce6ed",borderRadius:16,background:"#fff"} as const;
  return <main style={{minHeight:"100vh",background:"#f4f8fb",display:"grid",placeItems:"center",padding:22}}><section style={{width:"min(820px,100%)",display:"grid",gap:17}}>
    <header style={{textAlign:"center"}}><small style={{fontWeight:900,letterSpacing:".13em",color:"#16826b"}}>WELCOME TO {String(company?.name||"YOUR COMPANY").toUpperCase()}</small><h1 style={{margin:"7px 0",fontSize:36,color:"#12334c"}}>How do you want to start?</h1><p style={{margin:"0 auto",maxWidth:660,color:"#65798b",lineHeight:1.6}}>Charismak should fit around the records you already have. You can create a project yourself, or upload documents and let the app build the starting structure from what it finds.</p></header>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:12}}>
      <article style={option}><b style={{fontSize:20,color:"#153b56"}}>Create a new project</b><span style={{fontSize:13,lineHeight:1.55,color:"#687b8c"}}>Enter the project details yourself. The form also lets you attach starting documents or statements so the project can begin with real records.</span><Link href="/projects/new?onboarding=1" className="primary-link-button">Create project →</Link></article>
      <article style={option}><b style={{fontSize:20,color:"#153b56"}}>Upload existing records</b><span style={{fontSize:13,lineHeight:1.55,color:"#687b8c"}}>Choose the document type and tell Charismak what to do: analyse, search your keywords, propose projects, or simply keep the file as evidence.</span><Link href="/add?onboarding=1" className="primary-link-button">Upload records →</Link></article>
    </div>
    <div style={{textAlign:"center"}}><Link href="/company/branding" className="text-link">Optional: set company branding first</Link></div>
  </section></main>;
}

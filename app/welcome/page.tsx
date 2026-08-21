import Link from "next/link";
import { createClient } from "../../lib/supabase/server";

const card={display:"grid",gap:10,padding:18,border:"1px solid #dce7ee",borderRadius:16,background:"#fff"} as const;
export default async function WelcomePage(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  let next="/onboarding/role";
  if(user){
    const {data:membership}=await supabase.from("company_memberships").select("company_id,is_owner,company:companies(onboarding_completed)").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    const company:any=Array.isArray((membership as any)?.company)?(membership as any).company[0]:(membership as any)?.company;
    if(membership && !membership.is_owner) next="/";
    else if(membership?.is_owner && company?.onboarding_completed) next="/";
    else if(membership?.is_owner) next="/onboarding/start";
  }
  return <main style={{minHeight:"100vh",background:"linear-gradient(145deg,#eef6fb,#f7fbf9 55%,#edf4f8)",display:"grid",placeItems:"center",padding:22}}>
    <section style={{width:"min(760px,100%)",display:"grid",gap:18}}>
      <div style={{textAlign:"center",display:"grid",gap:9}}><small style={{fontWeight:900,letterSpacing:".14em",color:"#16826b"}}>CHARISMAK ACCOUNTING</small><h1 style={{margin:0,fontSize:"clamp(34px,8vw,58px)",lineHeight:1.02,color:"#12334c"}}>Welcome. Start with what you already have.</h1><p style={{margin:"0 auto",maxWidth:650,color:"#62778a",fontSize:15,lineHeight:1.65}}>Create a project yourself or upload the records you already use. Statements, invoices, bills, quotations, BOQs and receipts can become the starting point instead of forcing you to rebuild your accounting from zero.</p></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
        <article style={card}><b style={{fontSize:18,color:"#153b56"}}>New to Charismak</b><span style={{color:"#6d7f8e",fontSize:13,lineHeight:1.5}}>Choose whether you are setting up a company as MD/Owner or joining a team through an invitation.</span><Link href={user?next:"/onboarding/role"} className="primary-link-button">Start onboarding →</Link></article>
        <article style={card}><b style={{fontSize:18,color:"#153b56"}}>Already have an account</b><span style={{color:"#6d7f8e",fontSize:13,lineHeight:1.5}}>Sign in with the same email used for your company or team invitation.</span><Link href={user?next:"/login"} className="secondary-button">{user?"Continue":"Sign in"} →</Link></article>
      </div>
      <p style={{margin:0,textAlign:"center",fontSize:11,color:"#7e8c98"}}>Creating a login does not make a user an MD. Company ownership and team permissions are assigned separately.</p>
    </section>
  </main>;
}

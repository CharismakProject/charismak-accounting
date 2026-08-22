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
    <section style={{width:"min(820px,100%)",display:"grid",gap:18}}>
      <div style={{textAlign:"center",display:"grid",gap:10}}>
        <small style={{fontWeight:900,letterSpacing:".14em",color:"#16826b"}}>CHARISMAK CONSTRUCTION ACCOUNTING</small>
        <h1 style={{margin:0,fontSize:"clamp(34px,8vw,58px)",lineHeight:1.02,color:"#12334c"}}>Know where every project stands.</h1>
        <p style={{margin:"0 auto",maxWidth:620,color:"#62778a",fontSize:15,lineHeight:1.6}}>Funding, costs, approvals and documents—connected in one place.</p>
        <div style={{display:"flex",justifyContent:"center",gap:12,flexWrap:"wrap"}}>
          <Link href="/guide" className="secondary-button">See how it works →</Link>
          <Link href={user?next:"/onboarding/role"} className="primary-link-button">Get started →</Link>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
        <article style={card}>
          <b style={{fontSize:18,color:"#153b56"}}>Set up your company</b>
          <span style={{color:"#6d7f8e",fontSize:13,lineHeight:1.5}}>Create your workspace, add projects and invite your team.</span>
          <Link href={user?next:"/onboarding/role"} className="primary-link-button">Set up company →</Link>
        </article>
        <article style={card}>
          <b style={{fontSize:18,color:"#153b56"}}>Join your team</b>
          <span style={{color:"#6d7f8e",fontSize:13,lineHeight:1.5}}>Sign in with your invitation to access the projects and permissions assigned to you.</span>
          <Link href={user?next:"/login"} className="secondary-button">{user?"Continue":"Sign in"} →</Link>
        </article>
      </div>
      <p style={{margin:0,textAlign:"center",fontSize:11,color:"#7e8c98"}}>Already have records? Upload them and let Charismak help organise the starting position.</p>
    </section>
  </main>;
}

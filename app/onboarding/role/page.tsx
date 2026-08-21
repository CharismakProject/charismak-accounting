import { chooseOnboardingRole } from "./actions";

export default async function RoleOnboardingPage({searchParams}:{searchParams:Promise<{message?:string}>}){
  const q=await searchParams;
  const box={display:"grid",gap:10,padding:20,border:"1px solid #d9e4eb",borderRadius:16,background:"white",textAlign:"left" as const};
  return <main style={{minHeight:"100vh",background:"#f4f8fb",display:"grid",placeItems:"center",padding:22}}>
    <section style={{width:"min(760px,100%)",display:"grid",gap:16}}>
      <div style={{textAlign:"center"}}><small style={{fontWeight:900,letterSpacing:".13em",color:"#16826b"}}>WHO ARE YOU JOINING AS?</small><h1 style={{margin:"7px 0",fontSize:34,color:"#12334c"}}>Your login is not your authority level.</h1><p style={{margin:"0 auto",maxWidth:640,color:"#677b8d",lineHeight:1.6}}>An MD/Owner creates the company workspace. A team member joins only through an invitation and receives the role, projects and permissions approved by the MD.</p></div>
      {q.message&&<div style={{padding:12,borderRadius:10,background:"#fff4dc",color:"#805a08",fontSize:12}}>{q.message}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:12}}>
        <form action={chooseOnboardingRole} style={box}><input type="hidden" name="choice" value="owner"/><b style={{fontSize:20,color:"#153b56"}}>I am the MD / Owner</b><span style={{fontSize:13,lineHeight:1.5,color:"#687b8b"}}>Set up the company, start from a project or existing records, then invite the team.</span><button className="primary-action" type="submit">Set up my company →</button></form>
        <form action={chooseOnboardingRole} style={box}><input type="hidden" name="choice" value="team"/><b style={{fontSize:20,color:"#153b56"}}>I am a team member</b><span style={{fontSize:13,lineHeight:1.5,color:"#687b8b"}}>Join with the same email address your MD invited. Your approved interface and project access are attached automatically.</span><button className="secondary-button" type="submit">Join my team →</button></form>
      </div>
    </section>
  </main>;
}

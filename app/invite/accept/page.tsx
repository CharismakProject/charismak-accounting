"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

export default function InviteAcceptPage(){
  const supabase=useMemo(()=>createClient(),[]);
  const router=useRouter();
  const [ready,setReady]=useState(false);
  const [password,setPassword]=useState("");
  const [message,setMessage]=useState("Opening your team invitation…");
  useEffect(()=>{let live=true;(async()=>{const {data}=await supabase.auth.getSession();if(!live)return;if(data.session){const {data:accepted,error}=await supabase.rpc("accept_pending_company_invite");setMessage(error?error.message:(accepted as any)?.accepted?"Invitation recognised. Set a password to finish.":"Your invited email is signed in. Set a password to continue.");setReady(true);}else{setMessage("Open this page from the invitation email so Charismak can verify the invited account.");}})();return()=>{live=false};},[supabase]);
  async function submit(e:FormEvent){e.preventDefault();if(password.length<8){setMessage("Use a password with at least 8 characters.");return;}const {error}=await supabase.auth.updateUser({password});if(error){setMessage(error.message);return;}const {error:acceptError}=await supabase.rpc("accept_pending_company_invite");if(acceptError){setMessage(acceptError.message);return;}router.push("/");router.refresh();}
  return <main style={{minHeight:"100vh",background:"#f4f8fb",display:"grid",placeItems:"center",padding:22}}><section style={{width:"min(520px,100%)",background:"white",border:"1px solid #dce6ed",borderRadius:18,padding:24,display:"grid",gap:14}}><small style={{fontWeight:900,letterSpacing:".12em",color:"#16826b"}}>CHARISMAK TEAM INVITATION</small><h1 style={{margin:0,color:"#12334c",fontSize:30}}>Join your company workspace</h1><p style={{margin:0,color:"#667b8c",lineHeight:1.55,fontSize:13}}>{message}</p>{ready&&<form onSubmit={submit} style={{display:"grid",gap:10}}><label style={{display:"grid",gap:6,fontSize:11,fontWeight:800}}>Create your password<input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} style={{border:"1px solid #ccd8e1",borderRadius:10,padding:"11px 12px"}}/></label><button type="submit" className="primary-action">Finish joining team →</button></form>}<small style={{color:"#7b8c99",lineHeight:1.45}}>Use this same invited email for future sign-ins. Your role and project access come from the MD's invitation, not from the fact that you created a login.</small></section></main>;
}

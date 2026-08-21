"use client";

import { useMemo, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { finishOnboarding } from "./actions";

type Project={id:string;project_code:string;name:string};
type Position={code:string;name:string};
type InviteRow={email:string;positionCode:string;projectIds:string[];canViewCost:boolean;canRequest:boolean;canApprove:boolean};
const empty=(positionCode:string):InviteRow=>({email:"",positionCode,projectIds:[],canViewCost:true,canRequest:true,canApprove:false});

export default function TeamInviteForm({companyId,projects,positions}:{companyId:string;projects:Project[];positions:Position[]}){
  const supabase=useMemo(()=>createClient(),[]);
  const defaultPosition=positions.find(p=>p.code==="PROJECT_MANAGER")?.code||positions[0]?.code||"PROJECT_MANAGER";
  const [count,setCount]=useState(1);
  const [rows,setRows]=useState<InviteRow[]>([empty(defaultPosition)]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  function resize(next:number){const n=Math.max(0,Math.min(20,next||0));setCount(n);setRows(prev=>Array.from({length:n},(_,i)=>prev[i]||empty(defaultPosition)));}
  function patch(i:number,next:Partial<InviteRow>){setRows(prev=>prev.map((r,x)=>x===i?{...r,...next}:r));}
  function toggleProject(i:number,id:string,checked:boolean){const current=rows[i].projectIds;patch(i,{projectIds:checked?Array.from(new Set([...current,id])):current.filter(x=>x!==id)});}

  async function send(){
    const invites=rows.filter(r=>r.email.trim());
    if(!invites.length){setMessage("Enter at least one team email, or use Finish without inviting anyone.");return;}
    setBusy(true);setMessage("");
    const {data,error}=await supabase.functions.invoke("send-team-invites",{body:{companyId,origin:window.location.origin,invites:invites.map(r=>({email:r.email.trim().toLowerCase(),positionCode:r.positionCode,projectIds:r.projectIds,canViewCost:r.canViewCost,canRequest:r.canRequest,canApprove:r.canApprove}))}});
    if(error){setMessage(error.message||"Invitations could not be sent.");setBusy(false);return;}
    const results:any[]=Array.isArray(data?.results)?data.results:[];
    const sent=results.filter(r=>r.sent).length;
    const existing=results.filter(r=>r.existing_user).length;
    const failed=results.filter(r=>r.error).length;
    setMessage(`${sent} invitation email${sent===1?"":"s"} sent${existing?` · ${existing} existing account${existing===1?"":"s"} can sign in with the invited email`:""}${failed?` · ${failed} need attention`:""}.`);
    setBusy(false);
  }

  return <div style={{display:"grid",gap:14}}>
    <section style={{padding:16,border:"1px solid #dce6ed",borderRadius:14,background:"white",display:"grid",gap:10}}>
      <label style={{display:"grid",gap:6,fontSize:12,fontWeight:800,color:"#324b61"}}>How many team members do you want to invite now?<input type="number" min="0" max="20" value={count} onChange={e=>resize(Number(e.target.value))} style={{width:120,border:"1px solid #ccd8e1",borderRadius:9,padding:"10px 11px"}}/></label>
      <small style={{color:"#758695",lineHeight:1.5}}>You can invite more people later. Each email receives its approved position and any selected project access. Creating a login by itself does not create owner rights.</small>
    </section>

    {rows.map((row,i)=><article key={i} style={{padding:16,border:"1px solid #dce6ed",borderRadius:14,background:"white",display:"grid",gap:11}}>
      <b style={{color:"#163a55"}}>Team member {i+1}</b>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
        <label style={{display:"grid",gap:5,fontSize:11,fontWeight:800,color:"#40566b"}}>Email address<input type="email" value={row.email} onChange={e=>patch(i,{email:e.target.value})} placeholder="name@company.com" style={{border:"1px solid #ccd8e1",borderRadius:9,padding:"10px 11px"}}/></label>
        <label style={{display:"grid",gap:5,fontSize:11,fontWeight:800,color:"#40566b"}}>Position<select value={row.positionCode} onChange={e=>patch(i,{positionCode:e.target.value})} style={{border:"1px solid #ccd8e1",borderRadius:9,padding:"10px 11px",background:"white"}}>{positions.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
      </div>
      {!!projects.length&&<div><small style={{display:"block",marginBottom:6,fontWeight:850,color:"#40566b"}}>Projects this person can access</small><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{projects.map(p=><label key={p.id} style={{display:"flex",gap:5,alignItems:"center",fontSize:10,border:"1px solid #dde7ed",borderRadius:999,padding:"6px 9px",background:"#f8fbfd"}}><input type="checkbox" checked={row.projectIds.includes(p.id)} onChange={e=>toggleProject(i,p.id,e.target.checked)}/>{p.project_code} · {p.name}</label>)}</div></div>}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:10,color:"#536879"}}><label><input type="checkbox" checked={row.canViewCost} onChange={e=>patch(i,{canViewCost:e.target.checked})}/> View project costs</label><label><input type="checkbox" checked={row.canRequest} onChange={e=>patch(i,{canRequest:e.target.checked})}/> Create requests</label><label><input type="checkbox" checked={row.canApprove} onChange={e=>patch(i,{canApprove:e.target.checked})}/> Approve requests</label></div>
    </article>)}

    {message&&<div style={{padding:12,borderRadius:10,background:"#edf8f3",color:"#17664f",fontSize:12,lineHeight:1.5}}>{message}</div>}
    <div style={{display:"flex",gap:9,justifyContent:"flex-end",flexWrap:"wrap"}}>
      <button type="button" onClick={send} disabled={busy||count===0} className="secondary-button">{busy?"Sending invitations…":"Send team invitations"}</button>
      <form action={finishOnboarding}><button type="submit" className="primary-action">Finish onboarding →</button></form>
    </div>
  </div>;
}

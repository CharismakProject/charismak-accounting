import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...H,"content-type":"application/json"}});
const validEmail=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:H});
  if(req.method!=="POST") return json({error:"POST required"},405);
  const url=Deno.env.get("SUPABASE_URL")!;
  const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user}}=await userClient.auth.getUser();
  if(!user) return json({error:"Sign in again."},401);
  const body=await req.json().catch(()=>({}));
  const companyId=String(body?.companyId||"");
  const origin=String(body?.origin||"").replace(/\/$/,"");
  const invites=Array.isArray(body?.invites)?body.invites:[];
  if(!companyId||!invites.length) return json({error:"Company and at least one invitation are required."},400);
  const {data:membership}=await userClient.from("company_memberships").select("id,is_owner").eq("company_id",companyId).eq("user_id",user.id).eq("status","active").maybeSingle();
  if(!membership?.is_owner) return json({error:"MD / Owner access required."},403);

  const results:any[]=[];
  for(const raw of invites.slice(0,20)){
    const email=String(raw?.email||"").trim().toLowerCase();
    const positionCode=String(raw?.positionCode||"PROJECT_MANAGER").trim();
    const projectIds=Array.isArray(raw?.projectIds)?raw.projectIds.map(String):[];
    if(!validEmail(email)){results.push({email,error:"Invalid email"});continue;}
    const {data:inviteId,error:inviteError}=await userClient.rpc("owner_create_team_invite",{target_company:companyId,target_email:email,target_position_code:positionCode,target_project_ids:projectIds,view_cost:raw?.canViewCost!==false,can_request:raw?.canRequest!==false,can_approve:raw?.canApprove===true});
    if(inviteError){results.push({email,error:inviteError.message});continue;}

    const redirectTo=`${origin||url}/invite/accept`;
    const {error:mailError}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo,data:{company_id:companyId,position_code:positionCode,invite_id:inviteId}});
    if(mailError){
      const lower=mailError.message.toLowerCase();
      const existing=lower.includes("already")||lower.includes("registered")||lower.includes("exists");
      results.push({email,inviteId,sent:false,existing_user:existing,error:existing?null:mailError.message});
    }else results.push({email,inviteId,sent:true,existing_user:false});
  }
  return json({ok:true,results});
});

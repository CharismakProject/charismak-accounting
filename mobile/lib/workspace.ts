import { supabase } from "./supabase";

export type RoleFamily="md_owner"|"accountant_cfo"|"project_director"|"project_manager";

const roleFamilyFromLiveRole=(role:string):RoleFamily=>{
  if(role==="accountant")return "accountant_cfo";
  if(role==="pm")return "project_manager";
  return "md_owner";
};

export async function loadWorkspace(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)throw new Error("Not signed in");

  // V0.1 compatibility rule: the connected Accounting database is authoritative.
  // Production currently uses public.company_members, not the newer review-only
  // company_memberships / membership_positions model.
  const {data:member,error}=await supabase
    .from("company_members")
    .select("id,company_id,role,status,is_primary_accountant")
    .eq("user_id",user.id)
    .eq("status","active")
    .limit(1)
    .maybeSingle();
  if(error||!member)throw new Error(error?.message||"No active company workspace");

  const [{data:assignments},{data:company}]=await Promise.all([
    supabase.from("project_assignments").select("project_id").eq("company_member_id",member.id).is("unassigned_at",null),
    supabase.from("companies").select("name").eq("id",member.company_id).maybeSingle(),
  ]);

  const activeRole=roleFamilyFromLiveRole(String(member.role||"md"));
  const projectIds=Array.from(new Set((assignments??[]).map((a:any)=>a.project_id).filter(Boolean))) as string[];
  const membership={...member,is_owner:member.role==="md"};

  return{
    user,
    membership,
    companyName:company?.name||"Company",
    roles:[activeRole] as RoleFamily[],
    activeRole,
    assignedProjectIds:projectIds,
  };
}

export async function switchRole(_companyId:string,_role:RoleFamily){
  // The live V0.1 Accounting schema exposes one authoritative company role per
  // member. Multi-position interface switching belongs to the gated schema and
  // must not be called until those migrations are explicitly approved.
  return;
}

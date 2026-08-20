import { supabase } from "./supabase";

export type RoleFamily="md_owner"|"accountant_cfo"|"project_director"|"project_manager";
export const allRoles:RoleFamily[]=["md_owner","accountant_cfo","project_director","project_manager"];

export async function loadWorkspace(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)throw new Error("Not signed in");
  const {data:membership,error}=await supabase.from("company_memberships").select("id,company_id,is_owner,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(error||!membership)throw new Error(error?.message||"No active company workspace");
  const [{data:positions},{data:preference},{data:assignments},{data:company}]=await Promise.all([
    supabase.from("membership_positions").select("is_primary,position:positions(name,interface_family)").eq("membership_id",membership.id),
    supabase.from("user_interface_preferences").select("active_interface").eq("company_id",membership.company_id).eq("user_id",user.id).maybeSingle(),
    supabase.from("project_assignments").select("project_id").eq("membership_id",membership.id),
    supabase.from("companies").select("name").eq("id",membership.company_id).maybeSingle(),
  ]);
  const families=Array.from(new Set((positions??[]).map((r:any)=>r.position?.interface_family).filter(Boolean))) as RoleFamily[];
  const roles=membership.is_owner?allRoles:(families.length?families:["project_manager"] as RoleFamily[]);
  const preferred=preference?.active_interface as RoleFamily|undefined;
  const activeRole=preferred&&roles.includes(preferred)?preferred:(membership.is_owner?"md_owner":roles[0]);
  const projectIds=Array.from(new Set((assignments??[]).map((a:any)=>a.project_id).filter(Boolean))) as string[];
  return{user,membership,companyName:company?.name||"Company",roles,activeRole,assignedProjectIds:projectIds};
}

export async function switchRole(companyId:string,role:RoleFamily){
  const {error}=await supabase.rpc("set_active_interface",{target_company:companyId,target_interface:role});
  if(error)throw error;
}

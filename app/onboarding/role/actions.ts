"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

export async function chooseOnboardingRole(formData:FormData){
  const choice=String(formData.get("choice")||"");
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect(`/login?mode=signup&intent=${choice==="team"?"team":"owner"}`);

  const {data:membership}=await supabase.from("company_memberships").select("company_id,is_owner").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(choice==="team"){
    if(membership) redirect("/");
    const {data,error}=await supabase.rpc("accept_pending_company_invite");
    if(error) redirect(`/onboarding/role?message=${encodeURIComponent(error.message)}`);
    if((data as any)?.accepted) redirect("/");
    redirect("/onboarding/role?message=No+pending+team+invitation+was+found+for+this+email.+Ask+your+MD+to+invite+this+exact+email+address.");
  }

  if(membership?.is_owner) redirect("/onboarding/start");
  if(membership && !membership.is_owner) redirect("/");
  redirect("/onboarding/company");
}

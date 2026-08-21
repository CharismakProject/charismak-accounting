"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

export async function finishOnboarding(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/welcome");
  const {data:membership}=await supabase.from("company_memberships").select("company_id,is_owner").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(!membership?.is_owner) redirect("/");
  const {error}=await supabase.rpc("complete_company_onboarding",{target_company:membership.company_id});
  if(error) throw new Error(error.message);
  redirect("/");
}

import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import UploadBoqClient from "./upload-boq-client";

export default async function UploadBoqPage(){
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/welcome");

  let companyId: string | null = null;
  const liveMembership = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (liveMembership.data?.company_id) companyId = String(liveMembership.data.company_id);

  // Compatibility only for branches that already use the newer membership model.
  if (!companyId) {
    const newerMembership = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", auth.user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (newerMembership.data?.company_id) companyId = String(newerMembership.data.company_id);
  }

  if (!companyId) redirect("/welcome");
  return <UploadBoqClient companyId={companyId}/>;
}

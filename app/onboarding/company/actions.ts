"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

export async function createCompanyWorkspace(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const companyName = String(formData.get("company_name") || "").trim();
  if (companyName.length < 2) throw new Error("Enter your company name.");
  if (companyName.length > 160) throw new Error("Company name is too long.");

  const { error } = await supabase.rpc("create_company_workspace", {
    company_name: companyName,
    desired_slug: null,
  });
  if (error) throw new Error(error.message);
  redirect("/setup");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

async function context() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/welcome");
  const { data: membership } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/welcome");
  return { supabase, membership };
}

const optional = (value: FormDataEntryValue | null) => String(value || "").trim() || null;

export async function postManualTransaction(formData: FormData) {
  const { supabase, membership } = await context();
  const requestKey = String(formData.get("request_key") || "");
  const projectId = optional(formData.get("project_id"));
  const entryKind = String(formData.get("entry_kind") || "");
  const amount = Number(formData.get("amount") || 0);

  const { data, error } = await supabase.rpc("post_manual_transaction_atomic", {
    request_key: requestKey,
    target_company: membership.company_id,
    target_account: String(formData.get("account_id") || ""),
    target_project: projectId,
    entry_kind: entryKind,
    entry_date: String(formData.get("transaction_date") || ""),
    entry_amount: amount,
    entry_narration: String(formData.get("narration") || "").trim(),
    entry_reference: optional(formData.get("reference")),
    entry_counterparty: optional(formData.get("counterparty")),
    entry_category: optional(formData.get("category")),
    entry_funding_source: optional(formData.get("funding_source")),
    entry_notes: optional(formData.get("notes")),
    target_approval_request: null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/treasury");
  revalidatePath("/add/manual");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  const tx = (data as any)?.transaction_id ? `&transaction=${encodeURIComponent(String((data as any).transaction_id))}` : "";
  redirect(`/add/manual?saved=1&type=${encodeURIComponent(entryKind)}${tx}`);
}

export async function reverseManualTransaction(formData: FormData) {
  const { supabase, membership } = await context();
  const { error } = await supabase.rpc("reverse_manual_transaction_atomic", {
    request_key: String(formData.get("request_key") || ""),
    target_company: membership.company_id,
    target_transaction: String(formData.get("transaction_id") || ""),
    reversal_reason: String(formData.get("reason") || "").trim(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/treasury");
  revalidatePath("/add/manual");
  redirect("/add/manual?reversed=1");
}

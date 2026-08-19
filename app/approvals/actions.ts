"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

async function context() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("company_memberships").select("id, company_id, is_owner").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) redirect("/login");
  const { data: pref } = await supabase.from("user_interface_preferences").select("active_interface").eq("company_id", membership.company_id).eq("user_id", user.id).maybeSingle();
  return { supabase, user, membership, activeInterface: pref?.active_interface ?? (membership.is_owner ? "md_owner" : null) };
}

export async function createApprovalRequest(formData: FormData) {
  const { supabase, user, membership } = await context();
  const description = String(formData.get("description") || "").trim();
  const requestType = String(formData.get("request_type") || "purchase").trim();
  const amount = Number(formData.get("amount") || 0);
  const projectId = String(formData.get("project_id") || "").trim() || null;
  const urgency = String(formData.get("urgency") || "normal");
  if (!description || !Number.isFinite(amount) || amount < 0) throw new Error("Description and a valid amount are required.");

  const { error } = await supabase.from("approval_requests").insert({
    company_id: membership.company_id,
    project_id: projectId,
    requested_by: user.id,
    request_type: requestType,
    description,
    amount,
    urgency,
    evidence_required: formData.get("evidence_required") === "on",
    status: urgency === "emergency" ? "emergency_retrospective" : "pending",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/approvals");
  revalidatePath("/");
  redirect("/approvals?saved=request");
}

async function decide(formData: FormData, action: "approve" | "partial_approve" | "reject" | "return") {
  const { supabase, user, activeInterface } = await context();
  const requestId = String(formData.get("request_id") || "");
  if (!requestId) throw new Error("Request ID is required.");
  const comments = String(formData.get("comments") || "").trim() || null;
  const amountRaw = String(formData.get("approved_amount") || "").trim();

  const { data: request, error: requestError } = await supabase.from("approval_requests").select("id, amount, status").eq("id", requestId).single();
  if (requestError || !request) throw new Error("Request not found or not accessible.");

  const approvedAmount = action === "approve" ? Number(request.amount) : action === "partial_approve" ? Number(amountRaw || 0) : 0;
  const status = action === "approve" ? "approved" : action === "partial_approve" ? "partially_approved" : action === "reject" ? "rejected" : "returned";
  const { error } = await supabase.from("approval_requests").update({
    status,
    approved_amount: approvedAmount,
    decided_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", requestId);
  if (error) throw new Error(error.message);

  const { error: actionError } = await supabase.from("approval_actions").insert({
    request_id: requestId,
    actor_user_id: user.id,
    action,
    amount: approvedAmount || null,
    comments,
    acting_interface: activeInterface,
  });
  if (actionError) throw new Error(actionError.message);
  revalidatePath("/approvals");
  revalidatePath("/");
}

export async function approveRequest(formData: FormData) { return decide(formData, "approve"); }
export async function partiallyApproveRequest(formData: FormData) { return decide(formData, "partial_approve"); }
export async function rejectRequest(formData: FormData) { return decide(formData, "reject"); }
export async function returnRequest(formData: FormData) { return decide(formData, "return"); }

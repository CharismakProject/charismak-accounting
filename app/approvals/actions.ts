"use server";

import { randomUUID } from "node:crypto";
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

export async function recordApprovalPayment(formData: FormData) {
  const { supabase, membership } = await context();
  const requestId = String(formData.get("request_id") || "").trim();
  const accountId = String(formData.get("account_id") || "").trim();
  const entryKind = String(formData.get("entry_kind") || "").trim();
  const amount = Number(formData.get("amount") || 0);
  if (!requestId || !accountId || !Number.isFinite(amount) || amount <= 0) throw new Error("Request, paying account and a valid amount are required.");
  if (!["project_expense", "project_advance", "company_expense"].includes(entryKind)) throw new Error("Invalid accounting treatment for an approval payment.");

  const { data: request, error: requestError } = await supabase
    .from("approval_requests")
    .select("id, project_id, description, status, approved_amount, paid_amount")
    .eq("id", requestId)
    .single();
  if (requestError || !request) throw new Error("Approval request not found or not accessible.");
  if (!["approved", "partially_approved", "partially_paid"].includes(request.status)) throw new Error("This request is not ready for payment.");
  if (entryKind !== "company_expense" && !request.project_id) throw new Error("Choose company expense because this request has no project.");

  const remaining = Number(request.approved_amount || 0) - Number(request.paid_amount || 0);
  if (amount > remaining + 0.005) throw new Error("Payment exceeds the approved unpaid amount.");

  const { error } = await supabase.rpc("post_manual_transaction_atomic", {
    request_key: String(formData.get("request_key") || randomUUID()),
    target_company: membership.company_id,
    target_account: accountId,
    target_project: entryKind === "company_expense" ? null : request.project_id,
    entry_kind: entryKind,
    entry_date: String(formData.get("payment_date") || new Date().toISOString().slice(0, 10)),
    entry_amount: amount,
    entry_narration: `Payment: ${request.description}`,
    entry_reference: String(formData.get("reference") || "").trim() || null,
    entry_counterparty: String(formData.get("counterparty") || "").trim() || null,
    entry_category: String(formData.get("category") || "").trim() || null,
    entry_funding_source: null,
    entry_notes: `Payment recorded from approval ${request.id}`,
    target_approval_request: request.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/approvals");
  revalidatePath("/add/manual");
  revalidatePath("/projects");
  revalidatePath("/treasury");
  revalidatePath("/");
  redirect("/approvals?paid=1");
}

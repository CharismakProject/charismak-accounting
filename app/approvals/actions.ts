"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { APPROVAL_REQUEST_TYPES, APPROVAL_URGENCIES, boundedText, requireAllowed, requiredPositiveMoney } from "../../lib/validation/finance";

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
  const description = boundedText(formData.get("description"), "Description", 1000, true);
  const requestType = requireAllowed(String(formData.get("request_type") || "purchase").trim(), APPROVAL_REQUEST_TYPES, "Request type");
  const amount = requiredPositiveMoney(formData.get("amount"), "Request amount");
  const projectId = String(formData.get("project_id") || "").trim() || null;
  const urgency = requireAllowed(String(formData.get("urgency") || "normal"), APPROVAL_URGENCIES, "Urgency");

  if (projectId) {
    const { data: project, error: projectError } = await supabase.from("projects").select("id").eq("id", projectId).eq("company_id", membership.company_id).maybeSingle();
    if (projectError || !project) throw new Error("Selected project is not accessible in this company workspace.");
  }

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
  const { supabase, user, membership, activeInterface } = await context();
  const requestId = String(formData.get("request_id") || "");
  if (!requestId) throw new Error("Request ID is required.");
  const comments = boundedText(formData.get("comments"), "Comments", 2000, false) || null;
  const amountRaw = String(formData.get("approved_amount") || "").trim();

  const { data: request, error: requestError } = await supabase.from("approval_requests").select("id, company_id, project_id, requested_by, amount, approved_amount, status, decided_at").eq("id", requestId).single();
  if (requestError || !request || request.company_id !== membership.company_id) throw new Error("Request not found or not accessible.");
  if (!["pending", "emergency_retrospective"].includes(String(request.status))) throw new Error("Only pending or emergency-retrospective requests can be decided.");
  if (!membership.is_owner && request.requested_by === user.id && ["approve", "partial_approve"].includes(action)) throw new Error("A non-owner cannot approve their own request.");

  const requestedAmount = Number(request.amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) throw new Error("The request has an invalid amount and cannot be approved.");
  let approvedAmount = 0;
  if (action === "approve") approvedAmount = requestedAmount;
  if (action === "partial_approve") {
    approvedAmount = Number(amountRaw);
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0 || approvedAmount >= requestedAmount) throw new Error("Partial approval must be greater than zero and less than the requested amount.");
  }

  const status = action === "approve" ? "approved" : action === "partial_approve" ? "partially_approved" : action === "reject" ? "rejected" : "returned";
  const now = new Date().toISOString();
  const { error } = await supabase.from("approval_requests").update({
    status,
    approved_amount: approvedAmount,
    decided_at: now,
    updated_at: now,
  }).eq("id", requestId).eq("company_id", membership.company_id).in("status", ["pending", "emergency_retrospective"]);
  if (error) throw new Error(error.message);

  const { error: actionError } = await supabase.from("approval_actions").insert({
    request_id: requestId,
    actor_user_id: user.id,
    action,
    amount: approvedAmount || null,
    comments,
    acting_interface: activeInterface,
  });
  if (actionError) {
    await supabase.from("approval_requests").update({status: request.status, approved_amount: request.approved_amount, decided_at: request.decided_at, updated_at: new Date().toISOString()}).eq("id", requestId).eq("company_id", membership.company_id);
    throw new Error(actionError.message);
  }
  revalidatePath("/approvals");
  revalidatePath("/");
}

export async function approveRequest(formData: FormData) { return decide(formData, "approve"); }
export async function partiallyApproveRequest(formData: FormData) { return decide(formData, "partial_approve"); }
export async function rejectRequest(formData: FormData) { return decide(formData, "reject"); }
export async function returnRequest(formData: FormData) { return decide(formData, "return"); }

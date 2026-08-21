"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { parseRequiredMoney, validateApprovalDecision } from "../../lib/accounting/guards";

const REQUEST_TYPES = new Set([
  "purchase","labour","subcontract","imprest","material_advance","hire","reimbursement","salary",
  "project_funding","supplier","variation","company_expense",
]);
const URGENCIES = new Set(["normal","urgent","emergency"]);

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
  const amount = parseRequiredMoney(formData.get("amount"), "Request amount", { allowZero: false });
  const projectId = String(formData.get("project_id") || "").trim() || null;
  const urgency = String(formData.get("urgency") || "normal");
  if (!description) throw new Error("Describe what this request is for.");
  if (description.length > 1000) throw new Error("Request description is too long.");
  if (!REQUEST_TYPES.has(requestType)) throw new Error("Choose a valid request type.");
  if (!URGENCIES.has(urgency)) throw new Error("Choose a valid urgency.");

  if (projectId) {
    const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("company_id", membership.company_id).maybeSingle();
    if (!project) throw new Error("Selected project is not accessible in your company workspace.");
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
  const { supabase } = await context();
  const requestId = String(formData.get("request_id") || "");
  if (!requestId) throw new Error("Request ID is required.");
  const comments = String(formData.get("comments") || "").trim() || null;
  const amountRaw = String(formData.get("approved_amount") || "").trim();

  const { data: request, error: requestError } = await supabase.from("approval_requests").select("id, amount, status").eq("id", requestId).single();
  if (requestError || !request) throw new Error("Request not found or not accessible.");

  // Fail early with a clear message; the database RPC repeats these checks and performs
  // the request update + audit action in one transaction.
  const validated = validateApprovalDecision(action, request.amount, amountRaw);
  const { error } = await supabase.rpc("decide_approval_request_atomic", {
    target_request: requestId,
    target_action: action,
    target_approved_amount: action === "partial_approve" ? validated.approvedAmount : null,
    target_comments: comments,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/approvals");
  revalidatePath("/");
}

export async function approveRequest(formData: FormData) { return decide(formData, "approve"); }
export async function partiallyApproveRequest(formData: FormData) { return decide(formData, "partial_approve"); }
export async function rejectRequest(formData: FormData) { return decide(formData, "reject"); }
export async function returnRequest(formData: FormData) { return decide(formData, "return"); }

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

async function ownerContext() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("company_memberships")
    .select("id, company_id, is_owner")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership?.is_owner) redirect("/?message=Owner+access+required");
  return { supabase, user, membership };
}

export async function saveRoleEmail(formData: FormData) {
  const { supabase, membership } = await ownerContext();
  const positionCode = String(formData.get("position_code") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const label = String(formData.get("display_label") || "").trim();
  if (!positionCode || !email) throw new Error("Position and email are required.");

  const { error } = await supabase.rpc("owner_save_role_email", {
    target_company: membership.company_id,
    target_position_code: positionCode,
    target_email: email,
    target_label: label || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/access");
  redirect("/admin/access?saved=role-email");
}

export async function assignMemberPosition(formData: FormData) {
  const { supabase, membership } = await ownerContext();
  const membershipId = String(formData.get("membership_id") || "");
  const positionCode = String(formData.get("position_code") || "");
  if (!membershipId || !positionCode) throw new Error("Member and position are required.");

  const { error } = await supabase.rpc("owner_set_member_position", {
    target_company: membership.company_id,
    target_membership: membershipId,
    target_position_code: positionCode,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/access");
  revalidatePath("/");
  redirect("/admin/access?saved=position");
}

export async function assignProjectAccess(formData: FormData) {
  const { supabase, membership } = await ownerContext();
  const membershipId = String(formData.get("membership_id") || "");
  const projectId = String(formData.get("project_id") || "");
  const assignmentRole = String(formData.get("assignment_role") || "Assigned team member").trim();
  if (!membershipId || !projectId) throw new Error("Member and project are required.");

  const { error } = await supabase.rpc("owner_assign_project_access", {
    target_company: membership.company_id,
    target_membership: membershipId,
    target_project: projectId,
    target_role: assignmentRole,
    view_cost: formData.get("can_view_cost") === "on",
    can_request: formData.get("can_request") === "on",
    can_approve: formData.get("can_approve") === "on",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/access");
  revalidatePath(`/projects/${projectId}`);
  redirect("/admin/access?saved=project-access");
}

export async function removeProjectAccess(formData: FormData) {
  const { supabase, membership } = await ownerContext();
  const assignmentId = String(formData.get("assignment_id") || "");
  if (!assignmentId) throw new Error("Assignment ID is required.");

  const { error } = await supabase.rpc("owner_remove_project_access", {
    target_company: membership.company_id,
    target_assignment: assignmentId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/access");
}

export async function setMemberLimit(formData: FormData) {
  const { supabase, membership } = await ownerContext();
  const membershipId = String(formData.get("membership_id") || "");
  const permissionCode = String(formData.get("permission_code") || "");
  const scope = String(formData.get("scope") || "");
  const approvalRaw = String(formData.get("approval_limit") || "").trim();
  const paymentRaw = String(formData.get("payment_limit") || "").trim();
  if (!membershipId || !permissionCode) throw new Error("Member and permission are required.");

  const { error } = await supabase.rpc("owner_set_member_limits", {
    target_company: membership.company_id,
    target_membership: membershipId,
    target_permission_code: permissionCode,
    target_allowed: formData.get("allowed") === "on",
    target_scope: scope || null,
    target_approval_limit: approvalRaw ? Number(approvalRaw) : null,
    target_payment_limit: paymentRaw ? Number(paymentRaw) : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/access");
  redirect("/admin/access?saved=permission");
}

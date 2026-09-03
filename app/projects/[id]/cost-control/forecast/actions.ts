"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../../../lib/supabase/server";
import { isValidCostCode } from "../../../../../lib/project-cost/cost-codes";

const enabled = () => process.env.PROJECT_COST_BRIDGE_ENABLED === "true";
const finiteMoney = (value: number) => Number.isFinite(value) && value >= 0;

export async function saveCommitmentAction(input: {
  projectId: string;
  commitmentId?: string | null;
  costCode: string;
  description: string;
  committedAmount: number;
  paidAmount: number;
  status: "open" | "closed" | "cancelled";
  dueDate?: string | null;
  note?: string | null;
}) {
  if (!enabled()) return { ok: false as const, message: "Project-cost bridge is not enabled." };
  if (!isValidCostCode(input.costCode)) return { ok: false as const, message: "Choose a valid construction cost code." };
  if (!input.description.trim()) return { ok: false as const, message: "Enter a commitment description." };
  if (!finiteMoney(input.committedAmount) || !finiteMoney(input.paidAmount) || input.paidAmount > input.committedAmount) return { ok: false as const, message: "Check the committed and paid amounts." };
  if (input.status === "closed" && Math.abs(input.committedAmount - input.paidAmount) > 0.005) return { ok: false as const, message: "A closed commitment must be fully paid." };
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return { ok: false as const, message: "Due date must use YYYY-MM-DD." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "Sign in again." };
  const { data, error } = await (supabase as any).rpc("save_project_cost_commitment_v1", {
    target_project_id: input.projectId,
    commitment_id: input.commitmentId || null,
    commitment_cost_code: input.costCode,
    commitment_description: input.description.trim(),
    commitment_amount: input.committedAmount,
    commitment_paid_amount: input.paidAmount,
    commitment_status: input.status,
    commitment_due_date: input.dueDate || null,
    commitment_note: input.note?.trim() || null,
  });
  if (error) return { ok: false as const, message: error.message || "Could not save commitment." };
  revalidatePath(`/projects/${input.projectId}/cost-control`);
  revalidatePath(`/projects/${input.projectId}/cost-control/forecast`);
  return { ok: true as const, id: String(data) };
}

export async function approveCostToCompleteAction(input: {
  projectId: string;
  reviewedAt: string;
  lines: Array<{ costCode: string; amount: number; note?: string | null }>;
  note?: string | null;
}) {
  if (!enabled()) return { ok: false as const, message: "Project-cost bridge is not enabled." };
  if (!input.reviewedAt || Number.isNaN(Date.parse(input.reviewedAt))) return { ok: false as const, message: "Choose a valid review date." };
  const lines = input.lines.filter((line) => line.amount > 0 || line.note?.trim());
  for (const line of lines) {
    if (!isValidCostCode(line.costCode) || !finiteMoney(line.amount)) return { ok: false as const, message: "Check the Cost-to-Complete lines." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "Sign in again." };
  const { data, error } = await (supabase as any).rpc("approve_project_cost_forecast_v1", {
    target_project_id: input.projectId,
    reviewed_at_value: new Date(input.reviewedAt).toISOString(),
    forecast_lines: lines,
    forecast_note: input.note?.trim() || null,
  });
  if (error) return { ok: false as const, message: error.message || "Could not approve Cost-to-Complete review." };
  revalidatePath(`/projects/${input.projectId}/cost-control`);
  revalidatePath(`/projects/${input.projectId}/cost-control/forecast`);
  return { ok: true as const, id: String(data) };
}

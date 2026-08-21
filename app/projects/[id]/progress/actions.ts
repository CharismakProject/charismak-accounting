"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { boundedText, optionalNonNegativeMoney, requiredProgressPercent } from "../../../../lib/validation/finance";

export async function recordProgress(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const projectId = String(formData.get("project_id") || "").trim();
  if (!projectId) throw new Error("Project is required.");
  const percent = requiredProgressPercent(formData.get("progress_percent"));
  const summary = boundedText(formData.get("work_summary"), "Work summary", 4000, false);
  const ctc = optionalNonNegativeMoney(formData.get("cost_to_complete"), "Cost to complete");

  const { error } = await supabase.rpc("record_project_progress", {
    target_project: projectId,
    target_percent: percent,
    target_summary: summary || null,
    target_ctc: ctc,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/progress`);
  revalidatePath("/");
  redirect(`/projects/${projectId}/progress?saved=1`);
}

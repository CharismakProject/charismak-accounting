"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { validateProgressInput } from "../../../../lib/accounting/guards";

export async function recordProgress(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const projectId = String(formData.get("project_id") || "");
  const summary = String(formData.get("work_summary") || "").trim();
  if (!projectId) throw new Error("Project is required.");
  if (summary.length > 2000) throw new Error("Progress summary is too long.");
  const validated = validateProgressInput(formData.get("progress_percent"), formData.get("cost_to_complete"));

  const { error } = await supabase.rpc("record_project_progress", {
    target_project: projectId,
    target_percent: validated.percent,
    target_summary: summary || null,
    target_ctc: validated.costToComplete,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/progress`);
  revalidatePath("/");
  redirect(`/projects/${projectId}/progress?saved=1`);
}

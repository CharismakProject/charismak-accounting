"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";

export async function recordProgress(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const projectId = String(formData.get("project_id") || "");
  const percent = Number(formData.get("progress_percent") || 0);
  const summary = String(formData.get("work_summary") || "").trim();
  const ctcRaw = String(formData.get("cost_to_complete") || "").trim();
  if (!projectId || !Number.isFinite(percent)) throw new Error("Project and progress are required.");

  const { error } = await supabase.rpc("record_project_progress", {
    target_project: projectId,
    target_percent: percent,
    target_summary: summary || null,
    target_ctc: ctcRaw ? Number(ctcRaw) : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/progress`);
  revalidatePath("/");
  redirect(`/projects/${projectId}/progress?saved=1`);
}

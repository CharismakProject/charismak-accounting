"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../../../lib/supabase/server";

export async function reviewFieldProgress(formData:FormData){
  const projectId=String(formData.get("project_id")??"").trim();
  const submissionId=String(formData.get("submission_id")??"").trim();
  const decision=String(formData.get("decision")??"").trim();
  const notes=String(formData.get("review_notes")??"").trim();
  if(!projectId||!submissionId)throw new Error("Project and field submission are required.");
  if(!["approve","changes_requested","decline"].includes(decision))throw new Error("Choose a valid review decision.");
  if(decision!=="approve"&&notes.length<3)throw new Error("Add a short review note when requesting changes or declining.");
  const enabled=process.env.PROJECT_COST_BRIDGE_ENABLED==="true"&&process.env.PROJECT_PROGRESS_VALUATION_ENABLED==="true"&&process.env.PROJECT_PROGRESS_FIELD_REVIEW_ENABLED==="true";
  if(!enabled)throw new Error("PM Field Progress review is not enabled for this deployment.");
  const supabase=await createClient();
  const {error}=await supabase.rpc("review_project_field_progress_v1" as never,{target_submission_id:submissionId,decision_value:decision,review_notes_value:notes||null} as never);
  if(error)throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/progress`);
  revalidatePath(`/projects/${projectId}/progress/field`);
}

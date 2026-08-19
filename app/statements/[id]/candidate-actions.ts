"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

async function requireUser(){const supabase=await createClient();const {data}=await supabase.auth.getUser();if(!data.user)redirect("/login");return{supabase,user:data.user};}

export async function linkCandidateToProject(formData:FormData){
  const {supabase}=await requireUser(); const candidateId=String(formData.get("candidate_id")||""); const projectId=String(formData.get("project_id")||""); const importId=String(formData.get("import_id")||"");
  if(!candidateId||!projectId||!importId)throw new Error("Candidate, project and statement import are required.");
  const {error}=await supabase.rpc("link_statement_candidate",{candidate_id:candidateId,target_project:projectId}); if(error)throw new Error(`Could not link candidate: ${error.message}`);
  const {data:posting,error:postingError}=await supabase.rpc("auto_post_statement_matches",{target_import:importId,minimum_confidence:94}); if(postingError)throw new Error(`Project was linked, but automatic posting failed: ${postingError.message}`);
  revalidatePath(`/statements/${importId}`);revalidatePath(`/projects/${projectId}`);revalidatePath("/projects");revalidatePath("/");
  redirect(`/statements/${importId}?candidate=linked&autoposted=${Number(posting?.autoPosted??0)}#transactions`);
}

export async function ignoreCandidate(formData:FormData){
  const {supabase}=await requireUser(); const candidateId=String(formData.get("candidate_id")||""); const importId=String(formData.get("import_id")||""); if(!candidateId||!importId)throw new Error("Candidate and statement import are required.");
  const {error}=await supabase.rpc("ignore_statement_candidate",{candidate_id:candidateId}); if(error)throw new Error(`Could not ignore candidate: ${error.message}`);
  revalidatePath(`/statements/${importId}`);redirect(`/statements/${importId}?candidate=ignored#transactions`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { categoryForClassification, PROJECT_CLASSIFICATIONS, validateStatementClassification } from "../../../lib/accounting/guards";

export async function confirmStatementTransaction(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const rowId = String(formData.get("statement_row_id") || "");
  const importId = String(formData.get("import_id") || "");
  const classification = validateStatementClassification(formData.get("classification"));
  const selectedProjectId = String(formData.get("project_id") || "").trim() || null;
  const projectId = PROJECT_CLASSIFICATIONS.has(classification) ? selectedProjectId : null;
  const categoryName = categoryForClassification(classification, formData.get("category_name"));
  if (!rowId || !importId) throw new Error("Statement row and import are required.");
  if (PROJECT_CLASSIFICATIONS.has(classification) && !projectId) throw new Error("Choose a project for project funding or project expense.");

  const { data, error } = await supabase.rpc("confirm_statement_transaction_atomic", {
    target_row: rowId,
    target_import: importId,
    target_classification: classification,
    target_project: projectId,
    target_category: categoryName,
  });
  if (error) throw new Error(error.message);

  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
  }
  revalidatePath(`/statements/${importId}`);
  revalidatePath("/statements");
  revalidatePath("/");
  const already = Boolean((data as any)?.already_recorded);
  redirect(`/statements/${importId}?confirmed=${already ? "already" : "posted"}#transactions`);
}

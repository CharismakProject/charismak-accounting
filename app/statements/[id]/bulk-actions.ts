"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

async function runBulk(formData: FormData, resolution: string) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const importId = String(formData.get("import_id") || "");
  const keyword = String(formData.get("keyword") || "").trim() || null;
  if (!importId) throw new Error("Statement import is required.");

  const { data, error } = await supabase.rpc("bulk_resolve_statement_rows", {
    target_import: importId,
    target_resolution: resolution,
    target_keyword: keyword,
  });
  if (error) {
    redirect(`/statements/${importId}/bulk?error=Unable+to+complete+that+bulk+action.+The+unresolved+rows+are+still+safe+for+review.`);
  }

  revalidatePath(`/statements/${importId}`);
  revalidatePath("/statements");
  revalidatePath("/");
  const skipped = Number((data as any)?.skipped_incomplete || 0);
  redirect(`/statements/${importId}?bulk=${encodeURIComponent(resolution)}&count=${Number((data as any)?.resolved || 0)}&skipped=${skipped}#transactions`);
}

export async function bulkCompanyLevel(formData: FormData) { return runBulk(formData, "company_level"); }
export async function bulkPersonal(formData: FormData) { return runBulk(formData, "personal_non_business"); }
export async function bulkTransfer(formData: FormData) { return runBulk(formData, "internal_transfer"); }
export async function bulkReconciliationOnly(formData: FormData) { return runBulk(formData, "reconciliation_only"); }

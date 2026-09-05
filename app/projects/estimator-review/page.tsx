import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import EstimatorBudgetReview from "./review-client";

export type EstimatorReviewProjectOption = {
  id: string;
  companyId: string;
  projectCode: string | null;
  name: string;
  location: string | null;
  contractValue: number | null;
};

export default async function EstimatorBudgetReviewPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data, error } = await supabase
    .from("projects")
    .select("id,company_id,project_code,name,location,contract_value")
    .order("name");

  if (error) throw new Error(error.message);

  const projects: EstimatorReviewProjectOption[] = (data ?? []).map((project: any) => ({
    id: String(project.id),
    companyId: String(project.company_id),
    projectCode: project.project_code ? String(project.project_code) : null,
    name: String(project.name),
    location: project.location ? String(project.location) : null,
    contractValue:
      project.contract_value == null ? null : Number(project.contract_value),
  }));

  const bridgeEnabled = process.env.PROJECT_COST_BRIDGE_ENABLED === "true";

  return (
    <main className="page-canvas">
      <div className="page-wrap">
        <div className="page-toolbar">
          <Link href="/projects" className="back-link">
            ← Projects
          </Link>
        </div>
        <header className="page-heading compact">
          <p className="page-eyebrow">Estimator → Accounting</p>
          <h1>Review a completed BOQ</h1>
          <p>
            Check the project, internal budget and construction cost codes before any
            Estimator value becomes an Accounting budget.
          </p>
        </header>
        <EstimatorBudgetReview projects={projects} bridgeEnabled={bridgeEnabled} />
      </div>
    </main>
  );
}

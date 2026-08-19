import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

const money = (value: number | string | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value));

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, project_code, name, location, status, progress_percent, client:clients(name), summary:project_financial_summaries(funding_received, confirmed_expenditure, cash_balance, outstanding_commitments, funding_surplus_shortfall, forecast_profit)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (
    <main className="page-canvas">
      <div className="page-wrap">
        <div className="page-toolbar project-toolbar">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" className="back-link">← Dashboard</Link>
            <Link href="/statements" className="secondary-link">Statements</Link>
          </div>
          <Link href="/projects/new" className="md-button">+ New Project</Link>
        </div>

        <header className="page-heading compact project-list-heading">
          <p className="page-eyebrow">Projects</p>
          <h1>Project Control</h1>
          <p>Live project accounts, funding, expenditure, commitments and delivery position.</p>
        </header>

        <section className="project-list-grid">
          {(projects ?? []).map((project: any) => {
            const summary = Array.isArray(project.summary) ? project.summary[0] : project.summary;
            const client = Array.isArray(project.client) ? project.client[0] : project.client;
            const shortfall = Number(summary?.funding_surplus_shortfall ?? 0);
            const forecast = Number(summary?.forecast_profit ?? 0);
            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="project-list-card">
                <div className="project-list-top">
                  <div>
                    <span className="project-code-pill">{project.project_code}</span>
                    <h2>{project.name}</h2>
                    <p>{client?.name ?? "No client"} · {project.location ?? "Location not set"}</p>
                  </div>
                  <div className="project-list-position">
                    <small>Funding position</small>
                    <strong className={shortfall < 0 ? "negative" : "positive"}>{money(shortfall)}</strong>
                    <span>{Number(project.progress_percent ?? 0).toFixed(0)}% progress</span>
                  </div>
                </div>

                <div className="project-list-kpis">
                  {[
                    ["Funding", summary?.funding_received],
                    ["Expenditure", summary?.confirmed_expenditure],
                    ["Cash", summary?.cash_balance],
                    ["Commitments", summary?.outstanding_commitments],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <small>{String(label)}</small>
                      <b>{money(value as any)}</b>
                    </div>
                  ))}
                </div>

                <div className="project-list-footer">
                  <span>Status: {String(project.status).replaceAll("_", " ")}</span>
                  <span className={forecast < 0 ? "negative" : ""}>Forecast profit: {money(forecast)}</span>
                  <b>Open project →</b>
                </div>
              </Link>
            );
          })}
          {(projects ?? []).length === 0 && <article className="compact-card"><b>No projects yet.</b><p style={{ marginBottom: 0, color: "#718195" }}>Create a project or let statement discovery suggest one.</p></article>}
        </section>
      </div>
    </main>
  );
}

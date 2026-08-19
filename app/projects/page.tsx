import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

const money = (value: number | string | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value));

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, project_code, name, location, status, client:clients(name), summary:project_financial_summaries(funding_received, confirmed_expenditure, cash_balance, outstanding_commitments, funding_surplus_shortfall)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "28px clamp(18px,4vw,54px)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", marginBottom: 24 }}>
        <div>
          <p style={{ margin: 0, color: "#1f6fe5", textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 900 }}>Projects</p>
          <h1 style={{ margin: "6px 0 4px", color: "#12283f", fontSize: 32 }}>Project Control</h1>
          <p style={{ margin: 0, color: "#718195" }}>Real project data. Jahi is now our primary accounting test case.</p>
        </div>
        <Link href="/projects/new" style={{ background: "#0b3253", color: "white", padding: "12px 16px", borderRadius: 11, textDecoration: "none", fontWeight: 800 }}>+ New Project</Link>
      </header>

      <section style={{ display: "grid", gap: 14 }}>
        {(projects ?? []).map((project: any) => {
          const summary = Array.isArray(project.summary) ? project.summary[0] : project.summary;
          const client = Array.isArray(project.client) ? project.client[0] : project.client;
          const shortfall = Number(summary?.funding_surplus_shortfall ?? 0);
          return (
            <Link key={project.id} href={`/projects/${project.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <article style={{ background: "white", border: "1px solid #dde6ee", borderRadius: 16, padding: 18, boxShadow: "0 8px 26px rgba(24,48,75,.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <span style={{ display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "#eaf2ff", color: "#1f6fe5", fontSize: 11, fontWeight: 900 }}>{project.project_code}</span>
                    <h2 style={{ margin: "8px 0 4px", fontSize: 21 }}>{project.name}</h2>
                    <p style={{ margin: 0, color: "#7b8a99", fontSize: 13 }}>{client?.name ?? "No client"} · {project.location ?? "Location not set"} · {project.status}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <small style={{ color: "#8493a1" }}>Funding position after commitments</small>
                    <strong style={{ display: "block", marginTop: 4, fontSize: 20, color: shortfall < 0 ? "#c34c4c" : "#11825b" }}>{money(shortfall)}</strong>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginTop: 17 }}>
                  {[['Funding', summary?.funding_received], ['Expenditure', summary?.confirmed_expenditure], ['Cash Balance', summary?.cash_balance], ['Commitments', summary?.outstanding_commitments]].map(([label, value]) => (
                    <div key={String(label)} style={{ background: "#f8fafc", borderRadius: 11, padding: 11 }}>
                      <small style={{ color: "#82909d" }}>{String(label)}</small>
                      <b style={{ display: "block", marginTop: 4 }}>{money(value as any)}</b>
                    </div>
                  ))}
                </div>
              </article>
            </Link>
          );
        })}
      </section>
    </main>
  );
}

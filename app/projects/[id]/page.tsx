import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { updateProject } from "../actions";

const money = (value: number | string | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value));

const field = { width: "100%", border: "1px solid #d3dde6", borderRadius: 10, padding: "10px 11px", fontSize: 14 } as const;
const label = { display: "grid", gap: 6, fontSize: 12, fontWeight: 800, color: "#31475d" } as const;

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, project_code, name, location, status, start_date, aliases, contract_value, internal_cost_budget, notes, client:clients(name), summary:project_financial_summaries(funding_received, confirmed_expenditure, cash_balance, outstanding_commitments, funding_surplus_shortfall, reporting_period_start, reporting_period_end, source_label), categories:project_cost_categories(category_name, amount, sort_order)")
    .eq("id", id)
    .single();

  if (error || !project) notFound();

  const summary: any = Array.isArray((project as any).summary) ? (project as any).summary[0] : (project as any).summary;
  const client: any = Array.isArray((project as any).client) ? (project as any).client[0] : (project as any).client;
  const categories = [...(((project as any).categories ?? []) as any[])].sort((a, b) => a.sort_order - b.sort_order);
  const shortfall = Number(summary?.funding_surplus_shortfall ?? 0);

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "28px clamp(18px,4vw,54px)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Link href="/projects" style={{ color: "#1f6fe5", textDecoration: "none", fontWeight: 800 }}>← Projects</Link>

        <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap", margin: "16px 0 20px" }}>
          <div>
            <span style={{ display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "#eaf2ff", color: "#1f6fe5", fontSize: 11, fontWeight: 900 }}>{project.project_code}</span>
            <h1 style={{ margin: "8px 0 4px", fontSize: 32, color: "#12283f" }}>{project.name}</h1>
            <p style={{ margin: 0, color: "#718195" }}>{client?.name ?? "No client"} · {project.location ?? "Location not set"}</p>
          </div>
          {query.saved === "1" && <div style={{ background: "#eaf8f2", color: "#127a58", padding: "10px 12px", borderRadius: 10, fontWeight: 800 }}>Saved successfully</div>}
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10, marginBottom: 14 }}>
          {[['Funding Received', summary?.funding_received], ['Confirmed Expenditure', summary?.confirmed_expenditure], ['Cash Balance', summary?.cash_balance], ['Outstanding Commitments', summary?.outstanding_commitments], ['Funding Position', summary?.funding_surplus_shortfall]].map(([name, value]) => (
            <article key={String(name)} style={{ background: "white", border: "1px solid #dde6ee", borderRadius: 13, padding: 13 }}>
              <small style={{ color: "#82909d" }}>{String(name)}</small>
              <strong style={{ display: "block", marginTop: 7, fontSize: 18, color: name === 'Funding Position' && shortfall < 0 ? '#c34c4c' : '#12283f' }}>{money(value as any)}</strong>
            </article>
          ))}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 14, alignItems: "start" }}>
          <article style={{ background: "white", border: "1px solid #dde6ee", borderRadius: 16, padding: 18 }}>
            <header style={{ marginBottom: 12 }}><small style={{ color: "#7a8998", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Cost Breakdown</small><h2 style={{ margin: "4px 0" }}>Expenditure by Work Category</h2></header>
            <div style={{ display: "grid", gap: 8 }}>
              {categories.map((category) => (
                <div key={category.category_name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eef2f5" }}>
                  <span style={{ fontWeight: 700 }}>{category.category_name}</span>
                  <strong>{money(category.amount)}</strong>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, paddingTop: 10, fontSize: 16 }}><b>Total</b><b>{money(categories.reduce((sum, item) => sum + Number(item.amount), 0))}</b></div>
            </div>
          </article>

          <form action={updateProject} style={{ background: "white", border: "1px solid #dde6ee", borderRadius: 16, padding: 18, display: "grid", gap: 12 }}>
            <header><small style={{ color: "#7a8998", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Update Project</small><h2 style={{ margin: "4px 0" }}>Project & Financial Summary</h2><p style={{ margin: 0, color: "#7a8998", fontSize: 12 }}>For now this updates the project summary. Transaction-level updates come next.</p></header>
            <input type="hidden" name="project_id" value={project.id} />
            <label style={label}>Project name<input name="name" defaultValue={project.name} required style={field} /></label>
            <label style={label}>Location<input name="location" defaultValue={project.location ?? ""} style={field} /></label>
            <label style={label}>Status<select name="status" defaultValue={project.status} style={field}><option value="draft">Draft</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
            <label style={label}>Client / contract value<input name="contract_value" type="number" step="0.01" defaultValue={project.contract_value ?? ""} style={field} /></label>
            <label style={label}>Internal cost budget<input name="internal_cost_budget" type="number" step="0.01" defaultValue={project.internal_cost_budget ?? ""} style={field} /></label>
            <label style={label}>Funding received<input name="funding_received" type="number" step="0.01" defaultValue={summary?.funding_received ?? 0} style={field} /></label>
            <label style={label}>Confirmed expenditure<input name="confirmed_expenditure" type="number" step="0.01" defaultValue={summary?.confirmed_expenditure ?? 0} style={field} /></label>
            <label style={label}>Outstanding commitments<input name="outstanding_commitments" type="number" step="0.01" defaultValue={summary?.outstanding_commitments ?? 0} style={field} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={label}>Period start<input name="reporting_period_start" type="date" defaultValue={summary?.reporting_period_start ?? ""} style={field} /></label>
              <label style={label}>Period end<input name="reporting_period_end" type="date" defaultValue={summary?.reporting_period_end ?? ""} style={field} /></label>
            </div>
            <label style={label}>Source / report<input name="source_label" defaultValue={summary?.source_label ?? ""} style={field} /></label>
            <label style={label}>Aliases<input name="aliases" defaultValue={(project.aliases ?? []).join(", ")} style={field} /></label>
            <label style={label}>Notes<textarea name="notes" rows={3} defaultValue={project.notes ?? ""} style={field} /></label>
            <button type="submit" style={{ border: 0, borderRadius: 10, padding: "11px 15px", background: "#0b3253", color: "white", fontWeight: 850 }}>Save Project Update</button>
          </form>
        </section>
      </div>
    </main>
  );
}

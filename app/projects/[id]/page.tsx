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
const card = { background: "white", border: "1px solid #dde6ee", borderRadius: 16, padding: 18 } as const;

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, project_code, name, location, status, start_date, end_date, aliases, contract_value, internal_cost_budget, notes, client:clients(name, contact_person, email, phone), summary:project_financial_summaries(funding_received, confirmed_expenditure, cash_balance, outstanding_commitments, funding_surplus_shortfall, commitments_approved, commitments_paid, reporting_period_start, reporting_period_end, source_label), categories:project_cost_categories(category_name, amount, sort_order)")
    .eq("id", id)
    .single();

  if (error || !project) notFound();

  const [{ data: commitments }, { data: exclusions }, { data: transactions }, { data: documents }] = await Promise.all([
    supabase.from("project_commitments").select("id, description, approved_amount, paid_amount, outstanding_amount, status, source_label").eq("project_id", id).order("created_at"),
    supabase.from("project_exclusions").select("id, description, amount, reason, source_label").eq("project_id", id).order("created_at"),
    supabase.from("canonical_transactions").select("id, transaction_date, narration, counterparty, signed_amount, classification, category_name, status").eq("project_id", id).order("transaction_date", { ascending: false }).limit(20),
    supabase.from("source_documents").select("id, document_type, file_name, document_date, source_name, amount, uploaded_at").eq("project_id", id).order("uploaded_at", { ascending: false }).limit(20),
  ]);

  const summary: any = Array.isArray((project as any).summary) ? (project as any).summary[0] : (project as any).summary;
  const client: any = Array.isArray((project as any).client) ? (project as any).client[0] : (project as any).client;
  const categories = [...(((project as any).categories ?? []) as any[])].sort((a, b) => a.sort_order - b.sort_order);
  const shortfall = Number(summary?.funding_surplus_shortfall ?? 0);
  const categoryTotal = categories.reduce((sum, item) => sum + Number(item.amount), 0);
  const commitmentRows = commitments ?? [];
  const exclusionRows = exclusions ?? [];
  const txRows = transactions ?? [];
  const docRows = documents ?? [];

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "28px clamp(18px,4vw,54px)" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#0b3253", textDecoration: "none", fontWeight: 800 }}>← Dashboard</Link>
          <Link href="/projects" style={{ color: "#1f6fe5", textDecoration: "none", fontWeight: 800 }}>All Projects</Link>
          <Link href="/statements/upload" style={{ color: "#1f6fe5", textDecoration: "none", fontWeight: 800 }}>Upload Statement</Link>
        </div>

        <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap", margin: "16px 0 20px" }}>
          <div>
            <span style={{ display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "#fff0df", color: "#c76500", fontSize: 11, fontWeight: 900 }}>{project.project_code}</span>
            <h1 style={{ margin: "8px 0 4px", fontSize: 34, color: "#12283f" }}>{project.name}</h1>
            <p style={{ margin: 0, color: "#718195" }}>{client?.name ?? "No client"} · {project.location ?? "Location not set"} · {project.status}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <small style={{ display: "block", color: "#7c8b98", marginBottom: 4 }}>Reporting period</small>
            <strong style={{ color: "#12283f" }}>{summary?.reporting_period_start ?? "—"} → {summary?.reporting_period_end ?? "—"}</strong>
            {query.saved === "1" && <div style={{ marginTop: 8, background: "#eaf8f2", color: "#127a58", padding: "8px 10px", borderRadius: 10, fontWeight: 800 }}>Saved successfully</div>}
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 14 }}>
          {[
            ['Funding Received', summary?.funding_received],
            ['Confirmed Expenditure', summary?.confirmed_expenditure],
            ['Cash Balance', summary?.cash_balance],
            ['Commitments Approved', summary?.commitments_approved],
            ['Commitments Paid', summary?.commitments_paid],
            ['Outstanding Commitments', summary?.outstanding_commitments],
            ['Funding Position', summary?.funding_surplus_shortfall],
          ].map(([name, value]) => (
            <article key={String(name)} style={{ background: "white", border: "1px solid #dde6ee", borderRadius: 13, padding: 13 }}>
              <small style={{ color: "#82909d" }}>{String(name)}</small>
              <strong style={{ display: "block", marginTop: 7, fontSize: 18, color: name === 'Funding Position' && shortfall < 0 ? '#c34c4c' : '#12283f' }}>{money(value as any)}</strong>
            </article>
          ))}
        </section>

        <section style={{ ...card, marginBottom: 14 }}>
          <header style={{ marginBottom: 14 }}><small style={{ color: "#7a8998", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Project Identity</small><h2 style={{ margin: "4px 0" }}>Jahi Account Profile</h2></header>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
            <div><small style={{ color: "#82909d" }}>Client</small><strong style={{ display: "block", marginTop: 4 }}>{client?.name ?? "—"}</strong></div>
            <div><small style={{ color: "#82909d" }}>Contact person</small><strong style={{ display: "block", marginTop: 4 }}>{client?.contact_person ?? "—"}</strong></div>
            <div><small style={{ color: "#82909d" }}>Start date</small><strong style={{ display: "block", marginTop: 4 }}>{project.start_date ?? "—"}</strong></div>
            <div><small style={{ color: "#82909d" }}>Contract value</small><strong style={{ display: "block", marginTop: 4 }}>{money(project.contract_value)}</strong></div>
            <div><small style={{ color: "#82909d" }}>Internal cost budget</small><strong style={{ display: "block", marginTop: 4 }}>{money(project.internal_cost_budget)}</strong></div>
            <div><small style={{ color: "#82909d" }}>Source baseline</small><strong style={{ display: "block", marginTop: 4 }}>{summary?.source_label ?? "—"}</strong></div>
            <div style={{ gridColumn: "1 / -1" }}><small style={{ color: "#82909d" }}>Known aliases</small><strong style={{ display: "block", marginTop: 4 }}>{(project.aliases ?? []).join(", ") || "—"}</strong></div>
            <div style={{ gridColumn: "1 / -1" }}><small style={{ color: "#82909d" }}>Notes</small><span style={{ display: "block", marginTop: 4, color: "#40576c" }}>{project.notes || "—"}</span></div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(320px,.85fr)", gap: 14, alignItems: "start", marginBottom: 14 }}>
          <article style={card}>
            <header style={{ marginBottom: 12 }}><small style={{ color: "#7a8998", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Cost Breakdown</small><h2 style={{ margin: "4px 0" }}>Confirmed Expenditure by Work Category</h2></header>
            <div style={{ display: "grid", gap: 4 }}>
              {categories.map((category) => (
                <div key={category.category_name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: "1px solid #eef2f5" }}>
                  <span style={{ fontWeight: 700 }}>{category.category_name}</span>
                  <strong>{money(category.amount)}</strong>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, paddingTop: 12, fontSize: 16 }}><b>Category total</b><b>{money(categoryTotal)}</b></div>
              {Math.abs(categoryTotal - Number(summary?.confirmed_expenditure ?? 0)) > 0.01 && <p style={{ margin: "8px 0 0", color: "#9a6800", fontSize: 12 }}>Category total does not exactly equal the project expenditure baseline. This remains visible for reconciliation rather than being hidden.</p>}
            </div>
          </article>

          <article style={card}>
            <header style={{ marginBottom: 12 }}><small style={{ color: "#7a8998", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Commitments</small><h2 style={{ margin: "4px 0" }}>Outstanding Retirement Commitments</h2></header>
            {commitmentRows.length ? commitmentRows.map((item: any) => (
              <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid #eef2f5" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><b>{item.description}</b><strong>{money(item.outstanding_amount)}</strong></div>
                <small style={{ color: "#82909d" }}>{item.status}</small>
              </div>
            )) : <p style={{ color: "#82909d" }}>No commitment breakdown recorded.</p>}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingTop: 12 }}><b>Total outstanding</b><b>{money(commitmentRows.reduce((sum: number, row: any) => sum + Number(row.outstanding_amount), 0))}</b></div>
          </article>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <article style={card}>
            <header style={{ marginBottom: 12 }}><small style={{ color: "#7a8998", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Excluded Movements</small><h2 style={{ margin: "4px 0" }}>Passed Through Wallet but Not Project Cost</h2></header>
            {exclusionRows.length ? exclusionRows.map((item: any) => (
              <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid #eef2f5" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><b>{item.description}</b><strong>{money(item.amount)}</strong></div>
                <small style={{ color: "#82909d" }}>{item.reason}</small>
              </div>
            )) : <p style={{ color: "#82909d" }}>No excluded movements recorded.</p>}
          </article>

          <article style={card}>
            <header style={{ marginBottom: 12 }}><small style={{ color: "#7a8998", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Activity</small><h2 style={{ margin: "4px 0" }}>Statements, Documents & Confirmed Transactions</h2></header>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
              <div style={{ background: "#f6f8fa", borderRadius: 12, padding: 12 }}><small style={{ color: "#82909d" }}>Confirmed/imported transactions</small><strong style={{ display: "block", marginTop: 5, fontSize: 22 }}>{txRows.length}</strong></div>
              <div style={{ background: "#f6f8fa", borderRadius: 12, padding: 12 }}><small style={{ color: "#82909d" }}>Attached documents</small><strong style={{ display: "block", marginTop: 5, fontSize: 22 }}>{docRows.length}</strong></div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
              <Link href="/statements" style={{ fontWeight: 800, color: "#0b3253" }}>Review statement imports →</Link>
              <Link href="/statements/upload" style={{ fontWeight: 800, color: "#0b3253" }}>Upload new statement →</Link>
            </div>
          </article>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start", marginBottom: 14 }}>
          <article style={card}>
            <header style={{ marginBottom: 12 }}><small style={{ color: "#7a8998", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Recent Project Transactions</small><h2 style={{ margin: "4px 0" }}>Confirmed After Statement Review</h2></header>
            {txRows.length ? txRows.map((tx: any) => (
              <div key={tx.id} style={{ display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 10, padding: "10px 0", borderBottom: "1px solid #eef2f5" }}>
                <small>{tx.transaction_date}</small>
                <div><b>{tx.narration || tx.counterparty || "Transaction"}</b><small style={{ display: "block", color: "#82909d" }}>{tx.classification || "unclassified"}{tx.category_name ? ` · ${tx.category_name}` : ""}</small></div>
                <strong>{money(tx.signed_amount)}</strong>
              </div>
            )) : <p style={{ color: "#82909d" }}>No statement transaction has been confirmed against Jahi yet. The retirement baseline remains the current source of truth.</p>}
          </article>

          <article style={card}>
            <header style={{ marginBottom: 12 }}><small style={{ color: "#7a8998", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Attached Evidence</small><h2 style={{ margin: "4px 0" }}>Project Documents</h2></header>
            {docRows.length ? docRows.map((doc: any) => (
              <div key={doc.id} style={{ padding: "10px 0", borderBottom: "1px solid #eef2f5" }}>
                <b>{doc.file_name}</b><small style={{ display: "block", color: "#82909d" }}>{doc.document_type} · {doc.source_name || "source not set"}</small>
              </div>
            )) : <p style={{ color: "#82909d" }}>No file has been attached directly to Jahi yet. Statement uploads will begin populating this area.</p>}
          </article>
        </section>

        <form action={updateProject} style={{ ...card, display: "grid", gap: 12 }}>
          <header><small style={{ color: "#7a8998", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 900 }}>Update Project</small><h2 style={{ margin: "4px 0" }}>Project & Financial Summary</h2><p style={{ margin: 0, color: "#7a8998", fontSize: 12 }}>This edits the project baseline. Confirmed statement transactions are handled separately so the audit trail remains intact.</p></header>
          <input type="hidden" name="project_id" value={project.id} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <label style={label}>Project name<input name="name" defaultValue={project.name} required style={field} /></label>
            <label style={label}>Location<input name="location" defaultValue={project.location ?? ""} style={field} /></label>
            <label style={label}>Status<select name="status" defaultValue={project.status} style={field}><option value="draft">Draft</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
            <label style={label}>Client / contract value<input name="contract_value" type="number" step="0.01" defaultValue={project.contract_value ?? ""} style={field} /></label>
            <label style={label}>Internal cost budget<input name="internal_cost_budget" type="number" step="0.01" defaultValue={project.internal_cost_budget ?? ""} style={field} /></label>
            <label style={label}>Funding received<input name="funding_received" type="number" step="0.01" defaultValue={summary?.funding_received ?? 0} style={field} /></label>
            <label style={label}>Confirmed expenditure<input name="confirmed_expenditure" type="number" step="0.01" defaultValue={summary?.confirmed_expenditure ?? 0} style={field} /></label>
            <label style={label}>Outstanding commitments<input name="outstanding_commitments" type="number" step="0.01" defaultValue={summary?.outstanding_commitments ?? 0} style={field} /></label>
            <label style={label}>Period start<input name="reporting_period_start" type="date" defaultValue={summary?.reporting_period_start ?? ""} style={field} /></label>
            <label style={label}>Period end<input name="reporting_period_end" type="date" defaultValue={summary?.reporting_period_end ?? ""} style={field} /></label>
            <label style={label}>Source / report<input name="source_label" defaultValue={summary?.source_label ?? ""} style={field} /></label>
          </div>
          <label style={label}>Aliases<input name="aliases" defaultValue={(project.aliases ?? []).join(", ")} style={field} /></label>
          <label style={label}>Notes<textarea name="notes" rows={3} defaultValue={project.notes ?? ""} style={field} /></label>
          <button type="submit" style={{ justifySelf: "start", border: 0, borderRadius: 10, padding: "11px 18px", background: "#0b3253", color: "white", fontWeight: 850 }}>Save Project Update</button>
        </form>
      </div>
    </main>
  );
}

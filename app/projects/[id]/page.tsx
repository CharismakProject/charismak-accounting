import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { updateProject } from "../actions";

const money = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value));

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
    supabase.from("project_commitments").select("id, description, outstanding_amount, status").eq("project_id", id).order("created_at"),
    supabase.from("project_exclusions").select("id, description, amount, reason").eq("project_id", id).order("created_at"),
    supabase.from("canonical_transactions").select("id, transaction_date, narration, counterparty, signed_amount, classification, category_name, status").eq("project_id", id).order("transaction_date", { ascending: false }).limit(20),
    supabase.from("source_documents").select("id, document_type, file_name, uploaded_at").eq("project_id", id).order("uploaded_at", { ascending: false }).limit(20),
  ]);

  const summary: any = Array.isArray((project as any).summary) ? (project as any).summary[0] : (project as any).summary;
  const client: any = Array.isArray((project as any).client) ? (project as any).client[0] : (project as any).client;
  const categories = [...(((project as any).categories ?? []) as any[])].sort((a, b) => a.sort_order - b.sort_order);
  const shortfall = Number(summary?.funding_surplus_shortfall ?? 0);

  return (
    <main className="page-shell">
      <div className="page-wrap">
        <div className="page-actions">
          <Link href="/">← Dashboard</Link>
          <Link href="/projects">All Projects</Link>
          <Link href="/projects/new">+ New Project</Link>
          <Link href="/statements/upload">Upload Statement</Link>
        </div>

        <header className="project-header">
          <div>
            <span className="project-code">{project.project_code}</span>
            <h1>{project.name}</h1>
            <p>{client?.name ?? "No client"} · {project.location ?? "Location not set"} · {project.status}</p>
          </div>
          <div className="report-period">
            <small>Reporting period</small>
            <strong>{summary?.reporting_period_start ?? "—"} → {summary?.reporting_period_end ?? "—"}</strong>
            {query.saved === "1" && <span className="save-ok">Saved successfully</span>}
          </div>
        </header>

        <section className="project-kpis">
          {[
            ["Funding Received", summary?.funding_received],
            ["Confirmed Expenditure", summary?.confirmed_expenditure],
            ["Cash Balance", summary?.cash_balance],
            ["Commitments Approved", summary?.commitments_approved],
            ["Commitments Paid", summary?.commitments_paid],
            ["Outstanding Commitments", summary?.outstanding_commitments],
            ["Funding Position", summary?.funding_surplus_shortfall],
          ].map(([name, value]) => (
            <article className="compact-card" key={String(name)}>
              <small>{String(name)}</small>
              <strong className={name === "Funding Position" && shortfall < 0 ? "negative" : ""}>{money(value as any)}</strong>
            </article>
          ))}
        </section>

        <section className="data-card">
          <div className="section-title"><small>Project identity</small><h2>Project Account Profile</h2></div>
          <div className="identity-grid">
            <Info label="Client" value={client?.name} />
            <Info label="Contact person" value={client?.contact_person} />
            <Info label="Start date" value={project.start_date} />
            <Info label="Contract value" value={money(project.contract_value)} />
            <Info label="Internal cost budget" value={money(project.internal_cost_budget)} />
            <Info label="Source baseline" value={summary?.source_label} />
            <Info label="Known aliases" value={(project.aliases ?? []).join(", ") || "—"} wide />
            <Info label="Notes" value={project.notes || "—"} wide />
          </div>
        </section>

        <section className="project-two-col">
          <article className="data-card">
            <div className="section-title"><small>Cost breakdown</small><h2>Confirmed Expenditure by Work Category</h2></div>
            {categories.length ? categories.map((row: any) => <DataRow key={row.category_name} label={row.category_name} value={money(row.amount)} />) : <Empty text="No work-category expenditure has been classified yet." />}
          </article>
          <article className="data-card">
            <div className="section-title"><small>Commitments</small><h2>Outstanding Commitments</h2></div>
            {(commitments ?? []).length ? (commitments ?? []).map((row: any) => <DataRow key={row.id} label={row.description} value={money(row.outstanding_amount)} note={row.status} />) : <Empty text="No commitment breakdown recorded." />}
          </article>
        </section>

        <section className="project-two-col">
          <article className="data-card">
            <div className="section-title"><small>Excluded movements</small><h2>Not Included in Project Cost</h2></div>
            {(exclusions ?? []).length ? (exclusions ?? []).map((row: any) => <DataRow key={row.id} label={row.description} value={money(row.amount)} note={row.reason} />) : <Empty text="No excluded movements recorded." />}
          </article>
          <article className="data-card">
            <div className="section-title"><small>Activity</small><h2>Project Evidence & Transactions</h2></div>
            <div className="activity-grid">
              <div><small>Confirmed transactions</small><strong>{(transactions ?? []).length}</strong></div>
              <div><small>Attached documents</small><strong>{(documents ?? []).length}</strong></div>
            </div>
            <div className="inline-links"><Link href="/statements">Review statement imports →</Link><Link href="/statements/upload">Upload statement →</Link></div>
          </article>
        </section>

        <section className="project-two-col">
          <article className="data-card">
            <div className="section-title"><small>Recent project transactions</small><h2>Confirmed Statement Activity</h2></div>
            {(transactions ?? []).length ? (transactions ?? []).map((tx: any) => <DataRow key={tx.id} label={tx.narration || tx.counterparty || "Transaction"} value={money(tx.signed_amount)} note={`${tx.transaction_date} · ${String(tx.classification || "unclassified").replaceAll("_", " ")}${tx.category_name ? ` · ${tx.category_name}` : ""}`} />) : <Empty text="No statement transaction has been confirmed against this project yet." />}
          </article>
          <article className="data-card">
            <div className="section-title"><small>Attached evidence</small><h2>Project Documents</h2></div>
            {(documents ?? []).length ? (documents ?? []).map((doc: any) => <DataRow key={doc.id} label={doc.file_name} value={String(doc.document_type).replaceAll("_", " ")} note={new Date(doc.uploaded_at).toLocaleDateString("en-NG")} />) : <Empty text="No files are attached directly to this project yet." />}
          </article>
        </section>

        <section className="data-card update-card">
          <div className="section-title"><small>Update project</small><h2>Project & Financial Summary</h2><p>Use this for project baseline corrections. Confirmed statement transactions are handled separately so the audit trail remains intact.</p></div>
          <form action={updateProject} className="project-form">
            <input type="hidden" name="project_id" value={project.id} />
            <label>Project name<input name="name" defaultValue={project.name} required /></label>
            <label>Location<input name="location" defaultValue={project.location ?? ""} /></label>
            <label>Status<select name="status" defaultValue={project.status}><option value="draft">Draft</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
            <label>Client / contract value<input name="contract_value" type="number" step="0.01" defaultValue={project.contract_value ?? ""} /></label>
            <label>Internal cost budget<input name="internal_cost_budget" type="number" step="0.01" defaultValue={project.internal_cost_budget ?? ""} /></label>
            <label>Funding received<input name="funding_received" type="number" step="0.01" defaultValue={summary?.funding_received ?? 0} /></label>
            <label>Confirmed expenditure<input name="confirmed_expenditure" type="number" step="0.01" defaultValue={summary?.confirmed_expenditure ?? 0} /></label>
            <label>Outstanding commitments<input name="outstanding_commitments" type="number" step="0.01" defaultValue={summary?.outstanding_commitments ?? 0} /></label>
            <label>Period start<input name="reporting_period_start" type="date" defaultValue={summary?.reporting_period_start ?? ""} /></label>
            <label>Period end<input name="reporting_period_end" type="date" defaultValue={summary?.reporting_period_end ?? ""} /></label>
            <label>Source / report<input name="source_label" defaultValue={summary?.source_label ?? ""} /></label>
            <label className="wide">Aliases<input name="aliases" defaultValue={(project.aliases ?? []).join(", ")} /></label>
            <label className="wide">Notes<textarea name="notes" rows={3} defaultValue={project.notes ?? ""} /></label>
            <button type="submit">Save Project Update</button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Info({ label, value, wide = false }: { label: string; value?: string | null; wide?: boolean }) { return <div className={wide ? "wide" : ""}><small>{label}</small><strong>{value || "—"}</strong></div>; }
function DataRow({ label, value, note }: { label: string; value: string; note?: string }) { return <div className="data-row"><div><b>{label}</b>{note && <small>{note}</small>}</div><strong>{value}</strong></div>; }
function Empty({ text }: { text: string }) { return <p className="empty-state">{text}</p>; }

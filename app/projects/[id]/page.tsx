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
    .select("id, company_id, project_code, name, project_type, location, site_address, status, start_date, end_date, aliases, contract_value, internal_cost_budget, description, notes, project_image_path, image_alt, progress_percent, external_reference, client:clients(name, contact_person, email, phone), summary:project_financial_summaries(funding_received, confirmed_expenditure, cash_balance, outstanding_commitments, funding_surplus_shortfall, commitments_approved, commitments_paid, reporting_period_start, reporting_period_end, source_label, original_budget, revised_budget, company_funding, other_financing, actual_paid_cost, committed_cost, forecast_cost_to_complete, forecast_final_cost, expected_contract_revenue, work_certified, invoiced_amount, paid_revenue, retention_held, forecast_profit, overhead_allocated), categories:project_cost_categories(category_name, amount, sort_order)")
    .eq("id", id)
    .single();
  if (error || !project) notFound();

  const [{ data: commitments }, { data: transactions }, { data: documents }, { data: budgetItems }, { data: variations }, { data: approvals }, { data: progressUpdates }, { data: assignments }] = await Promise.all([
    supabase.from("project_commitments").select("id, description, approved_amount, paid_amount, outstanding_amount, status").eq("project_id", id).order("created_at"),
    supabase.from("canonical_transactions").select("id, transaction_date, narration, counterparty, signed_amount, classification, category_name, status").eq("project_id", id).order("transaction_date", { ascending: false }).limit(20),
    supabase.from("source_documents").select("id, document_type, file_name, uploaded_at").eq("project_id", id).order("uploaded_at", { ascending: false }).limit(20),
    supabase.from("project_budget_items").select("id, cost_code, work_section, description, original_budget, revised_budget, committed_amount, actual_amount, forecast_remaining").eq("project_id", id).order("sort_order").limit(40),
    supabase.from("project_variations").select("id, variation_code, title, amount, status, variation_type").eq("project_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("approval_requests").select("id, request_type, description, amount, approved_amount, paid_amount, status, urgency, requested_at").eq("project_id", id).order("requested_at", { ascending: false }).limit(20),
    supabase.from("project_progress_updates").select("id, progress_percent, work_summary, cost_to_complete_override, update_date").eq("project_id", id).order("update_date", { ascending: false }).limit(8),
    supabase.from("project_assignments").select("id, assignment_role, membership:company_memberships(id, user_id)").eq("project_id", id),
  ]);

  const summary: any = Array.isArray((project as any).summary) ? (project as any).summary[0] : (project as any).summary;
  const client: any = Array.isArray((project as any).client) ? (project as any).client[0] : (project as any).client;
  const categories = [...(((project as any).categories ?? []) as any[])].sort((a, b) => a.sort_order - b.sort_order);
  const shortfall = Number(summary?.funding_surplus_shortfall ?? 0);
  const forecastProfit = Number(summary?.forecast_profit ?? 0);

  let imageUrl: string | null = null;
  if ((project as any).project_image_path) {
    const { data: signed } = await supabase.storage.from("project-media").createSignedUrl((project as any).project_image_path, 3600);
    imageUrl = signed?.signedUrl ?? null;
  }

  return (
    <main className="page-shell">
      <div className="page-wrap">
        <div className="page-actions">
          <Link href="/">← Dashboard</Link>
          <Link href="/projects">All Projects</Link>
          <Link href="/projects/new">+ New Project</Link>
          <Link href="/statements/upload">Upload Statements</Link>
        </div>

        <section className="project-profile-hero">
          <div className="project-cover">
            {imageUrl ? <img src={imageUrl} alt={(project as any).image_alt || project.name} /> : (
              <div className="project-cover-placeholder"><b>{project.project_code.split("-")[0]}</b><span>Add a project/site image below</span></div>
            )}
          </div>
          <div className="project-profile-copy">
            <span className="project-code">{project.project_code}</span>
            <h1>{project.name}</h1>
            <p>{client?.name ?? "No client"} · {project.location ?? "Location not set"}</p>
            {(project as any).description && <p style={{ marginTop: 7 }}>{(project as any).description}</p>}
            <div className="project-meta-pills">
              <span>{String(project.status).replaceAll("_", " ")}</span>
              {(project as any).project_type && <span>{(project as any).project_type}</span>}
              <span>{Number((project as any).progress_percent ?? 0).toFixed(0)}% progress</span>
              {summary?.reporting_period_end && <span>Accounts to {summary.reporting_period_end}</span>}
            </div>
            {query.saved === "1" && <span className="save-ok" style={{ marginTop: 9, width: "max-content" }}>Project saved successfully</span>}
          </div>
        </section>

        <section className="project-kpis">
          {[
            ["Funding Received", summary?.funding_received],
            ["Confirmed Expenditure", summary?.confirmed_expenditure],
            ["Cash Balance", summary?.cash_balance],
            ["Outstanding Commitments", summary?.outstanding_commitments],
            ["Revised Budget", summary?.revised_budget],
            ["Forecast Final Cost", summary?.forecast_final_cost],
            ["Forecast Profit", summary?.forecast_profit],
            ["Funding Position", summary?.funding_surplus_shortfall],
          ].map(([name, value]) => (
            <article className="compact-card" key={String(name)}>
              <small>{String(name)}</small>
              <strong className={(name === "Funding Position" && shortfall < 0) || (name === "Forecast Profit" && forecastProfit < 0) ? "negative" : ""}>{money(value as any)}</strong>
            </article>
          ))}
        </section>

        <section className="data-card">
          <div className="section-title"><small>Project information</small><h2>Project Profile</h2></div>
          <div className="identity-grid">
            <Info label="Client" value={client?.name} />
            <Info label="Client contact" value={client?.contact_person} />
            <Info label="Project type" value={(project as any).project_type} />
            <Info label="Location" value={project.location} />
            <Info label="Site address" value={(project as any).site_address} wide />
            <Info label="Start date" value={project.start_date} />
            <Info label="Expected end" value={project.end_date} />
            <Info label="External reference" value={(project as any).external_reference} />
            <Info label="Contract value" value={money(project.contract_value)} />
            <Info label="Internal cost budget" value={money(project.internal_cost_budget)} />
            <Info label="Known aliases / keywords" value={(project.aliases ?? []).join(", ") || "—"} wide />
            <Info label="Internal notes" value={project.notes || "—"} wide />
          </div>
        </section>

        <section className="project-two-col">
          <article className="data-card">
            <div className="section-title"><small>Budget & forecast</small><h2>Cost Control</h2></div>
            <DataRow label="Original budget" value={money(summary?.original_budget)} />
            <DataRow label="Revised budget" value={money(summary?.revised_budget)} />
            <DataRow label="Actual paid / confirmed cost" value={money(summary?.actual_paid_cost || summary?.confirmed_expenditure)} />
            <DataRow label="Committed cost" value={money(summary?.committed_cost || summary?.outstanding_commitments)} />
            <DataRow label="Forecast cost to complete" value={money(summary?.forecast_cost_to_complete)} />
            <DataRow label="Forecast final cost" value={money(summary?.forecast_final_cost)} />
            <DataRow label="Expected contract revenue" value={money(summary?.expected_contract_revenue || project.contract_value)} />
            <DataRow label="Forecast profit" value={money(summary?.forecast_profit)} />
          </article>
          <article className="data-card">
            <div className="section-title"><small>Client value / certification</small><h2>Revenue Position</h2></div>
            <DataRow label="Contract value" value={money(project.contract_value)} />
            <DataRow label="Work certified" value={money(summary?.work_certified)} />
            <DataRow label="Invoiced" value={money(summary?.invoiced_amount)} />
            <DataRow label="Paid revenue" value={money(summary?.paid_revenue)} />
            <DataRow label="Retention held" value={money(summary?.retention_held)} />
            <DataRow label="Company funding" value={money(summary?.company_funding)} />
            <DataRow label="Other financing" value={money(summary?.other_financing)} />
          </article>
        </section>

        <section className="project-two-col">
          <article className="data-card">
            <div className="section-title"><small>Cost breakdown</small><h2>Confirmed Expenditure by Work Category</h2></div>
            {categories.length ? categories.map((row: any) => <DataRow key={row.category_name} label={row.category_name} value={money(row.amount)} />) : <Empty text="No work-category expenditure has been classified yet." />}
          </article>
          <article className="data-card">
            <div className="section-title"><small>Commitments</small><h2>Outstanding Commitments</h2></div>
            {(commitments ?? []).length ? (commitments ?? []).map((row: any) => <DataRow key={row.id} label={row.description} value={money(row.outstanding_amount)} note={`${row.status} · approved ${money(row.approved_amount)} · paid ${money(row.paid_amount)}`} />) : <Empty text="No commitment breakdown recorded." />}
          </article>
        </section>

        <section className="project-two-col">
          <article className="data-card">
            <div className="section-title"><small>Budget detail</small><h2>Work Sections / BOQ Cost Control</h2></div>
            {(budgetItems ?? []).length ? (budgetItems ?? []).map((row: any) => <DataRow key={row.id} label={`${row.cost_code ? `${row.cost_code} · ` : ""}${row.work_section || row.description}`} value={money(row.revised_budget)} note={`Actual ${money(row.actual_amount)} · Committed ${money(row.committed_amount)} · Remaining ${money(row.forecast_remaining)}`} />) : <Empty text="No detailed budget/BOQ rows have been added yet. A project can still operate from summary budget and statement classifications." />}
          </article>
          <article className="data-card">
            <div className="section-title"><small>Variations</small><h2>Additions, Omissions & Changes</h2></div>
            {(variations ?? []).length ? (variations ?? []).map((row: any) => <DataRow key={row.id} label={`${row.variation_code || "Variation"} · ${row.title}`} value={money(row.amount)} note={`${String(row.variation_type).replaceAll("_", " ")} · ${String(row.status).replaceAll("_", " ")}`} />) : <Empty text="No variations recorded." />}
          </article>
        </section>

        <section className="project-two-col">
          <article className="data-card">
            <div className="section-title"><small>Approvals</small><h2>Requests & Decisions</h2></div>
            {(approvals ?? []).length ? (approvals ?? []).map((row: any) => <DataRow key={row.id} label={`${String(row.request_type).replaceAll("_", " ")} · ${row.description}`} value={money(row.amount)} note={`${row.status} · ${row.urgency}`} />) : <Empty text="No project approval requests yet." />}
          </article>
          <article className="data-card">
            <div className="section-title"><small>Progress</small><h2>Site / Cost-to-Complete Updates</h2></div>
            {(progressUpdates ?? []).length ? (progressUpdates ?? []).map((row: any) => <DataRow key={row.id} label={`${row.progress_percent}% · ${row.work_summary || "Progress update"}`} value={row.cost_to_complete_override == null ? "—" : money(row.cost_to_complete_override)} note={row.update_date} />) : <Empty text={`Current project progress is ${Number((project as any).progress_percent ?? 0).toFixed(0)}%. No separate progress update has been recorded yet.`} />}
          </article>
        </section>

        <section className="project-two-col">
          <article className="data-card">
            <div className="section-title"><small>Recent activity</small><h2>Confirmed Statement Transactions</h2></div>
            {(transactions ?? []).length ? (transactions ?? []).map((tx: any) => <DataRow key={tx.id} label={tx.narration || tx.counterparty || "Transaction"} value={money(tx.signed_amount)} note={`${tx.transaction_date} · ${String(tx.classification || "unclassified").replaceAll("_", " ")}${tx.category_name ? ` · ${tx.category_name}` : ""}`} />) : <Empty text="No statement transaction has been confirmed against this project yet." />}
          </article>
          <article className="data-card">
            <div className="section-title"><small>Evidence & access</small><h2>Documents & Team</h2></div>
            <div className="activity-grid">
              <div><small>Attached documents</small><strong>{(documents ?? []).length}</strong></div>
              <div><small>Assigned team members</small><strong>{(assignments ?? []).length}</strong></div>
            </div>
            {(documents ?? []).slice(0,5).map((doc: any) => <DataRow key={doc.id} label={doc.file_name} value={String(doc.document_type).replaceAll("_", " ")} note={new Date(doc.uploaded_at).toLocaleDateString("en-NG")} />)}
            <div className="inline-links"><Link href="/statements">Statement history →</Link><Link href="/statements/upload">Upload statements →</Link></div>
          </article>
        </section>

        <section className="data-card update-card">
          <div className="section-title"><small>Update project</small><h2>Project Information & Financial Baseline</h2><p>Changes here are recorded in the audit trail. Confirmed statement transactions remain separate so the original financial evidence is preserved.</p></div>
          <form action={updateProject} encType="multipart/form-data" className="project-form">
            <input type="hidden" name="project_id" value={project.id} />
            <div className="project-info-heading">Project information</div>
            <label>Project name<input name="name" defaultValue={project.name} required /></label>
            <label>Project type<input name="project_type" defaultValue={(project as any).project_type ?? ""} /></label>
            <label>Location<input name="location" defaultValue={project.location ?? ""} /></label>
            <label>Site address<input name="site_address" defaultValue={(project as any).site_address ?? ""} /></label>
            <label>Status<select name="status" defaultValue={project.status}><option value="draft">Draft</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
            <label>Progress %<input name="progress_percent" type="number" min="0" max="100" step="0.1" defaultValue={(project as any).progress_percent ?? 0} /></label>
            <label>Start date<input name="start_date" type="date" defaultValue={project.start_date ?? ""} /></label>
            <label>Expected end date<input name="end_date" type="date" defaultValue={project.end_date ?? ""} /></label>
            <label>External reference<input name="external_reference" defaultValue={(project as any).external_reference ?? ""} /></label>
            <label className="wide project-image-field">Replace / add project image<input name="project_image" type="file" accept="image/jpeg,image/png,image/webp" /><small>JPG, PNG or WEBP · max 10 MB</small></label>
            <label className="wide">Image description<input name="image_alt" defaultValue={(project as any).image_alt ?? project.name} /></label>
            <label className="wide">Project description<textarea name="description" rows={3} defaultValue={(project as any).description ?? ""} /></label>
            <label className="wide">Aliases / keywords<input name="aliases" defaultValue={(project.aliases ?? []).join(", ")} /></label>
            <label className="wide">Internal notes<textarea name="notes" rows={3} defaultValue={project.notes ?? ""} /></label>

            <div className="project-info-heading">Commercial, cost & funding baseline</div>
            <label>Contract value<input name="contract_value" type="number" step="0.01" defaultValue={project.contract_value ?? ""} /></label>
            <label>Internal cost budget<input name="internal_cost_budget" type="number" step="0.01" defaultValue={project.internal_cost_budget ?? ""} /></label>
            <label>Original budget<input name="original_budget" type="number" step="0.01" defaultValue={summary?.original_budget ?? 0} /></label>
            <label>Revised budget<input name="revised_budget" type="number" step="0.01" defaultValue={summary?.revised_budget ?? 0} /></label>
            <label>Funding received<input name="funding_received" type="number" step="0.01" defaultValue={summary?.funding_received ?? 0} /></label>
            <label>Confirmed expenditure<input name="confirmed_expenditure" type="number" step="0.01" defaultValue={summary?.confirmed_expenditure ?? 0} /></label>
            <label>Outstanding commitments<input name="outstanding_commitments" type="number" step="0.01" defaultValue={summary?.outstanding_commitments ?? 0} /></label>
            <label>Forecast cost to complete<input name="forecast_cost_to_complete" type="number" step="0.01" defaultValue={summary?.forecast_cost_to_complete ?? 0} /></label>
            <label>Expected contract revenue<input name="expected_contract_revenue" type="number" step="0.01" defaultValue={summary?.expected_contract_revenue ?? project.contract_value ?? 0} /></label>
            <label>Work certified<input name="work_certified" type="number" step="0.01" defaultValue={summary?.work_certified ?? 0} /></label>
            <label>Invoiced amount<input name="invoiced_amount" type="number" step="0.01" defaultValue={summary?.invoiced_amount ?? 0} /></label>
            <label>Paid revenue<input name="paid_revenue" type="number" step="0.01" defaultValue={summary?.paid_revenue ?? 0} /></label>
            <label>Retention held<input name="retention_held" type="number" step="0.01" defaultValue={summary?.retention_held ?? 0} /></label>
            <label>Overhead allocated<input name="overhead_allocated" type="number" step="0.01" defaultValue={summary?.overhead_allocated ?? 0} /></label>
            <label>Period start<input name="reporting_period_start" type="date" defaultValue={summary?.reporting_period_start ?? ""} /></label>
            <label>Period end<input name="reporting_period_end" type="date" defaultValue={summary?.reporting_period_end ?? ""} /></label>
            <label className="wide">Source / report<input name="source_label" defaultValue={summary?.source_label ?? ""} /></label>
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

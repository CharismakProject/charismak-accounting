import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { defaultBranding, resolveBrandingAssets } from "../../../../lib/company-branding";
import PrintReportButton from "../../PrintReportButton";

const money = (value: unknown) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value ?? 0));
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—";

export default async function ProjectReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient(); const { data: auth } = await supabase.auth.getUser(); if (!auth.user) redirect("/login");
  const { data: project, error } = await supabase.from("projects").select("id,company_id,project_code,name,location,status,start_date,end_date,progress_percent,contract_value,client:clients(name),company:companies(name),summary:project_financial_summaries(funding_received,confirmed_expenditure,cash_balance,outstanding_commitments,funding_surplus_shortfall,forecast_cost_to_complete,forecast_final_cost,forecast_profit,work_certified,invoiced_amount,paid_revenue,retention_held,reporting_period_start,reporting_period_end),categories:project_cost_categories(category_name,amount,sort_order)").eq("id", id).single();
  if (error || !project) notFound();
  const [{ data: commercial }, { data: commitments }, { data: brandingRow }] = await Promise.all([
    supabase.from("project_commercial_positions").select("base_scope,additional_scope,variations,identified_commercial_value,documented_client_invoices,approved_commercial_value,documents_needing_review").eq("project_id", id).maybeSingle(),
    supabase.from("project_commitments").select("id,description,approved_amount,paid_amount,outstanding_amount,status").eq("project_id", id).order("created_at"),
    supabase.from("company_branding").select("*").eq("company_id", project.company_id).maybeSingle(),
  ]);
  const company: any = Array.isArray((project as any).company) ? (project as any).company[0] : (project as any).company;
  const client: any = Array.isArray((project as any).client) ? (project as any).client[0] : (project as any).client;
  const summary: any = Array.isArray((project as any).summary) ? (project as any).summary[0] : (project as any).summary;
  const categories = [...(((project as any).categories ?? []) as any[])].sort((a, b) => a.sort_order - b.sort_order);
  const branding = brandingRow ?? defaultBranding(project.company_id, company?.name ?? "Company"); const assets = await resolveBrandingAssets(supabase, branding);
  const contact = [branding.address, branding.phone, branding.email, branding.website].filter(Boolean).join(" · ");
  const registrations = [["RC", branding.rc_number], ["TIN", branding.tax_number]].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join(" · ");
  return <main className="report-screen"><div className="report-actions"><Link href="/reports">← All reports</Link><Link href={`/projects/${id}`}>Open project</Link><PrintReportButton /></div>
    <article className="company-report" style={{ "--report-primary": branding.primary_color, "--report-secondary": branding.secondary_color } as CSSProperties}>
      {assets.letterheadHeader ? <img className="report-letterhead-header" src={assets.letterheadHeader} alt="" /> : <header className="report-company-header">{assets.logo ? <img src={assets.logo} alt={`${branding.display_name} logo`} /> : null}<div><h1>{branding.display_name}</h1>{branding.legal_name && branding.legal_name !== branding.display_name && <p>{branding.legal_name}</p>}<span>{[contact, registrations].filter(Boolean).join(" | ")}</span></div></header>}
      <div className="report-brand-rule" />
      <section className="report-title"><div><small>PROJECT FINANCIAL REPORT</small><h2>{project.name}</h2><p>{project.project_code} · {client?.name ?? "No client recorded"} · {project.location ?? "Location not recorded"}</p></div><dl><dt>Reporting period</dt><dd>{summary?.reporting_period_start ? `${date(summary.reporting_period_start)} – ${date(summary.reporting_period_end)}` : `As at ${date(new Date().toISOString())}`}</dd><dt>Project progress</dt><dd>{Number(project.progress_percent ?? 0).toFixed(0)}%</dd></dl></section>
      <section className="report-kpis"><Kpi label="Current commercial value" value={money(commercial?.identified_commercial_value || project.contract_value)} /><Kpi label="Funding received" value={money(summary?.funding_received)} /><Kpi label="Confirmed expenditure" value={money(summary?.confirmed_expenditure)} /><Kpi label="Cash balance" value={money(summary?.cash_balance)} /><Kpi label="Outstanding commitments" value={money(summary?.outstanding_commitments)} /><Kpi label="Forecast profit" value={money(summary?.forecast_profit)} /></section>
      <section className="report-columns"><ReportSection title="Commercial breakdown"><Row label="Original / base scope" value={money(commercial?.base_scope || project.contract_value)} /><Row label="Additional / new scope" value={money(commercial?.additional_scope)} /><Row label="Variations" value={money(commercial?.variations)} /><Row label="Current identified value" value={money(commercial?.identified_commercial_value || project.contract_value)} strong /><Row label="Approved revised value" value={money(commercial?.approved_commercial_value)} /><Row label="Client invoices documented" value={money(commercial?.documented_client_invoices)} /></ReportSection><ReportSection title="Funding & forecast"><Row label="Money received for project" value={money(summary?.funding_received)} /><Row label="Confirmed project spend" value={money(summary?.confirmed_expenditure)} /><Row label="Still agreed / unpaid" value={money(summary?.outstanding_commitments)} /><Row label="Current cash position" value={money(summary?.cash_balance)} strong /><Row label="Forecast cost to complete" value={money(summary?.forecast_cost_to_complete)} /><Row label="Forecast final cost" value={money(summary?.forecast_final_cost)} /></ReportSection></section>
      <section className="report-table-section"><h3>Confirmed expenditure by work category</h3><table><thead><tr><th>Work category</th><th>Amount</th></tr></thead><tbody>{categories.length ? categories.map((row: any) => <tr key={row.category_name}><td>{row.category_name}</td><td>{money(row.amount)}</td></tr>) : <tr><td colSpan={2}>No work categories have been confirmed.</td></tr>}</tbody></table></section>
      <section className="report-table-section"><h3>Commitments and amounts still to pay</h3><table><thead><tr><th>Description</th><th>Approved</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>{(commitments ?? []).length ? (commitments ?? []).map((row: any) => <tr key={row.id}><td>{row.description}</td><td>{money(row.approved_amount)}</td><td>{money(row.paid_amount)}</td><td>{money(row.outstanding_amount)}</td><td>{String(row.status).replaceAll("_", " ")}</td></tr>) : <tr><td colSpan={5}>No commitments recorded.</td></tr>}</tbody></table></section>
      <section className="report-notes"><p><b>Project status:</b> {String(project.status).replaceAll("_", " ")}</p><p><b>Documents requiring confirmation:</b> {commercial?.documents_needing_review ?? 0}</p><p><b>Generated:</b> {new Intl.DateTimeFormat("en-NG", { dateStyle: "long", timeStyle: "short" }).format(new Date())}</p></section>
      {assets.letterheadFooter ? <img className="report-letterhead-footer" src={assets.letterheadFooter} alt="" /> : <footer>{branding.report_footer || contact || branding.legal_name || branding.display_name}</footer>}
    </article>
  </main>;
}

function Kpi({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><b>{value}</b></div>; }
function ReportSection({ title, children }: { title: string; children: ReactNode }) { return <section className="report-section"><h3>{title}</h3>{children}</section>; }
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={strong ? "report-row strong" : "report-row"}><span>{label}</span><b>{value}</b></div>; }

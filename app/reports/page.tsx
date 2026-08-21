import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

const money = (value: unknown) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value ?? 0));

export default async function ReportsPage() {
  const supabase = await createClient(); const { data: auth } = await supabase.auth.getUser(); if (!auth.user) redirect("/login");
  const { data: projects, error } = await supabase.from("projects").select("id,project_code,name,status,client:clients(name),summary:project_financial_summaries(funding_received,confirmed_expenditure,forecast_profit)").neq("status", "archived").order("name");
  if (error) throw new Error(error.message);
  return <main className="reports-index"><div className="reports-index-wrap"><div className="reports-toolbar"><Link href="/">← Home</Link><Link href="/reports/accounting">Company Financial Statements</Link><Link href="/company/branding">Company Branding</Link></div><header><small>REPORTS</small><h1>Company accounts + project reports</h1><p>Open the company financial statements for Trial Balance, Profit & Loss, Balance Sheet, Cash Flow and General Ledger, or choose a project for a branded project report.</p></header><section className="report-project-grid"><article><span>COMPANY</span><h2>Financial Statements</h2><p>Double-entry company books across all projects and company overheads.</p><div><small>Includes</small><b>TB · P&amp;L · BS</b></div><div><small>Also</small><b>Cash Flow · GL</b></div><Link href="/reports/accounting">Open financial statements →</Link></article>{(projects ?? []).map((row: any) => { const summary = Array.isArray(row.summary) ? row.summary[0] : row.summary; const client = Array.isArray(row.client) ? row.client[0] : row.client; return <article key={row.id}><span>{row.project_code}</span><h2>{row.name}</h2><p>{client?.name ?? "No client"} · {String(row.status).replaceAll("_", " ")}</p><div><small>Funding</small><b>{money(summary?.funding_received)}</b></div><div><small>Expenditure</small><b>{money(summary?.confirmed_expenditure)}</b></div><Link href={`/reports/projects/${row.id}`}>Open branded report →</Link></article>; })}</section></div></main>;
}

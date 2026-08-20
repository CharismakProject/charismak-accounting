import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

const money = (value: unknown) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value ?? 0));

export default async function ReportsPage() {
  const supabase = await createClient(); const { data: auth } = await supabase.auth.getUser(); if (!auth.user) redirect("/login");
  const { data: projects, error } = await supabase.from("projects").select("id,project_code,name,status,client:clients(name),summary:project_financial_summaries(funding_received,confirmed_expenditure,forecast_profit)").neq("status", "archived").order("name");
  if (error) throw new Error(error.message);
  return <main className="reports-index"><div className="reports-index-wrap"><div className="reports-toolbar"><Link href="/">← Home</Link><Link href="/company/branding">Company Branding</Link></div><header><small>REPORTS</small><h1>Send professional reports in your own name</h1><p>Choose any project you can access. The generated report uses your company logo, letterhead, colours and contact details.</p></header><section className="report-project-grid">{(projects ?? []).map((row: any) => { const summary = Array.isArray(row.summary) ? row.summary[0] : row.summary; const client = Array.isArray(row.client) ? row.client[0] : row.client; return <article key={row.id}><span>{row.project_code}</span><h2>{row.name}</h2><p>{client?.name ?? "No client"} · {String(row.status).replaceAll("_", " ")}</p><div><small>Funding</small><b>{money(summary?.funding_received)}</b></div><div><small>Expenditure</small><b>{money(summary?.confirmed_expenditure)}</b></div><Link href={`/reports/projects/${row.id}`}>Open branded report →</Link></article>; })}</section></div></main>;
}

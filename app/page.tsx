import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";

const LOGO_URL = "https://raw.githubusercontent.com/CharismakProject/charismak-website/main/public/branding/charismak-logo.png";
const money = (value: number | string | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value));

export default async function Home() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: membership } = await supabase.from("company_memberships").select("id, company_id, is_owner, status").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) {
    await supabase.auth.signOut();
    redirect("/login?message=Please+sign+in+with+your+company+account");
  }

  const { data: company } = await supabase.from("companies").select("name").eq("id", membership.company_id).maybeSingle();
  const { data: positionRows } = await supabase.from("membership_positions").select("is_primary, position_id").eq("membership_id", membership.id);
  const positionId = positionRows?.find((row) => row.is_primary)?.position_id ?? positionRows?.[0]?.position_id ?? null;
  let roleName = membership.is_owner ? "MD / Owner" : "Member";
  if (positionId) {
    const { data: position } = await supabase.from("positions").select("name").eq("id", positionId).maybeSingle();
    if (position?.name) roleName = position.name;
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id, project_code, name, location, status, summary:project_financial_summaries(funding_received, confirmed_expenditure, cash_balance, outstanding_commitments, funding_surplus_shortfall)")
    .eq("company_id", membership.company_id)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  const { count: statementCount } = await supabase.from("statement_imports").select("id", { count: "exact", head: true }).eq("company_id", membership.company_id);
  const { count: transactionCount } = await supabase.from("canonical_transactions").select("id", { count: "exact", head: true }).eq("company_id", membership.company_id);

  const rows = (projects ?? []).map((project: any) => ({ ...project, summary: Array.isArray(project.summary) ? project.summary[0] : project.summary }));
  const totals = rows.reduce((acc, project) => {
    acc.funding += Number(project.summary?.funding_received ?? 0);
    acc.expenditure += Number(project.summary?.confirmed_expenditure ?? 0);
    acc.cash += Number(project.summary?.cash_balance ?? 0);
    acc.commitments += Number(project.summary?.outstanding_commitments ?? 0);
    return acc;
  }, { funding: 0, expenditure: 0, cash: 0, commitments: 0 });

  return (
    <main className="md-shell">
      <aside className="md-sidebar">
        <div className="md-brand">
          <img src={LOGO_URL} alt="Charismak" />
          <div><b>ACCOUNTING</b><span>{company?.name ?? "Company"}</span></div>
        </div>
        <div className="md-user"><small>SIGNED IN AS</small><b>{roleName}</b><span>{user.email}</span></div>
        <nav className="md-nav">
          <Link href="/" className="active">Executive</Link>
          <Link href="/projects">Projects</Link>
          <Link href="/statements">Transactions & Statements</Link>
          <Link href="/statements/upload">Upload Statement</Link>
          <Link href="/login">Switch account / Sign in</Link>
        </nav>
        <div style={{ marginTop: "auto", fontSize: 9, opacity: .75 }}>✓ Track the truth<br/>Every movement. Every project.</div>
      </aside>

      <section className="md-main">
        <nav className="mobile-nav">
          <Link href="/">Executive</Link><Link href="/projects">Projects</Link><Link href="/statements">Transactions</Link><Link href="/statements/upload">Upload</Link>
        </nav>
        <header className="md-header">
          <p>Live executive overview</p>
          <h1>Company Control Room</h1>
          <span>Only data currently stored in Charismak Accounting is shown here.</span>
        </header>

        <div className="md-content">
          <section className="md-kpis">
            <Kpi label="Project funding" value={money(totals.funding)} note={`${rows.length} project(s)`} />
            <Kpi label="Confirmed expenditure" value={money(totals.expenditure)} note="Stored project records" />
            <Kpi label="Project cash balance" value={money(totals.cash)} note="Funding less expenditure" />
            <Kpi label="Outstanding commitments" value={money(totals.commitments)} note="Recorded commitments" />
          </section>

          <section className="md-grid">
            <article className="md-panel">
              <div className="md-panel-head"><div><small>Projects</small><h2>Live Project Accounts</h2></div><Link href="/projects" className="md-button">Open projects</Link></div>
              {rows.length === 0 ? <p style={{ fontSize: 11, color: "#7c8b99" }}>No projects yet.</p> : rows.map((project: any) => (
                <Link className="md-project-row" href={`/projects/${project.id}`} key={project.id}>
                  <div><b>{project.project_code} · {project.name}</b><small>{project.location ?? "No location"}</small></div>
                  <Metric label="Funding" value={money(project.summary?.funding_received)} />
                  <div className="mobile-hide"><Metric label="Spent" value={money(project.summary?.confirmed_expenditure)} /></div>
                  <div className="desktop-extra"><Metric label="Commitments" value={money(project.summary?.outstanding_commitments)} /></div>
                  <div className="desktop-extra"><Metric label="Position" value={money(project.summary?.funding_surplus_shortfall)} /></div>
                </Link>
              ))}
            </article>

            <article className="md-panel">
              <div className="md-panel-head"><div><small>System activity</small><h2>What is actually in the app</h2></div></div>
              <Stat label="Statement imports" value={String(statementCount ?? 0)} />
              <Stat label="Canonical transactions" value={String(transactionCount ?? 0)} />
              <Stat label="Projects" value={String(rows.length)} />
              <Link href="/statements/upload" className="md-button" style={{ display: "block", textAlign: "center", marginTop: 10 }}>Upload bank statement</Link>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="md-kpi"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="md-metric"><span>{label}</span><strong>{value}</strong></div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="md-stat"><span>{label}</span><b>{value}</b></div>;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";

const LOGO_URL = "https://raw.githubusercontent.com/CharismakProject/charismak-website/main/public/branding/charismak-logo.png";

const money = (value: number | string | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value));

export default async function Home() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("id, company_id, is_owner, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    await supabase.auth.signOut();
    redirect("/login?message=Please+sign+in+with+your+company+account");
  }

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", membership.company_id)
    .maybeSingle();

  const { data: positionRows } = await supabase
    .from("membership_positions")
    .select("is_primary, position_id")
    .eq("membership_id", membership.id);

  const primaryPositionId = positionRows?.find((row) => row.is_primary)?.position_id ?? positionRows?.[0]?.position_id ?? null;
  let roleName = membership.is_owner ? "MD / Owner" : "Member";
  if (primaryPositionId) {
    const { data: position } = await supabase
      .from("positions")
      .select("name")
      .eq("id", primaryPositionId)
      .maybeSingle();
    if (position?.name) roleName = position.name;
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id, project_code, name, location, status, summary:project_financial_summaries(funding_received, confirmed_expenditure, cash_balance, outstanding_commitments, funding_surplus_shortfall, reporting_period_end)")
    .eq("company_id", membership.company_id)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  const { count: statementCount } = await supabase
    .from("statement_imports")
    .select("id", { count: "exact", head: true })
    .eq("company_id", membership.company_id);

  const { count: transactionCount } = await supabase
    .from("canonical_transactions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", membership.company_id);

  const rows = (projects ?? []).map((project: any) => ({
    ...project,
    summary: Array.isArray(project.summary) ? project.summary[0] : project.summary,
  }));

  const totals = rows.reduce(
    (acc, project) => {
      const s = project.summary;
      acc.funding += Number(s?.funding_received ?? 0);
      acc.expenditure += Number(s?.confirmed_expenditure ?? 0);
      acc.cash += Number(s?.cash_balance ?? 0);
      acc.commitments += Number(s?.outstanding_commitments ?? 0);
      return acc;
    },
    { funding: 0, expenditure: 0, cash: 0, commitments: 0 },
  );

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", color: "#102942" }}>
      <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", minHeight: "100vh" }}>
        <aside style={{ background: "#082945", color: "white", padding: "18px 14px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,.12)" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "white", position: "relative", display: "grid", placeItems: "center" }}>
              <img src={LOGO_URL} alt="Charismak" style={{ width: 43, height: 43, objectFit: "contain" }} />
              <b style={{ position: "absolute", right: -2, bottom: -2, width: 18, height: 18, borderRadius: "50%", background: "#1f6fe5", color: "white", fontSize: 10, display: "grid", placeItems: "center", border: "2px solid white" }}>A</b>
            </div>
            <div><b style={{ fontSize: 13 }}>ACCOUNTING</b><small style={{ display: "block", opacity: .65, marginTop: 3 }}>{company?.name ?? "Company"}</small></div>
          </div>

          <div style={{ background: "#145dab", borderRadius: 12, padding: 12 }}>
            <small style={{ opacity: .75 }}>SIGNED IN AS</small>
            <b style={{ display: "block", marginTop: 5 }}>{roleName}</b>
            <span style={{ display: "block", fontSize: 11, opacity: .75, marginTop: 3 }}>{user.email}</span>
          </div>

          <nav style={{ display: "grid", gap: 5 }}>
            <Link href="/" style={activeNav}>Executive</Link>
            <Link href="/projects" style={nav}>Projects</Link>
            <Link href="/statements" style={nav}>Transactions & Statements</Link>
            <Link href="/statements/upload" style={nav}>Upload Statement</Link>
            <Link href="/login" style={nav}>Switch account / Sign in</Link>
          </nav>

          <div style={{ marginTop: "auto", fontSize: 10, opacity: .78 }}><b>✓ Track the truth</b><span style={{ display: "block" }}>Every movement. Every project.</span></div>
        </aside>

        <section>
          <header style={{ background: "white", borderBottom: "1px solid #dfe7ee", padding: "22px 28px" }}>
            <small style={{ color: "#1f6fe5", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".12em" }}>Live Executive Overview</small>
            <h1 style={{ margin: "5px 0", fontSize: 30 }}>Company Control Room</h1>
            <p style={{ margin: 0, color: "#738397" }}>Only data currently stored in Charismak Accounting is shown here.</p>
          </header>

          <div style={{ padding: 22, display: "grid", gap: 16 }}>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
              <Kpi label="Project funding recorded" value={money(totals.funding)} note={`${rows.length} active/draft project(s)`} />
              <Kpi label="Confirmed project expenditure" value={money(totals.expenditure)} note="From stored project records" />
              <Kpi label="Current project cash balance" value={money(totals.cash)} note="Funding less confirmed expenditure" />
              <Kpi label="Outstanding commitments" value={money(totals.commitments)} note="Recorded commitments" />
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "1.4fr .6fr", gap: 14 }}>
              <article style={panel}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div><small style={eyebrow}>Projects</small><h2 style={{ margin: "4px 0" }}>Live Project Accounts</h2></div>
                  <Link href="/projects" style={linkButton}>Open Projects</Link>
                </div>
                {rows.length === 0 ? <p style={{ color: "#748597" }}>No projects yet.</p> : rows.map((project: any) => (
                  <Link href={`/projects/${project.id}`} key={project.id} style={{ textDecoration: "none", color: "inherit", display: "grid", gridTemplateColumns: "1.4fr repeat(4,.8fr)", gap: 10, padding: "12px 0", borderBottom: "1px solid #edf1f4", alignItems: "center" }}>
                    <div><b>{project.project_code} · {project.name}</b><small style={{ display: "block", color: "#8493a2", marginTop: 3 }}>{project.location ?? "No location"}</small></div>
                    <Metric label="Funding" value={money(project.summary?.funding_received)} />
                    <Metric label="Spent" value={money(project.summary?.confirmed_expenditure)} />
                    <Metric label="Commitments" value={money(project.summary?.outstanding_commitments)} />
                    <Metric label="Position" value={money(project.summary?.funding_surplus_shortfall)} />
                  </Link>
                ))}
              </article>

              <article style={panel}>
                <small style={eyebrow}>System Activity</small>
                <h2 style={{ margin: "4px 0 16px" }}>What is actually in the app</h2>
                <div style={{ display: "grid", gap: 10 }}>
                  <Stat label="Statement imports" value={String(statementCount ?? 0)} />
                  <Stat label="Canonical transactions" value={String(transactionCount ?? 0)} />
                  <Stat label="Projects" value={String(rows.length)} />
                </div>
                <Link href="/statements/upload" style={{ ...linkButton, display: "block", textAlign: "center", marginTop: 16 }}>Upload a Bank Statement</Link>
              </article>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return <article style={panel}><small style={{ color: "#7b8b9a" }}>{label}</small><strong style={{ display: "block", fontSize: 23, margin: "8px 0 4px" }}>{value}</strong><span style={{ color: "#8a99a8", fontSize: 11 }}>{note}</span></article>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><small style={{ color: "#8795a3" }}>{label}</small><b style={{ display: "block", marginTop: 3 }}>{value}</b></div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #edf1f4" }}><span>{label}</span><b>{value}</b></div>;
}

const panel = { background: "white", border: "1px solid #dde6ee", borderRadius: 15, padding: 17 } as const;
const eyebrow = { color: "#6f8090", fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: ".11em" };
const nav = { color: "#dce8f3", textDecoration: "none", padding: "10px 11px", borderRadius: 8, fontWeight: 700 } as const;
const activeNav = { ...nav, color: "#082945", background: "white" } as const;
const linkButton = { color: "white", background: "#0b4f82", padding: "9px 12px", borderRadius: 9, textDecoration: "none", fontWeight: 800, fontSize: 12 } as const;

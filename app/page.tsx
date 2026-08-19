"use client";

import { useMemo, useState } from "react";

type RoleKey = "md" | "finance" | "director" | "manager";

const roles: Record<RoleKey, { label: string; short: string; accent: string; eyebrow: string; title: string; subtitle: string; nav: string[] }> = {
  md: {
    label: "MD / Owner",
    short: "MD",
    accent: "blue",
    eyebrow: "Executive Overview",
    title: "Company Control Room",
    subtitle: "Financial position, portfolio risk, profitability and decisions that need your attention.",
    nav: ["Executive", "Projects", "Treasury", "Approvals", "Reports", "Company"],
  },
  finance: {
    label: "Accountant / CFO",
    short: "CFO",
    accent: "green",
    eyebrow: "Finance Operations",
    title: "Finance Operations Hub",
    subtitle: "Transactions, treasury, reconciliation, payments, evidence and financial control.",
    nav: ["Finance Home", "Transaction Inbox", "Banking", "Reconciliation", "Payments", "Imprest", "Reports"],
  },
  director: {
    label: "Project Director",
    short: "PD",
    accent: "purple",
    eyebrow: "Project Portfolio",
    title: "Portfolio & Cost Control",
    subtitle: "Compare projects, forecast margins, commitments, funding gaps and delivery risk.",
    nav: ["Portfolio", "Cost Control", "Commitments", "Variations", "Approvals", "Reports"],
  },
  manager: {
    label: "Project / Construction Manager",
    short: "PM",
    accent: "orange",
    eyebrow: "Site & Project Control",
    title: "Jahi Residential",
    subtitle: "Your site financial workspace for requests, spending, imprest, evidence and progress.",
    nav: ["My Project", "Site Activities", "Expenses", "Requests", "Imprest", "Materials", "Reports"],
  },
};

const kpi = (title: string, value: string, meta: string) => (
  <article className="kpi" key={title}>
    <span>{title}</span>
    <strong>{value}</strong>
    <small>{meta}</small>
  </article>
);

function LineChart({ tone = "blue" }: { tone?: string }) {
  return (
    <div className={`chart ${tone}`}>
      <svg viewBox="0 0 700 220" preserveAspectRatio="none" aria-hidden="true">
        <path className="chart-main" d="M20 190 C80 180 100 140 160 150 S250 110 310 120 S400 78 465 90 S565 48 680 60" />
        <path className="chart-alt" d="M20 205 C90 195 120 170 175 178 S270 145 330 151 S425 123 485 132 S585 95 680 105" />
      </svg>
    </div>
  );
}

function MDView() {
  return (
    <>
      <section className="kpi-grid five">
        {kpi("Total cash", "₦245.6m", "↑ 12.5% vs Apr")}
        {kpi("Project cash position", "₦512.8m", "↑ 8.7% vs Apr")}
        {kpi("Outstanding receivables", "₦328.2m", "↓ 4.3% vs Apr")}
        {kpi("Outstanding commitments", "₦267.5m", "₦71.4m due soon")}
        {kpi("Forecast profit", "₦183.4m", "↑ 15.8% vs Apr")}
      </section>
      <section className="split wide">
        <article className="panel"><header><small>Company</small><h2>Cash Flow Overview</h2></header><LineChart tone="blue" /></article>
        <article className="panel"><header><small>Portfolio</small><h2>Project Profitability</h2></header><div className="donut-wrap"><div className="donut blue"><div><strong>72%</strong><span>healthy margin</span></div></div><div className="legend"><b>3</b> High margin<br/><b>3</b> Medium<br/><b>1</b> Low<br/><b>1</b> Loss</div></div></article>
      </section>
      <section className="split">
        <article className="panel"><header><small>Decisions</small><h2>Projects Requiring Attention</h2></header>{[["Jahi Residence","Funding shortfall","₦10.45m","High"],["Victoria Island Towers","Budget exceeded","₦24.75m","High"],["Lekki Phase 1","Client payment overdue","₦38.20m","Medium"]].map(([a,b,c,d])=><div className="list-row" key={a}><div><b>{a}</b><span>{b}</span></div><strong>{c}</strong><i className={d==="High"?"pill bad":"pill warn"}>{d}</i></div>)}</article>
        <article className="panel"><header><small>Portfolio</small><h2>Funding vs Expenditure</h2></header><LineChart tone="blue" /></article>
      </section>
    </>
  );
}

function FinanceView() {
  return (
    <>
      <section className="hero green"><div><small>Today's workload</small><h2>12 finance actions need attention</h2><p>Clear transactions, reconcile accounts and process approved payments.</p></div><div className="hero-actions"><button>Upload statement</button><button>Prepare payment</button></div></section>
      <section className="kpi-grid four finance-kpis">
        {kpi("Unclassified transactions", "37", "13 added today")}
        {kpi("Payments in queue", "₦6.2m", "8 approved requests")}
        {kpi("Receipts to record", "4", "₦2.8m total")}
        {kpi("Overdue imprest", "₦1.14m", "3 holders overdue")}
      </section>
      <section className="split wide">
        <article className="panel"><header><small>Transaction Inbox</small><h2>Needs Classification</h2></header>{[["19 Aug","JAHI-01 TILING ADV","Jahi → Tiling → Labour","₦850k","97%"],["19 Aug","TRANSFER FROM VIIBISTRONG","Jahi → Project funding","₦500k","88%"],["18 Aug","PERSONAL SUPPORT","Personal / non-business","₦150k","91%"],["18 Aug","ACCESS-OPAY TRANSFER","Internal transfer","₦320k","99%"]].map(r=><div className="transaction-row" key={r[1]}><span>{r[0]}</span><div><b>{r[1]}</b><small>{r[2]}</small></div><strong>{r[3]}</strong><i className="pill ok">{r[4]}</i><button>Confirm</button></div>)}</article>
        <article className="panel"><header><small>Treasury</small><h2>Cash Position by Account</h2></header>{[["Zenith Bank","₦98.5m",92],["Access Bank","₦76.2m",74],["GTBank","₦45.3m",48],["Cash on Hand","₦25.6m",26]].map(([a,b,c])=><div className="bar-item" key={String(a)}><div><span>{a}</span><b>{b}</b></div><div className="track"><i style={{width:`${c}%`}} /></div></div>)}<div className="callout"><b>4 accounts need reconciliation</b><span>Oldest period: 3 days</span></div></article>
      </section>
    </>
  );
}

function DirectorView() {
  return (
    <>
      <section className="kpi-grid four director-kpis">
        {kpi("Projects under supervision", "6", "2 need intervention")}
        {kpi("Budget used", "68%", "Progress weighted at 64%")}
        {kpi("Forecast margin", "11.6%", "+0.8% this month")}
        {kpi("Pending requests", "14", "₦18.6m value")}
      </section>
      <section className="split wide">
        <article className="panel"><header><small>Portfolio Health</small><h2>Project Performance</h2></header>{[["Jahi Residence",72,"11.8%","Funding watch","warn"],["Gwarimpa Fit-out",81,"14.2%","On track","ok"],["Kano Workshop",66,"6.3%","Cost risk","bad"],["Maitama Residence",54,"16.5%","On track","ok"]].map(([a,b,c,d,e])=><div className="project-row" key={String(a)}><div><b>{a}</b><span>Project portfolio</span></div><div className="progress"><i style={{width:`${b}%`}} /></div><strong>{b}%</strong><em>{c}</em><span className={`pill ${e}`}>{d}</span></div>)}</article>
        <article className="panel"><header><small>Cost Control</small><h2>Portfolio Risk Map</h2></header><div className="risk-grid"><div className="ok"><b>2</b><span>Healthy</span></div><div className="warn"><b>2</b><span>Monitor</span></div><div className="bad"><b>2</b><span>Intervene</span></div></div><div className="callout"><b>Largest exposure</b><span>Kano Workshop — forecast margin 6.3%</span></div></article>
      </section>
      <article className="panel"><header><small>Cost Control</small><h2>Budget, Commitments & Completion Forecast</h2></header><div className="data-table"><div className="table-row head"><span>Project</span><span>Budget</span><span>Actual</span><span>Committed</span><span>CTC</span><span>Margin</span><span>Status</span></div>{[["Jahi Residence","₦28.4m","₦19.2m","₦4.8m","₦5.1m","11.8%","Watch"],["Gwarimpa","₦18.1m","₦12.5m","₦2.1m","₦3.0m","14.2%","On track"],["Kano Workshop","₦44.7m","₦31.6m","₦8.2m","₦7.6m","6.3%","Risk"],["Maitama","₦36.9m","₦18.8m","₦6.0m","₦11.7m","16.5%","On track"]].map(r=><div className="table-row" key={r[0]}>{r.map((v,i)=><span key={v}>{i===0?<b>{v}</b>:v}</span>)}</div>)}</div></article>
    </>
  );
}

function ManagerView() {
  return (
    <>
      <section className="hero orange"><div><small className="tag">JAHI-01</small><h2>Good morning, Project Manager.</h2><p>Here's what is happening on your site today.</p><span>Jahi, Abuja · 72% work progress · Updated 08:14</span></div><div className="imprest"><small>Available imprest</small><strong>₦320,000</strong><span>₦180,000 retired this week</span></div></section>
      <section className="quick-actions">{[["₦","Request Funds","Create a new project request"],["+","Record Expense","Capture a site payment"],["▤","Upload Receipt","Add evidence"],["✓","Update Progress","Record today’s work"]].map(([a,b,c])=><button key={b}><i>{a}</i><span><b>{b}</b><small>{c}</small></span></button>)}</section>
      <section className="split">
        <article className="panel"><header><small>Project Budget</small><h2>Budget Health</h2></header><div className="donut-wrap"><div className="donut orange"><div><strong>68%</strong><span>budget used</span></div></div><div className="legend">Budget <b>₦28.4m</b><br/>Spent <b>₦19.2m</b><br/>Committed <b>₦4.8m</b><br/>Available <b>₦4.4m</b></div></div></article>
        <article className="panel"><header><small>My Actions</small><h2>What Needs Attention</h2></header>{[["2","Pending requests","₦760,000 awaiting approval","warn"],["1","Missing receipt","₦45,000 transport payment","bad"],["3","Deliveries expected","Cement, tiles and plumbing fittings","ok"]].map(([a,b,c,d])=><div className="list-row" key={b}><i className={`pill ${d}`}>{a}</i><div><b>{b}</b><span>{c}</span></div><strong>→</strong></div>)}</article>
      </section>
      <section className="split"><article className="panel"><header><small>Site Cost</small><h2>Spend by Work Section</h2></header>{[["Tiling","₦3.5m",82],["Masonry","₦1.8m",66],["Temporary Works","₦1.9m",58],["Plumbing","₦560k",41]].map(([a,b,c])=><div className="bar-item orange" key={String(a)}><div><span>{a}</span><b>{b}</b></div><div className="track"><i style={{width:`${c}%`}} /></div></div>)}</article><article className="panel"><header><small>This Week</small><h2>Site Spending</h2><strong>₦1.25m</strong></header><LineChart tone="orange" /></article></section>
    </>
  );
}

export default function Home() {
  const [current, setCurrent] = useState<RoleKey>("md");
  const role = roles[current];
  const content = useMemo(() => current === "md" ? <MDView /> : current === "finance" ? <FinanceView /> : current === "director" ? <DirectorView /> : <ManagerView />, [current]);

  return (
    <main className={`app role-${role.accent}`}>
      <aside className="sidebar">
        <div className="app-mark" aria-label="Charismak Accounting"><div className="logo-circle"><img src="https://raw.githubusercontent.com/CharismakProject/charismak-website/main/public/branding/charismak-logo.png" alt="Charismak"/><b>A</b></div><span>Accounting</span></div>
        <p className="section-label">Switch role</p>
        <div className="role-list">{(Object.keys(roles) as RoleKey[]).map(key => <button key={key} className={`role-button ${key===current?"active":""}`} onClick={()=>setCurrent(key)}><span className="role-icon">{roles[key].short}</span><span><b>{roles[key].label}</b><small>{roles[key].eyebrow}</small></span></button>)}</div>
        <nav>{role.nav.map((item,index)=><button className={index===0?"active":""} key={item}>{item}</button>)}</nav>
        <div className="truth"><b>✓ Track the truth</b><span>Every movement. Every project.</span></div>
      </aside>
      <section className="content-shell">
        <header className="topbar"><div><small className="eyebrow">{role.eyebrow}</small><h1>{role.title}</h1><p>{role.subtitle}</p></div><div className="profile"><span>🔔</span><div>CA</div></div></header>
        <div className="mobile-role-tabs">{(Object.keys(roles) as RoleKey[]).map(key=><button key={key} className={key===current?"active":""} onClick={()=>setCurrent(key)}>{roles[key].short}</button>)}</div>
        <div className="dashboard">{content}</div>
      </section>
    </main>
  );
}

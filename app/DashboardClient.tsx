"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createClient } from "../lib/supabase/client";

export type RoleFamily = "md_owner" | "accountant_cfo" | "project_director" | "project_manager";

const LOGO_URL = "https://raw.githubusercontent.com/CharismakProject/charismak-website/main/public/branding/charismak-logo.png";
const money = (value: number | string | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value));
const compactMoney = (value: number) => `₦${new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(value || 0))}`;

const roleMeta: Record<RoleFamily,{label:string;short:string;note:string;className:string}> = {
  md_owner:{label:"MD / Owner",short:"MD",note:"Executive control",className:"role-md"},
  accountant_cfo:{label:"Accountant / CFO",short:"CFO",note:"Finance operations",className:"role-finance"},
  project_director:{label:"Project Director",short:"PD",note:"Portfolio & cost",className:"role-director"},
  project_manager:{label:"Project / Construction Manager",short:"PM",note:"Site & project control",className:"role-manager"},
};

type Props = {
  companyId:string;
  companyName:string;
  userEmail:string;
  signedInRole:string;
  isOwner:boolean;
  initialRole:RoleFamily;
  availableRoles:RoleFamily[];
  managerProjectIds:string[];
  projects:any[];
  accounts:any[];
  approvals:any[];
  statements:any[];
  transactions:any[];
  auditRows:any[];
  imprests:any[];
  costCategories:any[];
};

export default function DashboardClient(props:Props){
  const {companyId,companyName,userEmail,signedInRole,isOwner,initialRole,availableRoles,managerProjectIds,projects,accounts,approvals,statements,transactions,auditRows,imprests,costCategories}=props;
  const supabase=useMemo(()=>createClient(),[]);
  const [active,setActive]=useState<RoleFamily>(initialRole);
  const [roleError,setRoleError]=useState("");
  const managerProjects=useMemo(()=>isOwner?projects:projects.filter((p:any)=>managerProjectIds.includes(p.id)),[isOwner,projects,managerProjectIds]);
  const defaultManagerProject=managerProjects.find((p:any)=>p.status==="active"||p.status==="on_hold")??managerProjects[0];
  const [selectedProjectId,setSelectedProjectId]=useState<string>(defaultManagerProject?.id??"");

  useEffect(()=>{
    if(!managerProjects.some((p:any)=>p.id===selectedProjectId)) setSelectedProjectId(defaultManagerProject?.id??"");
  },[managerProjects,selectedProjectId,defaultManagerProject?.id]);

  async function changeRole(next:RoleFamily){
    if(next===active)return;
    const previous=active;
    setActive(next);
    setRoleError("");
    const {error}=await supabase.rpc("set_active_interface",{target_company:companyId,target_interface:next});
    if(error){setActive(previous);setRoleError("Could not save the role preference. Please try again.");}
  }

  const totals=projects.reduce((acc:any,p:any)=>{
    acc.funding+=Number(p.summary?.funding_received??0);acc.companyFunding+=Number(p.summary?.company_funding??0);acc.otherFinancing+=Number(p.summary?.other_financing??0);acc.expenditure+=Number(p.summary?.confirmed_expenditure??0);acc.cash+=Number(p.summary?.cash_balance??0);acc.commitments+=Number(p.summary?.outstanding_commitments??0);acc.budget+=Number(p.summary?.revised_budget??p.internal_cost_budget??0);acc.forecastProfit+=Number(p.summary?.forecast_profit??0);acc.ctc+=Number(p.summary?.forecast_cost_to_complete??0);return acc;
  },{funding:0,companyFunding:0,otherFinancing:0,expenditure:0,cash:0,commitments:0,budget:0,forecastProfit:0,ctc:0});
  const bankBalanceAvailable=accounts.some((a:any)=>a.current_balance!==null&&a.current_balance!==undefined);
  const bankCash=accounts.reduce((s:number,a:any)=>s+Number(a.current_balance??0),0);
  const pendingApprovals=approvals.filter((r:any)=>["pending","emergency_retrospective"].includes(r.status));
  const unclassifiedEstimate=statements.reduce((s:number,r:any)=>s+Number(r.rows_pending_review??r.rows_new??0),0);
  const cashflow=buildCashflowSeries(transactions);
  const progression=buildProjectProgression(transactions);
  const roleAccent=active==="accountant_cfo"?"finance":active==="project_director"?"director":active==="project_manager"?"manager":"md";

  return <main className={`role-shell role-${roleAccent}-shell`}>
    <aside className="role-sidebar">
      <div className="md-brand"><img src={LOGO_URL} alt="Charismak Accounting"/><div><b>ACCOUNTING</b><span>{companyName}</span></div></div>
      <RoleButtons active={active} available={availableRoles} onChange={changeRole}/>
      {roleError&&<p className="role-switch-error">{roleError}</p>}
      <div className="role-signed-in"><small>SIGNED IN AS</small><b>{signedInRole}</b><span>{userEmail}</span></div>
      <RoleNav active={active} owner={isOwner}/>
      <div className="pwa-install-note">Same workspace and permissions on desktop, tablet and phone.</div>
      <div className="role-truth">✓ Track the truth<br/><span>Every movement. Every project.</span></div>
    </aside>
    <section className="role-main">
      <div className="role-mobile-top"><div className="role-mobile-brand"><img src={LOGO_URL} alt=""/><b>Accounting</b></div><RoleButtons active={active} available={availableRoles} onChange={changeRole}/>{roleError&&<p className="role-switch-error">{roleError}</p>}</div>
      {active==="md_owner"&&<MdDashboard projects={projects} totals={totals} bankCash={bankCash} bankBalanceAvailable={bankBalanceAvailable} approvals={pendingApprovals} accounts={accounts} statements={statements} auditRows={auditRows} progression={progression}/>}
      {active==="accountant_cfo"&&<FinanceDashboard projects={projects} accounts={accounts} bankCash={bankCash} bankBalanceAvailable={bankBalanceAvailable} statements={statements} approvals={pendingApprovals} transactions={transactions} unclassifiedEstimate={unclassifiedEstimate} cashflow={cashflow}/>}
      {active==="project_director"&&<DirectorDashboard projects={projects} totals={totals} approvals={pendingApprovals}/>}
      {active==="project_manager"&&<ManagerDashboard projects={managerProjects} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} approvals={pendingApprovals} transactions={transactions} imprests={imprests} costCategories={costCategories} ownerView={isOwner}/>}
    </section>
  </main>;
}

function RoleButtons({active,available,onChange}:{active:RoleFamily;available:RoleFamily[];onChange:(r:RoleFamily)=>void}){
  return <div className="role-switcher"><small>SWITCH ROLE</small><div className="role-switch-list">{available.map(role=>{const m=roleMeta[role];return <button key={role} type="button" className={`${m.className} ${active===role?"active":""}`} onClick={()=>onChange(role)}><span>{m.short}</span><div><b>{m.label}</b><small>{m.note}</small></div></button>})}</div></div>;
}

function RoleNav({active,owner}:{active:RoleFamily;owner:boolean}){
  if(active==="md_owner")return <nav className="role-nav"><Link className="active" href="/">Executive</Link><Link href="/notifications">Notifications</Link><Link href="/projects">Projects</Link><Link href="/statements">Transactions & Statements</Link><Link href="/statements/upload">Upload Statements</Link><Link href="/treasury">Treasury</Link><Link href="/approvals">Approvals</Link>{owner&&<Link href="/admin/access">People & Access</Link>}<Link href="/audit">Audit Trail</Link></nav>;
  if(active==="accountant_cfo")return <nav className="role-nav"><Link className="active" href="/">Finance Home</Link><Link href="/notifications">Notifications</Link><Link href="/statements">Transaction Inbox</Link><Link href="/statements/upload">Upload Statements</Link><Link href="/treasury">Banking & Treasury</Link><Link href="/approvals">Payments & Approvals</Link><Link href="/projects">Projects</Link></nav>;
  if(active==="project_director")return <nav className="role-nav"><Link className="active" href="/">Portfolio</Link><Link href="/notifications">Notifications</Link><Link href="/projects">Cost Control</Link><Link href="/approvals">Commitments & Approvals</Link><Link href="/statements">Transactions</Link><Link href="/audit">Reports & Audit</Link></nav>;
  return <nav className="role-nav"><Link className="active" href="/">Projects</Link><Link href="/notifications">Notifications</Link><Link href="/projects">Site & Project</Link><Link href="/approvals">Requests</Link><Link href="/statements">Expenses</Link></nav>;
}

function MdDashboard({projects,totals,bankCash,bankBalanceAvailable,accounts,statements,auditRows,progression}:any){
  const risk=projects.filter((p:any)=>Number(p.summary?.funding_surplus_shortfall??0)<0||Number(p.summary?.forecast_profit??0)<0||p.status==="on_hold");
  const auto=statements.reduce((s:number,r:any)=>s+Number(r.rows_auto_posted??0),0),pending=statements.reduce((s:number,r:any)=>s+Number(r.rows_pending_review??0),0);
  const healthy=projects.filter((p:any)=>Number(p.summary?.funding_surplus_shortfall??0)>=0&&p.status!=="on_hold").length;
  return <><DashboardHeader eyebrow="Executive overview" title="Company Control Room" subtitle="Live company cash, project position, approvals and statement intelligence."/><div className="role-content">
    <section className="role-kpis role-kpis-5"><Kpi label="Bank / wallet cash" value={bankBalanceAvailable?money(bankCash):"Balance pending"} note={`${accounts.length} account(s)`}/><Kpi label="Client project funding" value={money(totals.funding)} note={`${projects.length} visible projects`}/><Kpi label="Confirmed expenditure" value={money(totals.expenditure)} note={`${auto} statement rows auto-posted`}/><Kpi label="Outstanding commitments" value={money(totals.commitments)} note="Across visible projects"/><Kpi label="Still needs review" value={String(pending)} note="Unmatched / ambiguous statement rows"/></section>
    <section className="chart-grid"><LineChart title="Project Funding & Expenditure Progression" eyebrow="Cumulative confirmed position" data={progression} firstLabel="Funding" secondLabel="Expenditure"/><DonutCard title="Portfolio Health" eyebrow="Project position" pct={projects.length?Math.round(healthy/projects.length*100):0} label="healthy" stats={[["Healthy",healthy],["Needs attention",Math.max(projects.length-healthy,0)],["Projects",projects.length]]}/></section>
    <section className="role-grid role-grid-wide"><article className="role-card"><CardHead eyebrow="Portfolio" title="Project Financial Position" action={<Link href="/projects">Open projects</Link>}/>{projects.length?projects.map((p:any)=><ProjectPortfolioRow key={p.id} project={p}/>):<Empty text="No projects yet."/>}</article><article className="role-card"><CardHead eyebrow="Decisions" title="Needs Your Attention" action={<Link href="/approvals">Approvals</Link>}/>{risk.slice(0,6).map((p:any)=><DataLine key={p.id} label={p.name} note={p.status} value={money(p.summary?.funding_surplus_shortfall)} warn/>)}{!risk.length&&<Empty text="No current project risk flag."/>}</article></section>
    <section className="role-grid"><article className="role-card"><CardHead eyebrow="Treasury" title="Cash Position by Account" action={<Link href="/treasury">Treasury</Link>}/>{accounts.map((a:any)=><DataLine key={a.id} label={a.institution_name||a.account_name} note={a.balance_as_of?`As at ${a.balance_as_of}`:"Balance not parsed yet"} value={a.current_balance==null?"Pending":money(a.current_balance)}/>)}</article><article className="role-card"><CardHead eyebrow="Audit" title="Recent Recorded Activity" action={<Link href="/audit">Audit trail</Link>}/>{auditRows.slice(0,7).map((r:any)=><DataLine key={r.id} label={String(r.action).replaceAll("."," · ")} note={`${r.actor_email||"System"} · ${String(r.acting_interface||"system").replaceAll("_"," ")}`} value={new Date(r.created_at).toLocaleDateString("en-NG")}/>)}</article></section>
  </div></>;
}

function FinanceDashboard({projects,accounts,bankCash,bankBalanceAvailable,statements,approvals,transactions,unclassifiedEstimate,cashflow}:any){
  const last=statements[0];const auto=statements.reduce((s:number,r:any)=>s+Number(r.rows_auto_posted??0),0),known=statements.reduce((s:number,r:any)=>s+Number(r.rows_already_known??0),0),total=statements.reduce((s:number,r:any)=>s+Number(r.rows_total??0),0);const resolvedPct=total?Math.min(100,Math.round((auto+known+Math.max(total-auto-known-unclassifiedEstimate,0))/total*100)):0;
  return <><DashboardHeader eyebrow="Finance operations" title="Finance Operations Hub" subtitle="Statements, classification, treasury, payments, project position and reconciliation."/><div className="role-content">
    <section className="finance-workload"><div><small>FINANCE WORK QUEUE</small><h2>{unclassifiedEstimate+approvals.length} items may need attention</h2><p>Confident project transactions post automatically; exceptions stay for review.</p></div><div><Link href="/statements/upload">Upload statements</Link><Link href="/statements">Review exceptions</Link></div></section>
    <section className="role-kpis"><Kpi label="Needs classification" value={String(unclassifiedEstimate)} note="Unmatched / ambiguous rows"/><Kpi label="Pending approvals" value={String(approvals.length)} note={money(approvals.reduce((s:number,r:any)=>s+Number(r.amount||0),0))}/><Kpi label="Recorded account cash" value={bankBalanceAvailable?money(bankCash):"Balance pending"} note={`${accounts.length} accounts`}/><Kpi label="Last import" value={last?String(last.detected_institution_name||"Statement"):"—"} note={last?`${last.rows_auto_posted??0} auto-posted · ${last.rows_pending_review??0} review`:"No import"}/></section>
    <section className="chart-grid"><BarChart title="Cash by Bank / Wallet" eyebrow="Treasury" items={accounts.map((a:any)=>({label:a.institution_name||a.account_name,note:a.current_balance==null?"Balance pending":a.account_name,value:Number(a.current_balance||0)}))}/><DonutCard title="Statement Resolution" eyebrow="Reconciliation workload" pct={resolvedPct} label="processed" stats={[["Auto-posted",auto],["Already known",known],["Needs action",unclassifiedEstimate]]}/></section>
    <article className="role-card"><CardHead eyebrow="Project finance" title="Funding & Cost by Project" action={<Link href="/projects">All projects</Link>}/>{projects.length?projects.map((p:any)=><ProjectPortfolioRow key={p.id} project={p}/>):<Empty text="No visible projects."/>}</article>
    <section className="role-grid role-grid-wide"><article className="role-card"><CardHead eyebrow="Transactions" title="Recent Confirmed Movements" action={<Link href="/statements">Open inbox</Link>}/>{transactions.slice(0,10).map((tx:any)=><DataLine key={tx.id} label={tx.narration||"Transaction"} note={`${tx.transaction_date} · ${String(tx.classification||"unclassified").replaceAll("_"," ")}`} value={money(tx.signed_amount)} warn={!tx.project_id}/>)}</article><article className="role-card"><CardHead eyebrow="Banking" title="Quick Balance" action={<Link href="/treasury">Manage accounts</Link>}/>{accounts.slice(0,6).map((a:any)=><DataLine key={a.id} label={a.institution_name||a.account_name} note={a.account_name} value={a.current_balance==null?"Pending":money(a.current_balance)}/>)}</article></section>
    <LineChart title="Monthly Money In vs Money Out" eyebrow="Confirmed cash movement" data={cashflow}/>
  </div></>;
}

function DirectorDashboard({projects,totals,approvals}:any){
  const risky=projects.filter((p:any)=>Number(p.summary?.funding_surplus_shortfall??0)<0||p.status==="on_hold").length,healthy=Math.max(projects.length-risky,0);
  return <><DashboardHeader eyebrow="Project portfolio" title="Portfolio & Cost Control" subtitle="Actual cost, funding, commitments, CTC, profitability and delivery risk across permitted projects."/><div className="role-content">
    <section className="role-kpis"><Kpi label="Projects" value={String(projects.length)} note="Visible non-archived projects"/><Kpi label="Confirmed expenditure" value={money(totals.expenditure)} note={`Funding ${money(totals.funding)}`}/><Kpi label="Outstanding commitments" value={money(totals.commitments)} note="Current recorded commitments"/><Kpi label="Pending requests" value={String(approvals.length)} note="Approval queue"/></section>
    <section className="chart-grid"><BudgetActualChart projects={projects}/><DonutCard title="Portfolio Risk" eyebrow="Cost & funding position" pct={projects.length?Math.round(healthy/projects.length*100):0} label="healthy" stats={[["Healthy",healthy],["Risk / shortfall",risky],["Projects",projects.length]]}/></section>
    <article className="role-card"><CardHead eyebrow="Portfolio health" title="Project Performance" action={<Link href="/projects">Cost control</Link>}/>{projects.length?projects.map((p:any)=><ProjectPerformanceRow key={p.id} project={p}/>):<Empty text="No visible projects."/>}</article>
  </div></>;
}

function ManagerDashboard({projects,selectedProjectId,setSelectedProjectId,approvals,transactions,imprests,costCategories,ownerView}:any){
  const p=projects.find((x:any)=>x.id===selectedProjectId)??projects[0];
  const pa=p?approvals.filter((r:any)=>r.project_id===p.id):[];const pt=p?transactions.filter((r:any)=>r.project_id===p.id):[];const imp=p?imprests.find((r:any)=>r.project_id===p.id):null;
  const storedCategories=p?costCategories.filter((c:any)=>c.project_id===p.id).map((c:any)=>({label:c.category_name,note:"",value:Number(c.amount||0)})):[];
  const categories=storedCategories.length?storedCategories:categoryTotals(pt);
  return <><DashboardHeader eyebrow="Site & project control" title={p?p.name:"Project Workspace"} subtitle={ownerView?"MD acting in Project Manager view — all company projects remain selectable.":"Switch between every project assigned to you; permissions still control actions and cost visibility."}/><div className="role-content">
    {projects.length>1&&<section className="manager-project-switcher" aria-label="Select project">{projects.map((project:any)=><button type="button" key={project.id} className={project.id===p?.id?"active":""} onClick={()=>setSelectedProjectId(project.id)}><b>{project.project_code}</b><span>{project.name}</span><small>{String(project.status).replaceAll("_"," ")} · {compactMoney(Number(project.summary?.confirmed_expenditure||0))} spent</small></button>)}</section>}
    {!p?<article className="role-card"><Empty text="No project is assigned to this Project Manager workspace."/></article>:<>
      <section className="manager-hero"><div><span>{p.project_code}</span><h2>{p.name}</h2><p>{p.location||"Location not set"} · {Number(p.progress_percent||0).toFixed(0)}% progress · {String(p.status).replaceAll("_"," ")}</p></div><div><small>Recorded imprest</small><strong>{money(imp?.current_balance??0)}</strong></div></section>
      <section className="manager-actions"><Link href="/approvals">＋ Request Funds</Link><Link href="/statements">Review Expenses</Link><Link href={`/projects/${p.id}/progress`}>Update Progress</Link><Link href={`/projects/${p.id}`}>Open Project</Link></section>
      <section className="chart-grid"><BarChart title="Spend by Work Category" eyebrow="Site cost" items={categories}/><DonutCard title="Project Progress" eyebrow="Site status" pct={Math.round(Number(p.progress_percent||0))} label="complete" stats={[["Funding",compactMoney(Number(p.summary?.funding_received||0))],["Spent",compactMoney(Number(p.summary?.confirmed_expenditure||0))],["Commitments",compactMoney(Number(p.summary?.outstanding_commitments||0))]]}/></section>
      <section className="role-grid"><article className="role-card"><CardHead eyebrow="Project position" title="Funding & Cost"/><DataLine label="Client funding" value={money(p.summary?.funding_received)}/><DataLine label="Confirmed expenditure" value={money(p.summary?.confirmed_expenditure)}/><DataLine label="Cash remaining" value={money(p.summary?.cash_balance)}/><DataLine label="Outstanding commitments" value={money(p.summary?.outstanding_commitments)}/><DataLine label="Funding position after commitments" value={money(p.summary?.funding_surplus_shortfall)} warn={Number(p.summary?.funding_surplus_shortfall||0)<0}/></article><article className="role-card"><CardHead eyebrow="Project actions" title="Needs Attention"/>{pa.length?pa.slice(0,6).map((r:any)=><DataLine key={r.id} label={r.description} note={r.status} value={money(r.amount)} warn/>):<Empty text="No requests waiting."/>}{pt.slice(0,4).map((tx:any)=><DataLine key={tx.id} label={tx.narration||"Transaction"} note={tx.category_name||"Uncategorised"} value={money(tx.signed_amount)}/>)}</article></section>
    </>}
  </div></>;
}

function monthLabel(key:string){const [y,m]=key.split("-").map(Number);return new Date(y,m-1,1).toLocaleDateString("en-NG",{month:"short",year:"2-digit"});}
function buildCashflowSeries(transactions:any[]){const map=new Map<string,any>();for(const tx of transactions){if(!String(tx.transaction_date||"").match(/^\d{4}-\d{2}/)||!["confirmed","confirmed_reconciliation_only"].includes(String(tx.status||"")))continue;const key=String(tx.transaction_date).slice(0,7),row=map.get(key)||{key,label:monthLabel(key),inflow:0,outflow:0},amount=Number(tx.signed_amount||0);if(amount>=0)row.inflow+=amount;else row.outflow+=Math.abs(amount);map.set(key,row);}return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key)).slice(-12);}
function buildProjectProgression(transactions:any[]){const map=new Map<string,any>();for(const tx of transactions){if(!String(tx.transaction_date||"").match(/^\d{4}-\d{2}/)||!["confirmed","confirmed_reconciliation_only"].includes(String(tx.status||"")))continue;const cl=String(tx.classification||"");if(!["project_funding","project_expense"].includes(cl))continue;const key=String(tx.transaction_date).slice(0,7),row=map.get(key)||{key,label:monthLabel(key),inflow:0,outflow:0},amount=Number(tx.signed_amount||0);if(cl==="project_funding"&&amount>0)row.inflow+=amount;if(cl==="project_expense"&&amount<0)row.outflow+=Math.abs(amount);map.set(key,row);}let f=0,s=0;return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(row=>{f+=row.inflow;s+=row.outflow;return {...row,inflow:f,outflow:s};}).slice(-12);}
function categoryTotals(transactions:any[]){const map=new Map<string,number>();for(const tx of transactions){if(Number(tx.signed_amount||0)>=0||String(tx.classification)!=="project_expense")continue;const k=String(tx.category_name||"Uncategorised");map.set(k,(map.get(k)||0)+Math.abs(Number(tx.signed_amount||0)));}return [...map.entries()].map(([label,value])=>({label,note:"",value})).sort((a,b)=>b.value-a.value).slice(0,7);}
function makePath(values:number[],max:number){const w=600,h=160,p=22,n=Math.max(values.length,1),step=n>1?(w-p*2)/(n-1):0;return values.map((v,i)=>`${i?"L":"M"} ${p+i*step} ${h-p-(max?((v/max)*(h-p*2)):0)}`).join(" ");}
function LineChart({title,eyebrow,data,firstLabel="Money in",secondLabel="Money out"}:{title:string;eyebrow:string;data:any[];firstLabel?:string;secondLabel?:string}){const first=data.map((d:any)=>Number(d.inflow||0)),second=data.map((d:any)=>Number(d.outflow||0)),max=Math.max(1,...first,...second),w=600,h=160,p=22,last=data[data.length-1];return <article className="chart-card"><div className="chart-head"><div><small>{eyebrow}</small><h3>{title}</h3></div><div className="chart-legend"><span><i className="legend-a"/>{firstLabel}</span><span><i className="legend-b"/>{secondLabel}</span></div></div>{data.length?<><svg className="line-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}>{[.25,.5,.75,1].map(v=><line key={v} className="grid" x1={p} x2={w-p} y1={h-p-v*(h-p*2)} y2={h-p-v*(h-p*2)}/>)}<path className="line-a" d={makePath(first,max)}/><path className="line-b" d={makePath(second,max)}/>{data.map((d:any,i:number)=>{const x=p+(data.length>1?i*(w-p*2)/(data.length-1):0),y1=h-p-(Number(d.inflow||0)/max)*(h-p*2),y2=h-p-(Number(d.outflow||0)/max)*(h-p*2);return <g key={d.key}><circle className="line-dot-a" cx={x} cy={y1} r="3"/><circle className="line-dot-b" cx={x} cy={y2} r="3"/><text x={x} y={h-3} textAnchor="middle">{d.label}</text></g>})}</svg><div className="chart-latest"><span><small>Latest {firstLabel}</small><b>{money(last?.inflow)}</b></span><span><small>Latest {secondLabel}</small><b>{money(last?.outflow)}</b></span><span><small>Periods shown</small><b>{data.length}</b></span></div></>:<Empty text="Confirmed transaction history will populate this chart."/>}</article>}
function BarChart({title,eyebrow,items}:{title:string;eyebrow:string;items:{label:string;note?:string;value:number}[]}){const max=Math.max(1,...items.map(i=>Math.abs(i.value||0)));return <article className="chart-card"><div className="chart-head"><div><small>{eyebrow}</small><h3>{title}</h3></div></div><div className="bar-list">{items.length?items.slice(0,7).map((item,i)=><div className="bar-row" key={`${item.label}-${i}`}><div><b>{item.label}</b>{item.note&&<small>{item.note}</small>}</div><div className="bar-track"><i style={{width:`${Math.max(2,Math.round(Math.abs(item.value||0)/max*100))}%`}}/></div><strong>{item.note==="Balance pending"?"Pending":compactMoney(item.value)}</strong></div>):<Empty text="No data yet."/>}</div></article>}
function BudgetActualChart({projects}:{projects:any[]}){const items=projects.slice(0,7).map((p:any)=>{const budget=Number(p.summary?.revised_budget||p.internal_cost_budget||0),funding=Number(p.summary?.funding_received||0),reference=budget||funding;return {...p,reference,referenceLabel:budget?"Budget":"Funding"};});const max=Math.max(1,...items.flatMap((p:any)=>[p.reference,Number(p.summary?.confirmed_expenditure||0)]));return <article className="chart-card"><div className="chart-head"><div><small>Cost control</small><h3>Budget / Funding vs Actual</h3></div><div className="chart-legend"><span><i className="legend-a"/>Baseline</span><span><i className="legend-b"/>Actual</span></div></div><div className="bar-list">{items.length?items.map((p:any)=><div key={p.id} style={{display:"grid",gap:4}}><div style={{display:"flex",justifyContent:"space-between",fontSize:8}}><b>{p.project_code} · {p.referenceLabel}</b><span>{compactMoney(Number(p.summary?.confirmed_expenditure||0))}</span></div><div className="bar-track"><i style={{width:`${Math.round(p.reference/max*100)}%`}}/></div><div className="bar-track alt"><i style={{width:`${Math.round(Number(p.summary?.confirmed_expenditure||0)/max*100)}%`}}/></div></div>):<Empty text="Project funding/budget data will populate this chart."/>}</div></article>}
function DonutCard({title,eyebrow,pct,label,stats}:{title:string;eyebrow:string;pct:number;label:string;stats:[string,string|number][]}){const safe=Math.max(0,Math.min(100,pct||0)),style={"--pct":safe} as CSSProperties;return <article className="chart-card"><div className="chart-head"><div><small>{eyebrow}</small><h3>{title}</h3></div></div><div className="donut-wrap"><div className="donut" style={style}><div><b>{safe}%</b><small>{label}</small></div></div><div>{stats.map(([k,v])=><div className="mini-chart-stat" key={k}><span>{k}</span><b>{v}</b></div>)}</div></div></article>}
function DashboardHeader({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle:string}){return <header className="role-header"><p>{eyebrow}</p><h1>{title}</h1><span>{subtitle}</span></header>}
function Kpi({label,value,note}:{label:string;value:string;note:string}){return <article className="role-kpi"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>}
function CardHead({eyebrow,title,action}:{eyebrow:string;title:string;action?:ReactNode}){return <div className="role-card-head"><div><small>{eyebrow}</small><h2>{title}</h2></div>{action&&<div>{action}</div>}</div>}
function DataLine({label,value,note,warn=false}:{label:string;value:string;note?:string;warn?:boolean}){return <div className="role-data-line"><div><b>{label}</b>{note&&<small>{note}</small>}</div><strong className={warn?"warn":""}>{value}</strong></div>}
function Empty({text}:{text:string}){return <p className="role-empty">{text}</p>}
function ProjectPortfolioRow({project}:any){return <Link href={`/projects/${project.id}`} className="portfolio-row"><div><b>{project.project_code} · {project.name}</b><small>{project.location||"No location"} · {String(project.status).replaceAll("_"," ")}</small></div><span><small>Client funding</small><b>{money(project.summary?.funding_received)}</b></span><span><small>Spent</small><b>{money(project.summary?.confirmed_expenditure)}</b></span><span><small>Commitments</small><b>{money(project.summary?.outstanding_commitments)}</b></span><span><small>Position</small><b>{money(project.summary?.funding_surplus_shortfall)}</b></span></Link>}
function ProjectPerformanceRow({project}:any){const budget=Number(project.summary?.revised_budget||project.internal_cost_budget||0),funding=Number(project.summary?.funding_received||0),reference=budget||funding,actual=Number(project.summary?.confirmed_expenditure||0),used=reference?Math.min(100,Math.round(actual/reference*100)):0;return <Link href={`/projects/${project.id}`} className="performance-row"><div><b>{project.name}</b><small>{project.project_code} · {budget?"budget usage":"funding usage"}</small></div><div className="performance-bar"><i style={{width:`${used}%`}}/></div><strong>{used}%</strong><em className={Number(project.summary?.funding_surplus_shortfall||0)<0?"risk":"ok"}>{money(project.summary?.funding_surplus_shortfall)} position</em></Link>}

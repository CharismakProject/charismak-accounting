import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

const money=(v:unknown)=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(v??0));
const date=(v:unknown)=>v?new Intl.DateTimeFormat("en-NG",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(String(v))):"—";

export default async function AccountingStatementsPage(){
  const supabase=await createClient();
  const {data:auth}=await supabase.auth.getUser();
  if(!auth.user)redirect("/login");
  const {data:membership}=await supabase.from("company_memberships").select("company_id").eq("user_id",auth.user.id).eq("status","active").limit(1).maybeSingle();
  if(!membership)redirect("/login");
  const companyId=membership.company_id;
  const [companyRes,tbRes,pnlRes,bsRes,cfRes,glRes]=await Promise.all([
    supabase.from("companies").select("name").eq("id",companyId).single(),
    supabase.from("v_trial_balance").select("code,name,account_type,debit_total,credit_total,balance").eq("company_id",companyId).order("code"),
    supabase.from("v_profit_and_loss").select("code,name,account_type,amount").eq("company_id",companyId).order("code"),
    supabase.from("v_balance_sheet").select("code,name,account_type,amount").eq("company_id",companyId).order("code"),
    supabase.from("v_cash_flow").select("entry_date,activity,cash_change").eq("company_id",companyId).order("entry_date"),
    supabase.from("v_general_ledger").select("entry_date,reference,journal_description,account_code,account_name,project_id,debit,credit,status").eq("company_id",companyId).eq("status","posted").order("entry_date",{ascending:false}).limit(200),
  ]);
  const tb=tbRes.data??[],pnl=pnlRes.data??[],bs=bsRes.data??[],cf=cfRes.data??[],gl=glRes.data??[];
  const income=pnl.filter((r:any)=>r.account_type==="income").reduce((s:number,r:any)=>s+Number(r.amount??0),0);
  const expenses=pnl.filter((r:any)=>r.account_type==="expense").reduce((s:number,r:any)=>s+Number(r.amount??0),0);
  const assets=bs.filter((r:any)=>r.account_type==="asset").reduce((s:number,r:any)=>s+Number(r.amount??0),0);
  const liabilities=bs.filter((r:any)=>r.account_type==="liability").reduce((s:number,r:any)=>s+Number(r.amount??0),0);
  const equity=bs.filter((r:any)=>r.account_type==="equity").reduce((s:number,r:any)=>s+Number(r.amount??0),0);
  const cash=(kind:string)=>cf.filter((r:any)=>r.activity===kind).reduce((s:number,r:any)=>s+Number(r.cash_change??0),0);
  const tbDiff=tb.reduce((s:number,r:any)=>s+Number(r.debit_total??0)-Number(r.credit_total??0),0);
  return <main className="accounting-hub"><div className="accounting-wrap">
    <div className="accounting-toolbar"><Link href="/reports">← Reports</Link><Link href="/accounting">Accounting Control</Link></div>
    <header className="accounting-hero"><small>FINANCIAL STATEMENTS</small><h1>{companyRes.data?.name??"Company"}</h1><p>Live statements generated from posted double-entry journals. Project activity and company overheads remain visible in one company ledger.</p></header>
    <section className="accounting-kpis"><article><small>Net result</small><strong>{money(income-expenses)}</strong><span>Income less expenses</span></article><article><small>Total assets</small><strong>{money(assets)}</strong><span>Balance sheet</span></article><article><small>Liabilities</small><strong>{money(liabilities)}</strong><span>Balance sheet</span></article><article><small>Equity</small><strong>{money(equity)}</strong><span>Balance sheet</span></article><article><small>Net cash movement</small><strong>{money(cf.reduce((s:number,r:any)=>s+Number(r.cash_change??0),0))}</strong><span>All bank/cash journals</span></article><article><small>Trial balance check</small><strong>{money(tbDiff)}</strong><span>Must be zero</span></article></section>

    <section className="accounting-section"><div className="accounting-three-col">
      <article className="accounting-list-card"><h3>Profit & Loss</h3>{pnl.map((r:any)=><div className="accounting-mini-row" key={r.code}><span>{r.code} · {r.name}</span><b>{money(r.amount)}</b></div>)}<div className="accounting-total"><span>Net result</span><strong>{money(income-expenses)}</strong></div></article>
      <article className="accounting-list-card"><h3>Balance Sheet</h3>{bs.map((r:any)=><div className="accounting-mini-row" key={r.code}><span>{r.code} · {r.name}</span><b>{money(r.amount)}</b></div>)}<div className="accounting-total"><span>A − L − E</span><strong>{money(assets-liabilities-equity)}</strong></div></article>
      <article className="accounting-list-card"><h3>Cash Flow</h3><div className="accounting-mini-row"><span>Operating activities</span><b>{money(cash("operating"))}</b></div><div className="accounting-mini-row"><span>Investing activities</span><b>{money(cash("investing"))}</b></div><div className="accounting-mini-row"><span>Financing activities</span><b>{money(cash("financing"))}</b></div><div className="accounting-mini-row"><span>Internal transfers</span><b>{money(cash("internal_transfer"))}</b></div><div className="accounting-total"><span>Net cash movement</span><strong>{money(cf.reduce((s:number,r:any)=>s+Number(r.cash_change??0),0))}</strong></div></article>
    </div></section>

    <section className="accounting-section"><div className="accounting-section-head"><div><small>TRIAL BALANCE</small><h2>All ledger accounts</h2></div></div><div className="accounting-list-card">{tb.map((r:any)=><div className="accounting-row" key={r.code}><div><b>{r.code} · {r.name}</b><span>{r.account_type}</span></div><div className="accounting-row-amount"><strong>{money(r.balance)}</strong><span>Dr {money(r.debit_total)} · Cr {money(r.credit_total)}</span></div></div>)}</div></section>

    <section className="accounting-section"><div className="accounting-section-head"><div><small>GENERAL LEDGER</small><h2>Latest 200 posted journal lines</h2></div></div><div className="accounting-list-card">{gl.length?gl.map((r:any,i:number)=><div className="accounting-row" key={`${r.entry_date}-${r.reference}-${i}`}><div><b>{r.account_code} · {r.account_name}</b><span>{date(r.entry_date)} · {r.reference||"No reference"}</span><small>{r.journal_description}</small></div><div className="accounting-row-amount"><strong>{Number(r.debit)>0?`Dr ${money(r.debit)}`:`Cr ${money(r.credit)}`}</strong></div></div>):<p className="accounting-empty">No posted journal entries yet.</p>}</div></section>
  </div></main>;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import {
  calculateWip,
  confirmPaymentMatch,
  createClientInvoice,
  createSupplierBill,
  generatePaymentMatches,
  postWip,
  reconcileBank,
  setAccountingPeriod,
} from "./actions";

const money = (value: unknown) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value ?? 0));
const pct = (value: unknown) => `${(Number(value ?? 0) * 100).toFixed(1)}%`;
const shortDate = (value: unknown) => value ? new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(String(value))) : "—";
const today = new Date().toISOString().slice(0, 10);

export default async function AccountingPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: membership } = await supabase
    .from("company_memberships")
    .select("company_id,is_owner")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/login");
  const companyId = membership.company_id;

  const [
    projectsRes, accountsRes, importsRes, arRes, apRes, wipRes, reconciliationsRes,
    periodsRes, pnlRes, bsRes, visualRes, matchesRes,
  ] = await Promise.all([
    supabase.from("projects").select("id,project_code,name,status").eq("company_id", companyId).neq("status", "archived").order("name"),
    supabase.from("financial_accounts").select("id,institution_name,account_name,account_number_masked,current_balance,balance_as_of").eq("company_id", companyId).eq("is_active", true).order("account_name"),
    supabase.from("statement_imports").select("id,financial_account_id,detected_institution_name,detected_account_name,period_end,closing_balance,status").eq("company_id", companyId).order("created_at", { ascending: false }).limit(30),
    supabase.from("accounts_receivable").select("id,invoice_number,issue_date,due_date,gross_amount,paid_amount,outstanding_amount,status,party:business_parties(name),project:projects(project_code,name)").eq("company_id", companyId).neq("status", "void").order("issue_date", { ascending: false }).limit(25),
    supabase.from("accounts_payable").select("id,bill_number,issue_date,due_date,gross_amount,paid_amount,outstanding_amount,status,expense_scope,category_name,party:business_parties(name),project:projects(project_code,name)").eq("company_id", companyId).neq("status", "void").order("issue_date", { ascending: false }).limit(25),
    supabase.from("wip_snapshots").select("id,as_of_date,revised_contract_value,estimated_total_cost,cost_incurred_to_date,percent_complete,revenue_to_date,billed_to_date,contract_asset,contract_liability,current_period_revenue,status,project:projects(project_code,name)").eq("company_id", companyId).order("as_of_date", { ascending: false }).limit(20),
    supabase.from("bank_reconciliations").select("id,period_end,statement_closing_balance,book_balance,difference,unmatched_statement_rows,status,account:financial_accounts(institution_name,account_name)").eq("company_id", companyId).order("period_end", { ascending: false }).limit(20),
    supabase.from("accounting_periods").select("id,period_start,period_end,status,notes,closed_at").eq("company_id", companyId).order("period_end", { ascending: false }).limit(20),
    supabase.from("v_profit_and_loss").select("account_type,code,name,amount").eq("company_id", companyId),
    supabase.from("v_balance_sheet").select("account_type,code,name,amount").eq("company_id", companyId),
    supabase.from("visual_document_reviews").select("id,extraction_status,confidence,source:source_documents(file_name,document_type,uploaded_at)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(12),
    supabase.from("payment_match_suggestions").select("id,confidence,status,statement_row:statement_rows(transaction_date,narration,reference,signed_amount),receivable:accounts_receivable(invoice_number,outstanding_amount,party:business_parties(name)),payable:accounts_payable(bill_number,outstanding_amount,party:business_parties(name))").eq("company_id", companyId).eq("status", "suggested").order("confidence", { ascending: false }).limit(20),
  ]);

  const projects = projectsRes.data ?? [];
  const accounts = accountsRes.data ?? [];
  const imports = importsRes.data ?? [];
  const receivables = arRes.data ?? [];
  const payables = apRes.data ?? [];
  const wips = wipRes.data ?? [];
  const reconciliations = reconciliationsRes.data ?? [];
  const periods = periodsRes.data ?? [];
  const visual = visualRes.data ?? [];
  const matches = matchesRes.data ?? [];
  const pnl = pnlRes.data ?? [];
  const bs = bsRes.data ?? [];

  const arOutstanding = receivables.reduce((sum: number, row: any) => sum + Number(row.outstanding_amount ?? 0), 0);
  const apOutstanding = payables.reduce((sum: number, row: any) => sum + Number(row.outstanding_amount ?? 0), 0);
  const income = pnl.filter((r: any) => r.account_type === "income").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const expenses = pnl.filter((r: any) => r.account_type === "expense").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const assets = bs.filter((r: any) => r.account_type === "asset").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const liabilities = bs.filter((r: any) => r.account_type === "liability").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const equity = bs.filter((r: any) => r.account_type === "equity").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const unreconciled = reconciliations.filter((r: any) => r.status === "draft").length;
  const visualPending = visual.filter((r: any) => r.extraction_status !== "confirmed").length;

  return <main className="accounting-hub">
    <div className="accounting-wrap">
      <div className="accounting-toolbar"><Link href="/">← Home</Link><Link href="/add">＋ Add financial document</Link><Link href="/reports">Reports</Link></div>
      <header className="accounting-hero"><small>ACCOUNTING CONTROL CENTRE</small><h1>Company books + project job costing</h1><p>Receivables, payables, bank reconciliation, WIP, financial statements and period controls now sit on the same double-entry ledger as project costs.</p></header>

      <section className="accounting-kpis">
        <article><small>Receivables outstanding</small><strong>{money(arOutstanding)}</strong><span>{receivables.filter((r: any) => r.status !== "paid").length} open client invoices</span></article>
        <article><small>Payables outstanding</small><strong>{money(apOutstanding)}</strong><span>{payables.filter((r: any) => r.status !== "paid").length} open supplier bills</span></article>
        <article><small>Operating result</small><strong>{money(income - expenses)}</strong><span>Income {money(income)} · Expenses {money(expenses)}</span></article>
        <article><small>Balance sheet</small><strong>{money(assets)}</strong><span>Liabilities {money(liabilities)} · Equity {money(equity)}</span></article>
        <article><small>Bank reconciliation</small><strong>{unreconciled}</strong><span>draft/unreconciled periods</span></article>
        <article><small>Visual evidence</small><strong>{visualPending}</strong><span>image/scanned files awaiting extraction/review</span></article>
      </section>

      <section className="accounting-section">
        <div className="accounting-section-head"><div><small>AP / AR</small><h2>Invoices, bills and settlement matching</h2></div><form action={generatePaymentMatches}><button type="submit">Find bank matches</button></form></div>
        <div className="accounting-two-col">
          <article className="accounting-card">
            <h3>Record client invoice</h3>
            <form action={createClientInvoice} className="accounting-form">
              <label>Project<select name="project_id"><option value="">Company / no project</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label>
              <label>Client<input name="party_name" required placeholder="Client/company name" /></label>
              <div><label>Invoice no.<input name="invoice_number" required /></label><label>Amount<input name="gross_amount" type="number" min="0.01" step="0.01" required /></label></div>
              <div><label>Issue date<input name="issue_date" type="date" defaultValue={today} required /></label><label>Due date<input name="due_date" type="date" /></label></div>
              <div><label>VAT / tax<input name="tax_amount" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Retention<input name="retention_amount" type="number" min="0" step="0.01" defaultValue="0" /></label></div>
              <label>Notes<input name="notes" placeholder="Progress certificate, milestone, etc." /></label>
              <button type="submit">Post client invoice</button>
            </form>
          </article>
          <article className="accounting-card">
            <h3>Record supplier bill</h3>
            <form action={createSupplierBill} className="accounting-form">
              <div><label>Scope<select name="expense_scope"><option value="project">Project cost</option><option value="company">Company overhead</option><option value="asset">Fixed asset</option><option value="other">Other / suspense</option></select></label><label>Project<select name="project_id"><option value="">No project</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label></div>
              <label>Supplier<input name="party_name" required placeholder="Supplier/subcontractor" /></label>
              <div><label>Bill/invoice no.<input name="bill_number" required /></label><label>Amount<input name="gross_amount" type="number" min="0.01" step="0.01" required /></label></div>
              <div><label>Issue date<input name="issue_date" type="date" defaultValue={today} required /></label><label>Due date<input name="due_date" type="date" /></label></div>
              <div><label>VAT / tax<input name="tax_amount" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Ledger<select name="expense_account_code"><option value="">Automatic</option><option value="5000">Project Direct Costs</option><option value="5100">Direct Labour</option><option value="5200">Direct Materials</option><option value="5300">Subcontractors</option><option value="6000">Company Overheads</option><option value="6100">Staff Costs</option><option value="6200">Administration</option><option value="6300">Software & IT</option><option value="6400">Transport & Travel</option><option value="6500">Professional Fees</option><option value="1500">Fixed Assets</option></select></label></div>
              <label>Category<input name="category_name" placeholder="Tiles, Staff Accommodation, Painting…" /></label>
              <label>Notes<input name="notes" /></label>
              <button type="submit">Post supplier bill</button>
            </form>
          </article>
        </div>

        {matches.length > 0 && <div className="accounting-list-card"><h3>Suggested bank settlements</h3><p>These are unposted statement rows whose amount/date/reference fit an open invoice or supplier bill. Confirming one creates a settlement journal instead of another revenue/expense.</p>{matches.map((m: any) => { const sr = Array.isArray(m.statement_row) ? m.statement_row[0] : m.statement_row; const ar = Array.isArray(m.receivable) ? m.receivable[0] : m.receivable; const ap = Array.isArray(m.payable) ? m.payable[0] : m.payable; const target = ar ?? ap; const party = Array.isArray(target?.party) ? target.party[0] : target?.party; return <div className="accounting-row" key={m.id}><div><b>{ar ? `Receivable ${ar.invoice_number}` : `Payable ${ap?.bill_number}`}</b><span>{party?.name ?? "Unknown party"} · {shortDate(sr?.transaction_date)}</span><small>{sr?.narration ?? sr?.reference ?? "Statement transaction"}</small></div><div className="accounting-row-amount"><strong>{money(Math.abs(Number(sr?.signed_amount ?? 0)))}</strong><span>{Number(m.confidence ?? 0).toFixed(0)}% match</span></div><form action={confirmPaymentMatch}><input type="hidden" name="suggestion_id" value={m.id} /><button type="submit">Confirm match</button></form></div>; })}</div>}

        <div className="accounting-two-col accounting-tables">
          <article className="accounting-list-card"><h3>Accounts Receivable</h3>{receivables.length ? receivables.map((r: any) => { const party = Array.isArray(r.party) ? r.party[0] : r.party; const project = Array.isArray(r.project) ? r.project[0] : r.project; return <div className="accounting-row" key={r.id}><div><b>{r.invoice_number || "Client invoice"}</b><span>{party?.name ?? "Client"}{project ? ` · ${project.project_code}` : ""}</span><small>Due {shortDate(r.due_date)} · {String(r.status).replaceAll("_", " ")}</small></div><div className="accounting-row-amount"><strong>{money(r.outstanding_amount)}</strong><span>of {money(r.gross_amount)}</span></div></div>; }) : <p className="accounting-empty">No client invoices recorded yet.</p>}</article>
          <article className="accounting-list-card"><h3>Accounts Payable</h3>{payables.length ? payables.map((r: any) => { const party = Array.isArray(r.party) ? r.party[0] : r.party; const project = Array.isArray(r.project) ? r.project[0] : r.project; return <div className="accounting-row" key={r.id}><div><b>{r.bill_number || "Supplier bill"}</b><span>{party?.name ?? "Supplier"}{project ? ` · ${project.project_code}` : ` · ${r.expense_scope}`}</span><small>{r.category_name || "Uncategorised"} · Due {shortDate(r.due_date)}</small></div><div className="accounting-row-amount"><strong>{money(r.outstanding_amount)}</strong><span>of {money(r.gross_amount)}</span></div></div>; }) : <p className="accounting-empty">No supplier bills recorded yet.</p>}</article>
        </div>
      </section>

      <section className="accounting-section">
        <div className="accounting-section-head"><div><small>WIP / REVENUE</small><h2>Construction Work in Progress</h2></div><p>Cost-to-cost uses incurred project cost, including unpaid supplier bills, plus Cost-to-Complete.</p></div>
        <div className="accounting-two-col">
          <article className="accounting-card"><h3>Calculate WIP snapshot</h3><form action={calculateWip} className="accounting-form"><label>Project<select name="project_id" required><option value="">Choose project</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label><div><label>As at<input name="as_of_date" type="date" defaultValue={today} required /></label><label>Method<select name="calculation_method"><option value="cost_to_cost">Cost-to-cost</option><option value="manual_progress">Recorded physical progress</option></select></label></div><button type="submit">Calculate WIP</button></form></article>
          <article className="accounting-list-card"><h3>Recent WIP snapshots</h3>{wips.length ? wips.slice(0, 8).map((w: any) => { const project = Array.isArray(w.project) ? w.project[0] : w.project; return <div className="accounting-wip" key={w.id}><div><b>{project?.project_code} · {project?.name}</b><span>{shortDate(w.as_of_date)} · {pct(w.percent_complete)} complete</span></div><div><small>Cost incurred</small><strong>{money(w.cost_incurred_to_date)}</strong></div><div><small>Revenue to date</small><strong>{money(w.revenue_to_date)}</strong></div><div><small>{Number(w.contract_asset) > 0 ? "Contract asset" : "Contract liability"}</small><strong>{money(Number(w.contract_asset) > 0 ? w.contract_asset : w.contract_liability)}</strong></div>{w.status === "draft" && <form action={postWip}><input type="hidden" name="snapshot_id" value={w.id} /><button type="submit">Review & post revenue</button></form>}<span className={`accounting-status ${w.status}`}>{w.status}</span></div>; }) : <p className="accounting-empty">No WIP snapshots yet.</p>}</article>
        </div>
      </section>

      <section className="accounting-section">
        <div className="accounting-section-head"><div><small>BANK CONTROL</small><h2>Bank reconciliation</h2></div><Link href="/statements">Open statements →</Link></div>
        <div className="accounting-two-col">
          <article className="accounting-card"><h3>Run reconciliation</h3><form action={reconcileBank} className="accounting-form"><label>Account<select name="financial_account_id" required><option value="">Choose account</option>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.institution_name || "Account"} · {a.account_name}</option>)}</select></label><label>Statement import<select name="statement_import_id"><option value="">Use recorded account balance</option>{imports.map((s: any) => <option key={s.id} value={s.id}>{s.detected_institution_name || s.detected_account_name || "Statement"} · {shortDate(s.period_end)}</option>)}</select></label><label>Period end<input name="period_end" type="date" defaultValue={today} required /></label><button type="submit">Reconcile account</button></form></article>
          <article className="accounting-list-card"><h3>Reconciliation history</h3>{reconciliations.length ? reconciliations.map((r: any) => { const account = Array.isArray(r.account) ? r.account[0] : r.account; return <div className="accounting-row" key={r.id}><div><b>{account?.institution_name || "Account"} · {account?.account_name}</b><span>{shortDate(r.period_end)} · {r.unmatched_statement_rows} unmatched rows</span></div><div className="accounting-row-amount"><strong>{money(r.difference)}</strong><span className={`accounting-status ${r.status}`}>{r.status}</span></div></div>; }) : <p className="accounting-empty">No reconciliations run yet.</p>}</article>
        </div>
      </section>

      <section className="accounting-section">
        <div className="accounting-section-head"><div><small>FINANCIAL STATEMENTS</small><h2>Trial-balance driven company position</h2></div><Link href="/reports">Reporting centre →</Link></div>
        <div className="accounting-three-col">
          <article className="accounting-list-card"><h3>Profit & Loss</h3>{pnl.length ? pnl.map((r: any) => <div className="accounting-mini-row" key={`${r.code}-${r.account_type}`}><span>{r.code} · {r.name}</span><b>{money(r.amount)}</b></div>) : <p className="accounting-empty">No posted P&L activity yet.</p>}<div className="accounting-total"><span>Operating result</span><strong>{money(income - expenses)}</strong></div></article>
          <article className="accounting-list-card"><h3>Balance Sheet</h3>{bs.length ? bs.map((r: any) => <div className="accounting-mini-row" key={`${r.code}-${r.account_type}`}><span>{r.code} · {r.name}</span><b>{money(r.amount)}</b></div>) : <p className="accounting-empty">No posted balance-sheet activity yet.</p>}<div className="accounting-total"><span>Assets / L+E check</span><strong>{money(assets - liabilities - equity)}</strong></div></article>
          <article className="accounting-list-card"><h3>What drives these reports</h3><p>Every posted client invoice, supplier bill, bank settlement, internal transfer and WIP revenue entry is double-entry. Project is a dimension on the same ledger rather than a separate set of books.</p><Link className="accounting-inline-link" href="/audit">Open audit trail →</Link></article>
        </div>
      </section>

      <section className="accounting-section">
        <div className="accounting-section-head"><div><small>PERIOD CONTROL</small><h2>Month close and accounting locks</h2></div></div>
        <div className="accounting-two-col">
          {membership.is_owner && <article className="accounting-card"><h3>Set accounting period</h3><form action={setAccountingPeriod} className="accounting-form"><div><label>Start<input name="period_start" type="date" required /></label><label>End<input name="period_end" type="date" required /></label></div><label>Status<select name="status"><option value="closed">Close period</option><option value="locked">Lock permanently</option><option value="open">Reopen period</option></select></label><label>Notes<input name="notes" placeholder="Month-end close, auditor adjustment window…" /></label><button type="submit">Apply period status</button></form></article>}
          <article className="accounting-list-card"><h3>Accounting periods</h3>{periods.length ? periods.map((p: any) => <div className="accounting-row" key={p.id}><div><b>{shortDate(p.period_start)} – {shortDate(p.period_end)}</b><span>{p.notes || "No notes"}</span></div><span className={`accounting-status ${p.status}`}>{p.status}</span></div>) : <p className="accounting-empty">No periods closed yet. The books are currently open.</p>}</article>
        </div>
      </section>

      <section className="accounting-section">
        <div className="accounting-section-head"><div><small>VISUAL EVIDENCE</small><h2>Receipts, scanned invoices and phone photos</h2></div><Link href="/add">Upload evidence →</Link></div>
        <div className="accounting-list-card"><p>Image/scanned documents are now preserved in an explicit visual-review pipeline instead of being silently guessed. Automatic OCR/vision extraction will plug into this queue when a free or configured vision provider is available.</p>{visual.length ? visual.map((v: any) => { const source = Array.isArray(v.source) ? v.source[0] : v.source; return <div className="accounting-row" key={v.id}><div><b>{source?.file_name ?? "Financial image"}</b><span>{String(source?.document_type ?? "other").replaceAll("_", " ")} · {shortDate(source?.uploaded_at)}</span></div><span className={`accounting-status ${v.extraction_status}`}>{String(v.extraction_status).replaceAll("_", " ")}</span></div>; }) : <p className="accounting-empty">No image/scanned documents are waiting.</p>}</div>
      </section>
    </div>
  </main>;
}

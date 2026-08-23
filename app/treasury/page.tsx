import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { createFinancialAccount, recordInternalTransfer } from "./actions";

const money = (value: number | string | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value));

export default async function TreasuryPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: membership } = await supabase.from("company_memberships").select("id,company_id,is_owner").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) redirect("/login");

  const [{ data: accounts }, { data: projects }, { data: transfers }, { data: obligations }, { data: statements }, { data: positions }] = await Promise.all([
    supabase.from("financial_accounts").select("id,institution_name,account_name,account_type,account_number_masked,current_balance,balance_as_of,last_statement_at,is_active").eq("company_id", membership.company_id).eq("is_active", true).order("institution_name"),
    supabase.from("projects").select("id,project_code,name").eq("company_id", membership.company_id).neq("status", "archived").order("name"),
    supabase.from("transfer_pairs").select("id,transfer_date,amount,status,creates_due_to_from,from_project:projects!transfer_pairs_from_project_id_fkey(project_code,name),to_project:projects!transfer_pairs_to_project_id_fkey(project_code,name),from_account:financial_accounts!transfer_pairs_from_account_id_fkey(account_name,institution_name),to_account:financial_accounts!transfer_pairs_to_account_id_fkey(account_name,institution_name)").eq("company_id", membership.company_id).order("transfer_date", { ascending: false }).limit(30),
    supabase.from("inter_project_obligations").select("id,amount,settled_amount,status,description,creditor:projects!inter_project_obligations_creditor_project_id_fkey(project_code,name),debtor:projects!inter_project_obligations_debtor_project_id_fkey(project_code,name)").eq("company_id", membership.company_id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(30),
    supabase.from("statement_imports").select("id,detected_institution_name,detected_account_name,period_end,status,rows_total,rows_new,rows_already_known,analysed_at").eq("company_id", membership.company_id).order("imported_at", { ascending: false }).limit(8),
    supabase.from("membership_positions").select("position:positions(interface_family),is_primary").eq("membership_id", membership.id),
  ]);

  const primary: any = (positions ?? []).find((row:any)=>row.is_primary) ?? (positions ?? [])[0];
  const canManage = membership.is_owner || primary?.position?.interface_family === "accountant_cfo";
  const cash = (accounts ?? []).reduce((sum:number,row:any)=>sum+Number(row.current_balance||0),0);
  const dueToFrom = (obligations ?? []).reduce((sum:number,row:any)=>sum+Math.max(0,Number(row.amount||0)-Number(row.settled_amount||0)),0);

  return (
    <main className="page-canvas">
      <div className="page-wrap" style={{ maxWidth: 1160 }}>
        <div className="page-toolbar"><Link href="/" className="back-link">← Dashboard</Link><Link href="/statements/upload" className="secondary-link">Upload statements</Link></div>
        <header className="page-heading compact"><p className="page-eyebrow green">Treasury</p><h1>Banking, Cash & Internal Transfers</h1><p>Accounts show where money sits. Projects and categories explain why it moved. Internal transfers do not become revenue or expense.</p></header>
        {query.saved && <div className="notice notice-green" style={{ marginBottom: 12 }}><b>Saved.</b> Treasury record updated.</div>}

        <section className="role-kpis" style={{ marginBottom: 10 }}>
          <article className="role-kpi"><span>Recorded bank / wallet cash</span><strong>{money(cash)}</strong><small>{(accounts ?? []).length} active account(s)</small></article>
          <article className="role-kpi"><span>Open inter-project obligations</span><strong>{money(dueToFrom)}</strong><small>Due-to / due-from, not expense</small></article>
          <article className="role-kpi"><span>Recent statement imports</span><strong>{(statements ?? []).length}</strong><small>Latest imports displayed</small></article>
          <article className="role-kpi"><span>Confirmed transfer pairs</span><strong>{(transfers ?? []).filter((r:any)=>r.status==="confirmed").length}</strong><small>Matched internal movements</small></article>
        </section>

        <section className="access-layout">
          <div className="access-main-column">
            <article className="role-card opay-inspired-card">
              <div className="role-card-head"><div><small>Fast balance view</small><h2>Cash by Bank / Wallet</h2></div><Link href="/statements/upload">Refresh with statements</Link></div>
              <div className="wallet-balance"><small>Total recorded balance</small><strong>{money(cash)}</strong><span>Quick wallet-style overview inspired by the simplicity of OPay. Each balance below remains a separate accounting account.</span></div>
              {(accounts ?? []).length ? (accounts ?? []).map((account:any)=><div className="role-data-line" key={account.id}><div><b>{account.institution_name || account.account_name}</b><small>{account.account_name} · {String(account.account_type).replaceAll("_"," ")}{account.balance_as_of ? ` · as of ${account.balance_as_of}` : ""}</small></div><strong>{money(account.current_balance)}</strong></div>) : <p className="empty-state">No financial account exists after the clean reset. Your fresh OPay, Access Bank and Carbon imports will recreate/detect them.</p>}
            </article>

            <article className="data-card">
              <div className="section-title"><small>Transfers</small><h2>Internal Transfer Register</h2></div>
              {(transfers ?? []).length ? (transfers ?? []).map((row:any)=>{
                const fromAccount:any=Array.isArray(row.from_account)?row.from_account[0]:row.from_account; const toAccount:any=Array.isArray(row.to_account)?row.to_account[0]:row.to_account; const fromProject:any=Array.isArray(row.from_project)?row.from_project[0]:row.from_project; const toProject:any=Array.isArray(row.to_project)?row.to_project[0]:row.to_project;
                return <div className="role-data-line" key={row.id}><div><b>{fromAccount?.institution_name || fromAccount?.account_name || fromProject?.name || "Source"} → {toAccount?.institution_name || toAccount?.account_name || toProject?.name || "Destination"}</b><small>{row.transfer_date} · {row.status}{row.creates_due_to_from ? " · creates due-to/due-from" : ""}</small></div><strong>{money(row.amount)}</strong></div>;
              }) : <p className="empty-state">No internal transfer pair recorded yet.</p>}
            </article>

            <article className="data-card">
              <div className="section-title"><small>Due-to / due-from</small><h2>Inter-Project Obligations</h2></div>
              {(obligations ?? []).length ? (obligations ?? []).map((row:any)=>{ const creditor:any=Array.isArray(row.creditor)?row.creditor[0]:row.creditor; const debtor:any=Array.isArray(row.debtor)?row.debtor[0]:row.debtor; return <div className="role-data-line" key={row.id}><div><b>{creditor?.project_code || "Project"} is owed by {debtor?.project_code || "Project"}</b><small>{row.description || "Inter-project funding movement"} · {row.status}</small></div><strong>{money(Number(row.amount||0)-Number(row.settled_amount||0))}</strong></div>; }) : <p className="empty-state">No open inter-project obligation.</p>}
            </article>
          </div>

          <aside className="access-side-column">
            <article className="data-card">
              <div className="section-title"><small>Statement activity</small><h2>Latest Imports</h2></div>
              {(statements ?? []).map((row:any)=><div className="access-mini-row" key={row.id}><div><b>{row.detected_institution_name || row.detected_account_name || "Statement"}</b><small>{row.rows_total || 0} rows · {row.rows_new || 0} new · {row.rows_already_known || 0} known</small></div><Link href={`/statements/${row.id}`}>Review</Link></div>)}
              {!(statements ?? []).length && <p className="empty-state">No fresh import yet.</p>}
            </article>

            {canManage && <article className="data-card">
              <div className="section-title"><small>Manual setup</small><h2>Add Financial Account</h2><p>Usually statement upload creates the account automatically. Use this only when you need to register an account before its first statement.</p></div>
              <form action={createFinancialAccount} className="access-form-stack">
                <label>Institution<input name="institution_name" required placeholder="OPay, Access Bank, Carbon…" /></label>
                <label>Account label<input name="account_name" required placeholder="Company OPay, Access current…" /></label>
                <label>Account type<select name="account_type" defaultValue="bank"><option value="bank">Bank account</option><option value="fintech_wallet">Fintech wallet</option><option value="cash">Cash</option><option value="petty_cash">Petty cash</option><option value="loan_credit">Loan / credit</option></select></label>
                <label>Account number / masked<input name="account_number" /></label>
                <label>Opening / known balance<input name="opening_balance" type="number" step="0.01" /></label>
                <button type="submit">Add account</button>
              </form>
            </article>}

            {canManage && <article className="data-card">
              <div className="section-title"><small>Non-P&L movement</small><h2>Record Internal Transfer</h2></div>
              <form action={recordInternalTransfer} className="access-form-stack">
                <input type="hidden" name="request_key" value={randomUUID()} />
                <label>Date<input name="transfer_date" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></label>
                <label>Amount<input name="amount" type="number" min="0" step="0.01" required /></label>
                <label>From account<select name="from_account_id" defaultValue=""><option value="">None / external source</option>{(accounts ?? []).map((a:any)=><option key={a.id} value={a.id}>{a.institution_name} · {a.account_name}</option>)}</select></label>
                <label>To account<select name="to_account_id" defaultValue=""><option value="">None / external destination</option>{(accounts ?? []).map((a:any)=><option key={a.id} value={a.id}>{a.institution_name} · {a.account_name}</option>)}</select></label>
                <label>From project<select name="from_project_id" defaultValue=""><option value="">No project</option>{(projects ?? []).map((p:any)=><option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label>
                <label>To project<select name="to_project_id" defaultValue=""><option value="">No project</option>{(projects ?? []).map((p:any)=><option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label>
                <label>Description<input name="description" placeholder="Why was the transfer made?" /></label>
                <label>Reference<input name="reference" placeholder="Transfer reference (optional)" /></label>
                <button type="submit">Record transfer</button>
              </form>
            </article>}
          </aside>
        </section>
      </div>
    </main>
  );
}

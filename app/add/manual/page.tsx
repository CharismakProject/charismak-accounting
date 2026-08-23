import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import ManualTransactionForm from "./ManualTransactionForm";
import { reverseManualTransaction } from "./actions";

const money = (value: number | string | null | undefined) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value || 0));
const defaults = ["Materials", "Labour", "Subcontractor", "Transport / Logistics", "Equipment / Hire", "Site Operations", "Professional Fees", "Staff Costs", "Administration / Office", "Software / IT", "Utilities", "Repairs / Maintenance"];

export default async function ManualEntryPage({ searchParams }: { searchParams: Promise<{ saved?: string; reversed?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/welcome");
  const { data: membership } = await supabase.from("company_memberships").select("company_id").eq("user_id", auth.user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) redirect("/welcome");

  const [{ data: projects }, { data: accounts }, { data: recent }] = await Promise.all([
    supabase.from("projects").select("id,project_code,name").eq("company_id", membership.company_id).neq("status", "archived").order("name"),
    supabase.from("financial_accounts").select("id,institution_name,account_name,current_balance").eq("company_id", membership.company_id).eq("is_active", true).order("institution_name"),
    supabase.from("manual_accounting_entries").select("id,entry_type,approval_request_id,related_transaction_id,created_at,transaction:canonical_transactions!manual_accounting_entries_canonical_transaction_id_fkey(id,transaction_date,narration,signed_amount,classification,project_id,reversed_at,reversal_of,financial_account_id,category_name)").eq("company_id", membership.company_id).order("created_at", { ascending: false }).limit(20),
  ]);
  const projectIds = (projects || []).map((project: any) => project.id);
  const { data: existingCategories } = projectIds.length
    ? await supabase.from("project_cost_categories").select("category_name").in("project_id", projectIds)
    : { data: [] as any[] };
  const categories = Array.from(new Set([...defaults, ...(existingCategories || []).map((row: any) => String(row.category_name)).filter(Boolean)])).sort();

  return <main className="simple-shell"><div className="simple-wrap">
    <div className="simple-top"><Link href="/add">← Add records</Link><span style={{ display: "flex", gap: 12 }}><Link href="/treasury">Accounts</Link><Link href="/projects">Projects</Link></span></div>
    <section className="add-hero"><span>MANUAL-FIRST ACCOUNTING</span><h1>Record money without a statement.</h1><p>Enter what happened once. Charismak posts the transaction, journal, account balance and project position together.</p></section>
    {query.saved === "1" && <div className="notice notice-green"><b>Accounting record posted.</b> The account balance and relevant project summary have been updated.</div>}
    {query.reversed === "1" && <div className="notice notice-amber"><b>Manual record reversed.</b> The original remains in the audit trail and its accounting effect has been cancelled.</div>}
    {!accounts?.length && <div className="notice notice-amber"><b>Add a bank, wallet or cash account first.</b> <Link href="/treasury">Open Treasury →</Link></div>}
    <section className="compact-card"><ManualTransactionForm requestKey={randomUUID()} projects={(projects || []) as any} accounts={(accounts || []) as any} categories={categories} /></section>

    <section className="compact-card" style={{ marginTop: 14 }}>
      <div className="section-title"><small>Audit-friendly history</small><h2>Recent manual records</h2><p>Incorrect standalone records can be reversed. Transfers and approval payments use their own correction workflows.</p></div>
      {(recent || []).length ? <div className="transaction-list">{(recent || []).map((entry: any) => {
        const tx = Array.isArray(entry.transaction) ? entry.transaction[0] : entry.transaction;
        if (!tx) return null;
        const reversible = !entry.related_transaction_id && !entry.approval_request_id && !tx.reversal_of && !tx.reversed_at;
        return <article className="transaction-card confirmed" key={entry.id}>
          <div className="transaction-summary"><span>{tx.transaction_date}</span><div><b>{tx.narration}</b><small>{String(entry.entry_type).replaceAll("_", " ")}{tx.category_name ? ` · ${tx.category_name}` : ""}</small></div><strong className={Number(tx.signed_amount) < 0 ? "negative" : "positive"}>{money(tx.signed_amount)}</strong><em>{tx.reversed_at ? "reversed" : "posted"}</em></div>
          {reversible && <details style={{ marginTop: 8 }}><summary>Reverse this record</summary><form action={reverseManualTransaction} style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 7 }}><input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="transaction_id" value={tx.id} /><input name="reason" placeholder="Why is this being reversed?" required style={{ flex: "1 1 240px" }} /><button type="submit" className="secondary-button">Confirm reversal</button></form></details>}
        </article>;
      })}</div> : <p className="empty-state">No manual accounting records yet.</p>}
    </section>
  </div></main>;
}

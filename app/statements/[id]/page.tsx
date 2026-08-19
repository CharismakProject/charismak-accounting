import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { confirmStatementTransaction } from "./actions";
import AnalyseStatementButton from "./AnalyseStatementButton";

const money = (value: number | string | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value));

const classifications = [
  ["project_expense", "Project expense"],
  ["project_funding", "Project funding / advance"],
  ["company_expense", "Company expense"],
  ["company_income", "Company income"],
  ["personal_non_business", "Personal / non-business"],
  ["internal_transfer", "Internal transfer"],
  ["unknown", "Needs further review"],
] as const;

const categoryOptions = ["Masonry", "Temporary Works", "Ceiling", "Tiling", "Skirting", "Clearing", "Cement", "Plumbing", "Site Operations", "Site Materials", "Labour", "Transport", "Other"];

export default async function StatementReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: statement, error } = await supabase
    .from("statement_imports")
    .select("id, company_id, detected_institution_name, detected_account_name, detected_account_number_masked, period_start, period_end, status, detected_as_new_account, rows_total, rows_new, rows_already_known, rows_need_review, overlapping_import_id, document:source_documents(file_name, uploaded_at, metadata)")
    .eq("id", id)
    .single();
  if (error || !statement) notFound();

  const { data: rows } = await supabase
    .from("statement_rows")
    .select("id, row_index, transaction_date, narration, reference, counterparty, signed_amount, running_balance, detection_status, links:statement_row_transaction_links(is_primary, canonical_transaction:canonical_transactions(id, classification, category_name, status, project_id)), matches:statement_project_matches(confidence, status, project:projects(id, project_code, name))")
    .eq("import_id", id)
    .order("row_index")
    .limit(500);

  const { data: projects } = await supabase
    .from("projects")
    .select("id, project_code, name")
    .eq("company_id", statement.company_id)
    .in("status", ["draft", "active", "on_hold"])
    .order("name");

  const document = Array.isArray((statement as any).document) ? (statement as any).document[0] : (statement as any).document;
  const duplicateNotice = query.duplicate === "1";
  const confirmation = typeof query.confirmed === "string" ? query.confirmed : undefined;
  const showAnalyse = Number((statement as any).rows_total ?? 0) === 0 && ["uploaded", "failed", "needs_review"].includes(String((statement as any).status));

  return (
    <main className="page-shell">
      <div className="content-wrap review-wrap">
        <div className="page-actions">
          <Link href="/statements" className="text-link">← Statement History</Link>
          <div className="button-row">
            <Link href="/projects" className="secondary-button">Projects</Link>
            <Link href="/statements/upload" className="primary-link-button">Upload Next Statement</Link>
          </div>
        </div>

        <header className="compact-header">
          <p className="mini-eyebrow">Import Review</p>
          <h1>{(statement as any).detected_institution_name || "Bank Statement"} · {(statement as any).detected_account_name || "Account"}</h1>
          <p>{document?.file_name} · {(statement as any).period_start || "Period unknown"} → {(statement as any).period_end || "—"}</p>
        </header>

        {duplicateNotice && <div className="notice notice-amber"><b>Exact duplicate detected.</b> This file was already uploaded, so no transactions were added again.</div>}
        {(statement as any).overlapping_import_id && <div className="notice notice-blue"><b>Overlapping period detected.</b> Existing rows are compared before any new transaction is counted.</div>}
        {(statement as any).detected_as_new_account && <div className="notice notice-green"><b>New financial account detected.</b> Future statements using the same account identity will be compared against this account.</div>}
        {confirmation === "historical" && <div className="notice notice-blue"><b>Historical row reconciled.</b> It was recorded as evidence without changing the existing retirement baseline totals.</div>}
        {confirmation === "posted" && <div className="notice notice-green"><b>Transaction confirmed and posted.</b> The relevant project financial summary has been updated.</div>}
        {confirmation === "already" && <div className="notice notice-amber"><b>Already confirmed.</b> This row is already linked to a canonical transaction.</div>}

        {showAnalyse && <AnalyseStatementButton importId={id} />}

        <section className="review-kpis">
          {[["Statement rows",(statement as any).rows_total],["New rows",(statement as any).rows_new],["Already known",(statement as any).rows_already_known],["Need review",(statement as any).rows_need_review]].map(([label,value]) => (
            <div className="mini-card" key={String(label)}><small>{label}</small><b>{value}</b></div>
          ))}
        </section>

        <article className="review-card">
          <div className="review-card-head">
            <div><small>Transaction Review</small><h2>Classify Before Posting</h2></div>
            <span>Nothing affects official project totals until confirmed.</span>
          </div>

          {(rows ?? []).length === 0 ? (
            <div className="empty-review">No transaction rows yet. Analyse the stored PDF above to populate this review.</div>
          ) : (
            <div className="transaction-list">
              {(rows ?? []).map((row: any) => {
                const matches = row.matches ?? [];
                const best = Array.isArray(matches) ? [...matches].sort((a,b)=>Number(b.confidence)-Number(a.confidence))[0] : undefined;
                const suggestedProject = best ? (Array.isArray(best.project) ? best.project[0] : best.project) : null;
                const primaryLink = (row.links ?? []).find((link: any) => link.is_primary);
                const canonical = primaryLink ? (Array.isArray(primaryLink.canonical_transaction) ? primaryLink.canonical_transaction[0] : primaryLink.canonical_transaction) : null;
                const signed = row.signed_amount === null ? null : Number(row.signed_amount);

                return (
                  <section className={`transaction-card ${canonical ? "confirmed" : ""}`} key={row.id}>
                    <div className="transaction-summary">
                      <span>{row.transaction_date || "—"}</span>
                      <div><b>{row.narration || row.counterparty || "Unlabelled transaction"}</b>{row.reference && <small>{row.reference}</small>}</div>
                      <strong className={signed !== null && signed < 0 ? "negative" : "positive"}>{money(row.signed_amount)}</strong>
                      <em>{String(row.detection_status).replaceAll("_"," ")}</em>
                    </div>

                    {canonical ? (
                      <div className="confirmed-strip"><b>Confirmed:</b><span>{String(canonical.classification || "classified").replaceAll("_"," ")}</span>{canonical.category_name && <span>· {canonical.category_name}</span>}<span>· {String(canonical.status || "confirmed").replaceAll("_"," ")}</span></div>
                    ) : (
                      <form action={confirmStatementTransaction} className="classification-form">
                        <input type="hidden" name="statement_row_id" value={row.id} />
                        <input type="hidden" name="import_id" value={id} />
                        <label className="field compact-field">What is this?
                          <select name="classification" defaultValue={signed !== null && signed < 0 ? "project_expense" : "project_funding"}>
                            {classifications.map(([value,name]) => <option key={value} value={value}>{name}</option>)}
                          </select>
                        </label>
                        <label className="field compact-field">Project
                          <select name="project_id" defaultValue={suggestedProject?.id || ""}>
                            <option value="">No project / company-level</option>
                            {(projects ?? []).map((project: any) => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}
                          </select>
                          {suggestedProject && <small className="match-note">{Number(best.confidence).toFixed(0)}% suggested match</small>}
                        </label>
                        <label className="field compact-field">Cost category
                          <select name="category_name" defaultValue="Other">
                            {categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}
                          </select>
                        </label>
                        <button type="submit" className="primary-action compact-button">Confirm</button>
                      </form>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </article>
      </div>
    </main>
  );
}

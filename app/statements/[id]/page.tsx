import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { confirmStatementTransaction } from "./actions";

const money = (value: number | string | null | undefined) => value === null || value === undefined ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value));

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
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: statement, error } = await supabase
    .from("statement_imports")
    .select("id, company_id, detected_institution_name, detected_account_name, detected_account_number_masked, period_start, period_end, status, detected_as_new_account, rows_total, rows_new, rows_already_known, rows_need_review, overlapping_import_id, document:source_documents(file_name, uploaded_at)")
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

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "28px clamp(18px,4vw,54px)" }}>
      <div style={{ maxWidth: 1260, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Link href="/statements" style={{ color: "#0b3253", textDecoration: "none", fontWeight: 800 }}>← Statement History</Link>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/projects" style={{ border: "1px solid #ced9e3", color: "#0b3253", padding: "10px 14px", borderRadius: 10, textDecoration: "none", fontWeight: 800 }}>Projects</Link>
            <Link href="/statements/upload" style={{ background: "#0b3253", color: "white", padding: "10px 14px", borderRadius: 10, textDecoration: "none", fontWeight: 800 }}>Upload Next Statement</Link>
          </div>
        </div>

        <header style={{ margin: "20px 0" }}>
          <p style={{ margin: 0, color: "#16825c", textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 900 }}>Import Review</p>
          <h1 style={{ margin: "6px 0 5px", fontSize: 31, color: "#12283f" }}>{(statement as any).detected_institution_name || "Bank Statement"} · {(statement as any).detected_account_name || "Account"}</h1>
          <p style={{ color: "#718195", margin: 0 }}>{document?.file_name} · {(statement as any).period_start || "Period unknown"} → {(statement as any).period_end || "—"}</p>
        </header>

        {duplicateNotice && <div style={noticeAmber}><b>Exact duplicate detected.</b> This file was already uploaded, so no transactions were added again.</div>}
        {(statement as any).overlapping_import_id && <div style={noticeBlue}><b>Overlapping statement period detected.</b> Existing rows are compared before any new transaction is counted.</div>}
        {(statement as any).detected_as_new_account && <div style={noticeGreen}><b>New financial account detected.</b> Future statements using the same account identity will be compared against this account.</div>}
        {confirmation === "historical" && <div style={noticeBlue}><b>Historical row reconciled.</b> It was recorded as evidence but did not change project totals because it falls inside the existing retirement baseline period.</div>}
        {confirmation === "posted" && <div style={noticeGreen}><b>Transaction confirmed and posted.</b> The relevant project financial summary has been updated.</div>}
        {confirmation === "already" && <div style={noticeAmber}><b>Already confirmed.</b> This statement row is already linked to a canonical transaction.</div>}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: 16 }}>
          {[["Statement rows",(statement as any).rows_total],["New rows",(statement as any).rows_new],["Already known",(statement as any).rows_already_known],["Need review",(statement as any).rows_need_review]].map(([label,value]) => <div key={String(label)} style={card}><small style={{ color: "#7b8997" }}>{label}</small><b style={{ display: "block", marginTop: 5, fontSize: 21 }}>{value}</b></div>)}
        </section>

        <article style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <div><small style={{ color: "#16825c", fontWeight: 900, textTransform: "uppercase" }}>Transaction review</small><h2 style={{ margin: "3px 0 0" }}>Classify Before Posting</h2></div>
            <span style={{ color: "#7b8997", fontSize: 12 }}>Nothing affects official project totals until confirmed</span>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {(rows ?? []).map((row: any) => {
              const matches = row.matches ?? [];
              const best = Array.isArray(matches) ? [...matches].sort((a,b)=>Number(b.confidence)-Number(a.confidence))[0] : undefined;
              const suggestedProject = best ? (Array.isArray(best.project) ? best.project[0] : best.project) : null;
              const primaryLink = (row.links ?? []).find((link: any) => link.is_primary);
              const canonical = primaryLink ? (Array.isArray(primaryLink.canonical_transaction) ? primaryLink.canonical_transaction[0] : primaryLink.canonical_transaction) : null;
              const signed = Number(row.signed_amount ?? 0);

              return (
                <section key={row.id} style={{ border: "1px solid #e4eaf0", borderRadius: 14, padding: 14, background: canonical ? "#f8fafc" : "white" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "92px minmax(220px,1.5fr) 130px 145px", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#647789" }}>{row.transaction_date || "—"}</span>
                    <div><b style={{ display: "block", color: "#172b40" }}>{row.narration || row.counterparty || "Unlabelled transaction"}</b>{row.reference && <small style={{ color: "#82909e" }}>{row.reference}</small>}</div>
                    <b style={{ color: signed < 0 ? "#b84a4a" : "#16825c" }}>{money(row.signed_amount)}</b>
                    <span style={{ fontWeight: 800, fontSize: 12, color: row.detection_status === "new" ? "#16825c" : row.detection_status === "already_known" ? "#60758a" : "#9a6907" }}>{String(row.detection_status).replaceAll("_"," ")}</span>
                  </div>

                  {canonical ? (
                    <div style={{ marginTop: 10, padding: 10, background: "#eef4f8", borderRadius: 10, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
                      <b>Confirmed:</b><span>{String(canonical.classification || "classified").replaceAll("_"," ")}</span>{canonical.category_name && <span>· {canonical.category_name}</span>}<span>· {String(canonical.status || "confirmed").replaceAll("_"," ")}</span>
                    </div>
                  ) : (
                    <form action={confirmStatementTransaction} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #edf1f4", display: "grid", gridTemplateColumns: "1.05fr 1.15fr 1fr auto", gap: 10, alignItems: "end" }}>
                      <input type="hidden" name="statement_row_id" value={row.id} />
                      <input type="hidden" name="import_id" value={id} />
                      <label style={label}>What is this?
                        <select name="classification" defaultValue={signed < 0 ? "project_expense" : "project_funding"} style={input}>
                          {classifications.map(([value,name]) => <option key={value} value={value}>{name}</option>)}
                        </select>
                      </label>
                      <label style={label}>Project
                        <select name="project_id" defaultValue={suggestedProject?.id || ""} style={input}>
                          <option value="">No project / company-level</option>
                          {(projects ?? []).map((project: any) => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}
                        </select>
                        {suggestedProject && <small style={{ color: "#16825c", marginTop: 2 }}>{Number(best.confidence).toFixed(0)}% suggested match</small>}
                      </label>
                      <label style={label}>Cost category
                        <select name="category_name" defaultValue="Other" style={input}>
                          {categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </label>
                      <button type="submit" style={{ border: 0, borderRadius: 10, padding: "11px 15px", background: "#0b3253", color: "white", fontWeight: 850, minHeight: 42 }}>Confirm</button>
                    </form>
                  )}
                </section>
              );
            })}
          </div>
        </article>
      </div>
    </main>
  );
}

const card = { background: "white", border: "1px solid #dde6ee", borderRadius: 15, padding: 16, boxShadow: "0 8px 24px rgba(24,48,75,.045)" } as const;
const label = { display: "grid", gap: 5, fontSize: 11, fontWeight: 800, color: "#41566b" } as const;
const input = { width: "100%", border: "1px solid #cfdae4", borderRadius: 9, padding: "9px 10px", background: "white", fontSize: 12 } as const;
const noticeAmber = { background: "#fff4df", border: "1px solid #edd7a6", color: "#8d650b", padding: 14, borderRadius: 12, marginBottom: 14 } as const;
const noticeBlue = { background: "#eef5ff", border: "1px solid #d3e2f6", color: "#315d8d", padding: 14, borderRadius: 12, marginBottom: 14 } as const;
const noticeGreen = { background: "#eef8f4", border: "1px solid #cde9de", color: "#196a4d", padding: 14, borderRadius: 12, marginBottom: 14 } as const;

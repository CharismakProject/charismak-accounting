import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { confirmStatementTransaction } from "./actions";
import { ignoreCandidate, linkCandidateToProject } from "./candidate-actions";
import AnalyseStatementButton from "./AnalyseStatementButton";
import DiscoverProjectsButton from "./DiscoverProjectsButton";

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
const PAGE_SIZE = 50;

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

  const page = Math.max(1, Number(typeof query.page === "string" ? query.page : "1") || 1);
  const keyword = typeof query.keyword === "string" ? query.keyword.trim() : "";
  const offset = (page - 1) * PAGE_SIZE;

  let rowsQuery = supabase
    .from("statement_rows")
    .select("id, row_index, transaction_date, narration, reference, counterparty, signed_amount, running_balance, detection_status, links:statement_row_transaction_links(is_primary, canonical_transaction:canonical_transactions(id, classification, category_name, status, project_id)), matches:statement_project_matches(confidence, status, project:projects(id, project_code, name))", { count: "exact" })
    .eq("import_id", id)
    .order("row_index");
  if (keyword) rowsQuery = rowsQuery.ilike("narration", `%${keyword}%`);
  const { data: rows, count: filteredCount } = await rowsQuery.range(offset, offset + PAGE_SIZE - 1);

  const { data: projects } = await supabase
    .from("projects")
    .select("id, project_code, name")
    .eq("company_id", statement.company_id)
    .in("status", ["draft", "active", "on_hold"])
    .order("name");

  const { data: discoveryRaw } = Number((statement as any).rows_total ?? 0) > 0
    ? await supabase.rpc("statement_project_discovery_summary", { target_import: id })
    : { data: null } as any;
  const discovery: any = discoveryRaw ?? { existing_projects: [], candidates: [] };
  const existingProjects: any[] = Array.isArray(discovery.existing_projects) ? discovery.existing_projects : [];
  const candidates: any[] = Array.isArray(discovery.candidates) ? discovery.candidates : [];

  const document = Array.isArray((statement as any).document) ? (statement as any).document[0] : (statement as any).document;
  const duplicateNotice = query.duplicate === "1";
  const confirmation = typeof query.confirmed === "string" ? query.confirmed : undefined;
  const candidateNotice = typeof query.candidate === "string" ? query.candidate : undefined;
  const showAnalyse = Number((statement as any).rows_total ?? 0) === 0 && ["uploaded", "failed", "needs_review"].includes(String((statement as any).status));
  const totalFiltered = Number(filteredCount ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const baseParams = keyword ? `keyword=${encodeURIComponent(keyword)}&` : "";

  return (
    <main className="page-shell">
      <div className="content-wrap review-wrap">
        <div className="page-actions">
          <div className="button-row">
            <Link href="/" className="text-link">← Dashboard</Link>
            <Link href="/statements" className="text-link">Statement History</Link>
          </div>
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
        {confirmation === "historical" && <div className="notice notice-blue"><b>Historical row reconciled.</b> It was recorded as evidence without changing the existing project baseline totals.</div>}
        {confirmation === "posted" && <div className="notice notice-green"><b>Transaction confirmed and posted.</b> The relevant project financial summary has been updated.</div>}
        {confirmation === "already" && <div className="notice notice-amber"><b>Already confirmed.</b> This row is already linked to a canonical transaction.</div>}
        {candidateNotice === "created" && <div className="notice notice-green"><b>Project created from statement signal.</b> Matching rows were linked for review; nothing was posted automatically.</div>}
        {candidateNotice === "linked" && <div className="notice notice-green"><b>Keyword linked to existing project.</b> Matching rows are now suggested against that project.</div>}
        {candidateNotice === "ignored" && <div className="notice notice-amber"><b>Candidate ignored.</b> Its transactions remain available for normal classification.</div>}

        {showAnalyse && <AnalyseStatementButton importId={id} />}

        <section className="review-kpis">
          {[["Statement rows",(statement as any).rows_total],["New vs known records",(statement as any).rows_new],["Already known",(statement as any).rows_already_known],["Parser exceptions",(statement as any).rows_need_review]].map(([label,value]) => (
            <div className="mini-card" key={String(label)}><small>{label}</small><b>{value}</b></div>
          ))}
        </section>

        {Number((statement as any).rows_total ?? 0) > 0 && (
          <article className="review-card" style={{ marginBottom: 14 }}>
            <div className="review-card-head">
              <div><small>Project Discovery</small><h2>Projects & Keywords Found</h2></div>
              <DiscoverProjectsButton importId={id} compact={existingProjects.length > 0 || candidates.length > 0} />
            </div>
            <p style={{ margin: "0 0 12px", color: "#65778b", fontSize: 12 }}>Review project signals before classifying individual rows. Suggestions never create projects or post transactions by themselves.</p>

            {existingProjects.length > 0 && (
              <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                <b style={{ fontSize: 12, color: "#1b354f" }}>Existing projects detected</b>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 8 }}>
                  {existingProjects.map((match: any) => (
                    <div key={match.project_id} style={{ border: "1px solid #dbe5ed", borderRadius: 11, padding: 11, background: "#fbfdff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 12 }}>{match.project_code} · {match.project_name}</b><span style={{ fontSize: 10, color: "#16825c", fontWeight: 800 }}>{Number(match.max_confidence || 0).toFixed(0)}%</span></div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 8, fontSize: 10 }}>
                        <span><small style={{ display: "block", color: "#82909e" }}>Matched</small><b>{match.matched_rows} rows</b></span>
                        <span><small style={{ display: "block", color: "#82909e" }}>Money in</small><b>{money(match.money_in)}</b></span>
                        <span><small style={{ display: "block", color: "#82909e" }}>Money out</small><b>{money(match.money_out)}</b></span>
                      </div>
                      <Link href={`/projects/${match.project_id}`} style={{ display: "inline-block", marginTop: 9, color: "#0b5ea8", fontSize: 10, fontWeight: 800 }}>Open project →</Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {candidates.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                <b style={{ fontSize: 12, color: "#1b354f" }}>Possible new projects / project tags</b>
                {candidates.slice(0, 15).map((candidate: any) => {
                  const evidence = candidate.evidence ?? {};
                  const samples: string[] = Array.isArray(evidence.sample_memos) ? evidence.sample_memos : [];
                  const createHref = `/projects/new?candidate=${encodeURIComponent(candidate.id)}&import=${encodeURIComponent(id)}&name=${encodeURIComponent(candidate.suggested_name || evidence.keyword || "")}&code=${encodeURIComponent(candidate.suggested_code || "")}`;
                  return (
                    <div key={candidate.id} style={{ border: "1px solid #e2e8ee", borderRadius: 11, padding: 11, background: "white", display: "grid", gap: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div><b style={{ fontSize: 13 }}>{candidate.suggested_name}</b><span style={{ marginLeft: 7, fontSize: 10, color: "#7b8998" }}>{evidence.transaction_count || 0} transactions · {money(evidence.money_out)} out · {money(evidence.money_in)} in</span></div>
                        <span style={{ fontSize: 10, color: "#9a6712", fontWeight: 800 }}>{Number(candidate.confidence || 0).toFixed(0)}% signal</span>
                      </div>
                      {samples.length > 0 && <p style={{ margin: 0, fontSize: 10, color: "#687a8c" }}>Examples: {samples.slice(0,3).join(" · ")}</p>}
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "end" }}>
                        <Link href={createHref} className="primary-link-button">Create Project</Link>
                        <form action={linkCandidateToProject} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <input type="hidden" name="candidate_id" value={candidate.id} /><input type="hidden" name="import_id" value={id} />
                          <select name="project_id" required style={{ minWidth: 190, border: "1px solid #cfd9e3", borderRadius: 8, padding: "7px 8px", fontSize: 11 }} defaultValue="">
                            <option value="" disabled>Link to existing project…</option>
                            {(projects ?? []).map((project: any) => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}
                          </select>
                          <button className="secondary-button" type="submit">Link</button>
                        </form>
                        <Link href={`/statements/${id}?keyword=${encodeURIComponent(evidence.keyword || candidate.suggested_name)}&page=1#transactions`} className="secondary-button">Review rows</Link>
                        <form action={ignoreCandidate}><input type="hidden" name="candidate_id" value={candidate.id} /><input type="hidden" name="import_id" value={id} /><button className="secondary-button" type="submit">Ignore</button></form>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ border: "1px dashed #cfdbe5", borderRadius: 10, padding: 12, color: "#718195", fontSize: 11 }}>No unresolved keyword candidates yet. Run <b>Find projects & keywords</b> to scan the analysed transactions.</div>
            )}
          </article>
        )}

        <article className="review-card" id="transactions">
          <div className="review-card-head">
            <div><small>Transaction Review</small><h2>{keyword ? `Rows containing “${keyword}”` : "Classify Before Posting"}</h2></div>
            <span>{keyword ? `${totalFiltered} matching rows` : `Showing ${Math.min(offset + 1, totalFiltered)}–${Math.min(offset + PAGE_SIZE, totalFiltered)} of ${totalFiltered}`}</span>
          </div>
          {keyword && <div style={{ marginBottom: 10 }}><Link href={`/statements/${id}#transactions`} className="text-link">Clear keyword filter</Link></div>}

          {(rows ?? []).length === 0 ? (
            <div className="empty-review">{Number((statement as any).rows_total ?? 0) === 0 ? "No transaction rows yet. Analyse the stored statement above to populate this review." : "No transactions match this filter."}</div>
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
                        <input type="hidden" name="statement_row_id" value={row.id} /><input type="hidden" name="import_id" value={id} />
                        <label className="field compact-field">What is this?<select name="classification" defaultValue={signed !== null && signed < 0 ? "project_expense" : "project_funding"}>{classifications.map(([value,name]) => <option key={value} value={value}>{name}</option>)}</select></label>
                        <label className="field compact-field">Project<select name="project_id" defaultValue={suggestedProject?.id || ""}><option value="">No project / company-level</option>{(projects ?? []).map((project: any) => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}</select>{suggestedProject && <small className="match-note">{Number(best.confidence).toFixed(0)}% suggested match</small>}</label>
                        <label className="field compact-field">Cost category<select name="category_name" defaultValue="Other">{categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
                        <button type="submit" className="primary-action compact-button">Confirm</button>
                      </form>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <span style={{ color: "#718195", fontSize: 11 }}>Page {page} of {totalPages} · 50 rows per page</span>
              <div style={{ display: "flex", gap: 7 }}>
                {page > 1 && <Link className="secondary-button" href={`/statements/${id}?${baseParams}page=${page - 1}#transactions`}>← Previous</Link>}
                {page < totalPages && <Link className="secondary-button" href={`/statements/${id}?${baseParams}page=${page + 1}#transactions`}>Next →</Link>}
              </div>
            </div>
          )}
        </article>
      </div>
    </main>
  );
}

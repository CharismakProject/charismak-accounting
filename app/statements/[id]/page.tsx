import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

const money = (value: number | string | null | undefined) => value === null || value === undefined ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value));

export default async function StatementReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: statement, error } = await supabase
    .from("statement_imports")
    .select("id, detected_institution_name, detected_account_name, detected_account_number_masked, period_start, period_end, status, detected_as_new_account, rows_total, rows_new, rows_already_known, rows_need_review, overlapping_import_id, document:source_documents(file_name, uploaded_at)")
    .eq("id", id)
    .single();
  if (error || !statement) notFound();

  const { data: rows } = await supabase
    .from("statement_rows")
    .select("id, row_index, transaction_date, narration, reference, counterparty, signed_amount, running_balance, detection_status, matches:statement_project_matches(confidence, status, project:projects(id, project_code, name))")
    .eq("import_id", id)
    .order("row_index")
    .limit(500);

  const document = Array.isArray((statement as any).document) ? (statement as any).document[0] : (statement as any).document;
  const duplicateNotice = query.duplicate === "1";

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "28px clamp(18px,4vw,54px)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Link href="/statements" style={{ color: "#0b3253", textDecoration: "none", fontWeight: 800 }}>← Statement History</Link>
          <Link href="/statements/upload" style={{ background: "#0b3253", color: "white", padding: "10px 14px", borderRadius: 10, textDecoration: "none", fontWeight: 800 }}>Upload Next Statement</Link>
        </div>

        <header style={{ margin: "20px 0" }}>
          <p style={{ margin: 0, color: "#16825c", textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 900 }}>Import Review</p>
          <h1 style={{ margin: "6px 0 5px", fontSize: 31, color: "#12283f" }}>{(statement as any).detected_institution_name || "Bank Statement"} · {(statement as any).detected_account_name || "Account"}</h1>
          <p style={{ color: "#718195", margin: 0 }}>{document?.file_name} · {(statement as any).period_start || "Period unknown"} → {(statement as any).period_end || "—"}</p>
        </header>

        {duplicateNotice && <div style={{ background: "#fff4df", border: "1px solid #edd7a6", color: "#8d650b", padding: 14, borderRadius: 12, marginBottom: 14 }}><b>Exact duplicate detected.</b> This file was already uploaded, so no transactions were added again.</div>}
        {(statement as any).overlapping_import_id && <div style={{ background: "#eef5ff", border: "1px solid #d3e2f6", color: "#315d8d", padding: 14, borderRadius: 12, marginBottom: 14 }}><b>Overlapping statement period detected.</b> Existing rows are compared before any new transaction is counted.</div>}
        {(statement as any).detected_as_new_account && <div style={{ background: "#eef8f4", border: "1px solid #cde9de", color: "#196a4d", padding: 14, borderRadius: 12, marginBottom: 14 }}><b>New financial account detected.</b> Future statements using the same account identity will be compared against this account.</div>}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: 16 }}>
          {[['Statement rows',(statement as any).rows_total],['New rows',(statement as any).rows_new],['Already known',(statement as any).rows_already_known],['Need review',(statement as any).rows_need_review]].map(([label,value]) => <div key={String(label)} style={card}><small style={{ color: "#7b8997" }}>{label}</small><b style={{ display: "block", marginTop: 5, fontSize: 21 }}>{value}</b></div>)}
        </section>

        <article style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}><div><small style={{ color: "#16825c", fontWeight: 900, textTransform: "uppercase" }}>Transaction review</small><h2 style={{ margin: "3px 0 0" }}>Rows & Project Matches</h2></div><span style={{ color: "#7b8997", fontSize: 12 }}>Nothing posts automatically</span></div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 900 }}>
              <div style={{ display: "grid", gridTemplateColumns: "90px 1.7fr 130px 120px 1fr", gap: 10, padding: "9px 8px", color: "#82909e", fontSize: 11, fontWeight: 900, textTransform: "uppercase", borderBottom: "1px solid #e5ebf0" }}><span>Date</span><span>Narration</span><span>Amount</span><span>Detection</span><span>Suggested project</span></div>
              {(rows ?? []).map((row: any) => {
                const matches = row.matches ?? [];
                const best = Array.isArray(matches) ? [...matches].sort((a,b)=>Number(b.confidence)-Number(a.confidence))[0] : undefined;
                const project = best ? (Array.isArray(best.project) ? best.project[0] : best.project) : null;
                return <div key={row.id} style={{ display: "grid", gridTemplateColumns: "90px 1.7fr 130px 120px 1fr", gap: 10, padding: "11px 8px", alignItems: "center", borderBottom: "1px solid #eef2f5", fontSize: 12 }}>
                  <span>{row.transaction_date || "—"}</span>
                  <span><b>{row.narration || row.counterparty || "Unlabelled transaction"}</b>{row.reference && <small style={{ display: "block", color: "#82909e", marginTop: 3 }}>{row.reference}</small>}</span>
                  <b style={{ color: Number(row.signed_amount) < 0 ? "#b84a4a" : "#16825c" }}>{money(row.signed_amount)}</b>
                  <span style={{ fontWeight: 800, color: row.detection_status === "new" ? "#16825c" : row.detection_status === "already_known" ? "#60758a" : "#9a6907" }}>{String(row.detection_status).replaceAll("_"," ")}</span>
                  <span>{project ? <><b>{project.project_code} · {project.name}</b><small style={{ display: "block", color: "#16825c", marginTop: 3 }}>{Number(best.confidence).toFixed(0)}% match</small></> : <span style={{ color: "#8a98a5" }}>Unclassified / possible new project</span>}</span>
                </div>;
              })}
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}

const card = { background: "white", border: "1px solid #dde6ee", borderRadius: 15, padding: 16, boxShadow: "0 8px 24px rgba(24,48,75,.045)" } as const;

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import BulkResolvePanel from "../BulkResolvePanel";

export default async function BulkStatementReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ keyword?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const keyword = String(query.keyword || "").trim();
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: statement, error } = await supabase
    .from("statement_imports")
    .select("id,detected_institution_name,detected_account_name,period_start,period_end,rows_total,rows_auto_posted,rows_pending_review,rows_already_known,document:source_documents(file_name)")
    .eq("id", id)
    .single();
  if (error || !statement) notFound();

  const { data: unresolved } = await supabase.rpc("statement_review_queue", {
    target_import: id,
    target_view: "review",
    target_keyword: keyword || null,
    target_limit: 1,
    target_offset: 0,
  });
  const unresolvedCount = Number((unresolved ?? [])[0]?.total_count ?? 0);
  const document: any = Array.isArray((statement as any).document) ? (statement as any).document[0] : (statement as any).document;

  return (
    <main className="page-canvas">
      <div className="page-wrap narrow">
        <div className="page-toolbar">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" className="back-link">← Dashboard</Link>
            <Link href={`/statements/${id}`} className="secondary-link">Statement review</Link>
          </div>
          <Link href="/statements" className="md-button">Statement History</Link>
        </div>

        <header className="page-heading compact">
          <p className="page-eyebrow green">Bulk review</p>
          <h1>{statement.detected_institution_name || "Statement"} · {statement.detected_account_name || "Account"}</h1>
          <p>{document?.file_name} · {statement.period_start || "Period unknown"} → {statement.period_end || "—"}</p>
        </header>

        {query.error && <div className="notice notice-amber"><b>Bulk action not completed.</b> {query.error}</div>}

        <section className="review-kpis" style={{ marginBottom: 12 }}>
          {[
            ["Rows", statement.rows_total],
            ["Auto-posted", statement.rows_auto_posted],
            ["Needs action", statement.rows_pending_review],
            ["Already known", statement.rows_already_known],
          ].map(([label, value]) => <div className="mini-card" key={String(label)}><small>{label}</small><b>{Number(value || 0).toLocaleString()}</b></div>)}
        </section>

        <article className="compact-card" style={{ marginBottom: 12 }}>
          <b style={{ display: "block", marginBottom: 5 }}>Use bulk actions only after project detection</b>
          <p style={{ margin: 0, color: "#718195", fontSize: 11, lineHeight: 1.55 }}>
            Transactions confidently linked to projects should post automatically. Bulk actions below are for the remaining rows you have decided are company-level, personal, transfers, or simply not project transactions.
          </p>
          {keyword && <p style={{ margin: "9px 0 0", fontSize: 11 }}><b>Current filter:</b> {keyword} · <Link href={`/statements/${id}/bulk`}>Clear filter</Link></p>}
        </article>

        <BulkResolvePanel importId={id} keyword={keyword} unresolvedCount={unresolvedCount} />
      </div>
    </main>
  );
}

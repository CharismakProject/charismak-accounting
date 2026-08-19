import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export default async function StatementsPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: imports, error } = await supabase
    .from("statement_imports")
    .select("id, detected_institution_name, detected_account_name, period_start, period_end, status, detected_as_new_account, rows_total, rows_new, rows_already_known, rows_need_review, rows_auto_posted, rows_pending_review, overlapping_import_id, document:source_documents(file_name, uploaded_at)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <main className="page-canvas">
      <div className="page-wrap">
        <div className="page-toolbar">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" className="back-link">← Dashboard</Link>
            <Link href="/projects" className="secondary-link">Projects</Link>
          </div>
          <Link href="/statements/upload" className="md-button">Upload Statement</Link>
        </div>

        <header className="page-heading compact">
          <p className="page-eyebrow green">Banking</p>
          <h1>Statement History</h1>
          <p>Monthly imports are compared against prior uploads before anything is counted again.</p>
        </header>

        <section style={{ display: "grid", gap: 10 }}>
          {(imports ?? []).length === 0 && (
            <article className="compact-card">
              <h2 style={{ marginTop: 0 }}>No statements uploaded yet</h2>
              <p style={{ color: "#718195", marginBottom: 0 }}>Upload the first bank statement and the system will establish the account and comparison baseline.</p>
            </article>
          )}

          {(imports ?? []).map((item: any) => {
            const document = Array.isArray(item.document) ? item.document[0] : item.document;
            const pending = Number(item.rows_pending_review ?? item.rows_new ?? 0);
            const posted = Number(item.rows_auto_posted ?? 0);
            return (
              <article className="compact-card" key={item.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <b style={{ fontSize: 14 }}>{item.detected_institution_name || "Bank"} · {item.detected_account_name || "Account"}</b>
                    <p style={{ margin: "4px 0 0", color: "#7b8998", fontSize: 11 }}>{document?.file_name} · {item.period_start || "Period unknown"} → {item.period_end || "—"}</p>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: item.status === "confirmed" ? "#16825c" : "#9b6b05" }}>{String(item.status).replaceAll("_", " ")}</span>
                </div>
                <div className="statement-history-kpis">
                  {[['Rows', item.rows_total], ['Auto-posted', posted], ['Needs action', pending], ['Already known', item.rows_already_known]].map(([label,value]) => (
                    <div key={String(label)}>
                      <small>{label}</small>
                      <b>{Number(value || 0).toLocaleString()}</b>
                    </div>
                  ))}
                </div>
                {(item.detected_as_new_account || item.overlapping_import_id) && <p style={{ margin: "9px 0 0", fontSize: 10, color: "#8a6616" }}>{item.detected_as_new_account ? "New financial account detected. " : ""}{item.overlapping_import_id ? "This statement overlaps a previous import." : ""}</p>}
                <div className="statement-history-actions">
                  <Link href={`/statements/${item.id}`}>Open review</Link>
                  {pending > 0 && <Link href={`/statements/${item.id}/bulk`}>Bulk review</Link>}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

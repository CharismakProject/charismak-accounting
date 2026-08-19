import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export default async function StatementsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: imports, error } = await supabase
    .from("statement_imports")
    .select("id, detected_institution_name, detected_account_name, period_start, period_end, status, detected_as_new_account, rows_total, rows_new, rows_already_known, rows_need_review, overlapping_import_id, document:source_documents(file_name, uploaded_at)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "28px clamp(18px,4vw,54px)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: "#16825c", textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 900 }}>Banking</p>
          <h1 style={{ margin: "6px 0 4px", color: "#12283f", fontSize: 32 }}>Statement History</h1>
          <p style={{ margin: 0, color: "#718195" }}>Monthly imports are compared against prior uploads before anything is counted again.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/projects" style={secondary}>Projects</Link>
          <Link href="/statements/upload" style={primary}>Upload Statement</Link>
        </div>
      </header>

      <section style={{ display: "grid", gap: 12 }}>
        {(imports ?? []).length === 0 && <article style={card}><h2>No statements uploaded yet</h2><p style={{ color: "#718195" }}>Upload the first bank statement and the system will establish the account and comparison baseline.</p></article>}
        {(imports ?? []).map((item: any) => {
          const document = Array.isArray(item.document) ? item.document[0] : item.document;
          return (
            <Link href={`/statements/${item.id}`} key={item.id} style={{ textDecoration: "none", color: "inherit" }}>
              <article style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <b style={{ fontSize: 17 }}>{item.detected_institution_name || "Bank"} · {item.detected_account_name || "Account"}</b>
                    <p style={{ margin: "5px 0 0", color: "#7b8998", fontSize: 13 }}>{document?.file_name} · {item.period_start || "Period unknown"} → {item.period_end || "—"}</p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: item.status === "confirmed" ? "#16825c" : "#9b6b05" }}>{item.status.replaceAll("_", " ")}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 9, marginTop: 16 }}>
                  {[['Rows', item.rows_total], ['New', item.rows_new], ['Already known', item.rows_already_known], ['Need review', item.rows_need_review]].map(([label,value]) => <div key={String(label)} style={{ background: "#f8fafc", borderRadius: 10, padding: 10 }}><small style={{ color: "#81909f" }}>{label}</small><b style={{ display: "block", marginTop: 3 }}>{value}</b></div>)}
                </div>
                {(item.detected_as_new_account || item.overlapping_import_id) && <p style={{ margin: "12px 0 0", fontSize: 12, color: "#8a6616" }}>{item.detected_as_new_account ? "New financial account detected. " : ""}{item.overlapping_import_id ? "This statement overlaps a previous import." : ""}</p>}
              </article>
            </Link>
          );
        })}
      </section>
    </main>
  );
}

const card = { background: "white", border: "1px solid #dde6ee", borderRadius: 16, padding: 18, boxShadow: "0 8px 26px rgba(24,48,75,.05)" } as const;
const primary = { background: "#0b3253", color: "white", padding: "11px 15px", borderRadius: 10, textDecoration: "none", fontWeight: 800 } as const;
const secondary = { background: "white", color: "#0b3253", border: "1px solid #ced9e3", padding: "11px 15px", borderRadius: 10, textDecoration: "none", fontWeight: 800 } as const;

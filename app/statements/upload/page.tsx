import Link from "next/link";
import { uploadStatement } from "../actions";

export default function UploadStatementPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "28px clamp(18px,4vw,54px)" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <Link href="/statements" style={{ color: "#0b3253", textDecoration: "none", fontWeight: 800 }}>← Statement History</Link>
        <header style={{ margin: "20px 0" }}>
          <p style={{ margin: 0, color: "#16825c", textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 900 }}>Recurring Import</p>
          <h1 style={{ margin: "6px 0 6px", fontSize: 32, color: "#12283f" }}>Upload Bank Statement</h1>
          <p style={{ color: "#718195", margin: 0 }}>Upload the latest statement for an existing or new company account. The system compares it with prior imports before adding new transactions.</p>
        </header>

        <form action={uploadStatement} style={{ background: "white", border: "1px solid #dde6ee", borderRadius: 18, padding: 22, display: "grid", gap: 16 }}>
          <label style={label}>Bank / institution<input name="institution_name" placeholder="e.g. Access Bank" style={input} /></label>
          <label style={label}>Account label<input required name="account_name" placeholder="e.g. Jahi Access Account" style={input} /><small style={hint}>Use the same label for the same account on future monthly uploads.</small></label>
          <label style={label}>Account number / masked account<input name="account_number_masked" placeholder="e.g. ******1234" style={input} /></label>
          <label style={label}>Statement file<input required name="statement" type="file" accept=".csv,.pdf,.xls,.xlsx" style={{ ...input, background: "#fafcfe" }} /><small style={hint}>CSV is parsed immediately. PDF/XLS/XLSX are stored securely now and will use bank-specific parsing as we test real samples.</small></label>
          <div style={{ background: "#f5f9fc", borderRadius: 12, padding: 14, fontSize: 13, color: "#52687c" }}>
            <b style={{ color: "#173a58" }}>What the app checks:</b><br/>exact duplicate file · same/new bank account · overlapping period · already-known rows · new transactions · existing project matches · possible new projects.
          </div>
          <button type="submit" style={{ border: 0, borderRadius: 12, padding: 13, background: "#0b3253", color: "white", fontWeight: 850 }}>Upload & Analyse Statement</button>
        </form>
      </div>
    </main>
  );
}

const label = { display: "grid", gap: 7, fontSize: 12, fontWeight: 800, color: "#233b52" } as const;
const input = { width: "100%", border: "1px solid #ccd8e3", borderRadius: 10, padding: "11px 12px", fontSize: 14 } as const;
const hint = { fontWeight: 500, color: "#7c8b99", lineHeight: 1.4 } as const;

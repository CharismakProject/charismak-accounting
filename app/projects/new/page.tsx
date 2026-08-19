import Link from "next/link";
import { createProject } from "../actions";

const field = { width: "100%", border: "1px solid #d3dde6", borderRadius: 10, padding: "10px 11px", fontSize: 14 } as const;
const label = { display: "grid", gap: 6, fontSize: 12, fontWeight: 800, color: "#31475d" } as const;

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const candidateId = typeof query.candidate === "string" ? query.candidate : "";
  const importId = typeof query.import === "string" ? query.import : "";
  const suggestedName = typeof query.name === "string" ? query.name : "";
  const suggestedCode = typeof query.code === "string" ? query.code : "";
  const returnHref = importId ? `/statements/${importId}` : "/projects";

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "24px clamp(16px,4vw,48px)" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#0b3253", textDecoration: "none", fontWeight: 800 }}>← Dashboard</Link>
          <Link href={returnHref} style={{ color: "#1f6fe5", textDecoration: "none", fontWeight: 800 }}>{importId ? "Statement review" : "Projects"}</Link>
        </div>
        <header style={{ margin: "14px 0 18px" }}>
          <p style={{ margin: 0, color: "#1f6fe5", textTransform: "uppercase", letterSpacing: ".14em", fontSize: 10, fontWeight: 900 }}>{candidateId ? "Statement candidate" : "Create"}</p>
          <h1 style={{ margin: "5px 0", fontSize: "clamp(24px,3vw,30px)", color: "#12283f" }}>{candidateId ? `Create Project from ${suggestedName || "Keyword"}` : "New Project"}</h1>
          <p style={{ margin: 0, color: "#718195", fontSize: 13 }}>{candidateId ? "The statement keyword is only a suggestion. Confirm the actual project identity before creating it." : "Create the project first. Funding, transactions, BOQ and deeper cost control can be added afterwards."}</p>
        </header>

        <form action={createProject} style={{ background: "white", border: "1px solid #dde6ee", borderRadius: 16, padding: "clamp(16px,3vw,22px)", display: "grid", gap: 16 }}>
          {candidateId && <input type="hidden" name="candidate_id" value={candidateId} />}
          {importId && <input type="hidden" name="import_id" value={importId} />}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 13 }}>
            <label style={label}>Project code<input name="project_code" required defaultValue={suggestedCode} placeholder="e.g. MAITAMA-01" style={field} /></label>
            <label style={label}>Project name<input name="name" required defaultValue={suggestedName} placeholder="Project name" style={field} /></label>
            <label style={label}>Client<input name="client_name" placeholder="Client/company name" style={field} /></label>
            <label style={label}>Location<input name="location" placeholder="City / area" style={field} /></label>
            <label style={label}>Start date<input name="start_date" type="date" style={field} /></label>
            <label style={label}>Status<select name="status" defaultValue="active" style={field}><option value="draft">Draft</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
            <label style={label}>Client / contract value<input name="contract_value" type="number" step="0.01" placeholder="₦" style={field} /></label>
            <label style={label}>Internal cost budget<input name="internal_cost_budget" type="number" step="0.01" placeholder="₦" style={field} /></label>
          </section>
          <label style={label}>Aliases / keywords<input name="aliases" defaultValue={suggestedName} placeholder="Comma-separated: Maitama, Site 4, Client name" style={field} /></label>
          <label style={label}>Notes<textarea name="notes" rows={4} placeholder="Optional project notes" style={field} /></label>
          {candidateId && <div style={{ background: "#fff8e8", border: "1px solid #f1d89c", borderRadius: 10, padding: 11, color: "#745313", fontSize: 12 }}>After creation, transactions carrying this keyword will be linked to the project for review. They will <b>not</b> be posted automatically.</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <Link href={returnHref} style={{ padding: "10px 14px", border: "1px solid #d8e1e9", borderRadius: 10, textDecoration: "none", color: "#526478", fontWeight: 800 }}>Cancel</Link>
            <button type="submit" style={{ border: 0, borderRadius: 10, padding: "10px 16px", background: "#0b3253", color: "white", fontWeight: 850 }}>Create Project</button>
          </div>
        </form>
      </div>
    </main>
  );
}

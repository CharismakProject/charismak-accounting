import Link from "next/link";
import { createProject } from "../actions";

const field = { width: "100%", border: "1px solid #d3dde6", borderRadius: 10, padding: "10px 11px", fontSize: 14 } as const;
const label = { display: "grid", gap: 6, fontSize: 12, fontWeight: 800, color: "#31475d" } as const;

export default function NewProjectPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "28px clamp(18px,4vw,54px)" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <Link href="/projects" style={{ color: "#1f6fe5", textDecoration: "none", fontWeight: 800 }}>← Projects</Link>
        <header style={{ margin: "16px 0 22px" }}>
          <p style={{ margin: 0, color: "#1f6fe5", textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 900 }}>Create</p>
          <h1 style={{ margin: "5px 0", fontSize: 30, color: "#12283f" }}>New Project</h1>
          <p style={{ margin: 0, color: "#718195" }}>Create the project first. Funding, transactions, BOQ and deeper cost control can be added afterwards.</p>
        </header>

        <form action={createProject} style={{ background: "white", border: "1px solid #dde6ee", borderRadius: 18, padding: 22, display: "grid", gap: 18 }}>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
            <label style={label}>Project code<input name="project_code" required placeholder="e.g. MAITAMA-01" style={field} /></label>
            <label style={label}>Project name<input name="name" required placeholder="Project name" style={field} /></label>
            <label style={label}>Client<input name="client_name" placeholder="Client/company name" style={field} /></label>
            <label style={label}>Location<input name="location" placeholder="City / area" style={field} /></label>
            <label style={label}>Start date<input name="start_date" type="date" style={field} /></label>
            <label style={label}>Status<select name="status" defaultValue="active" style={field}><option value="draft">Draft</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
            <label style={label}>Client / contract value<input name="contract_value" type="number" step="0.01" placeholder="₦" style={field} /></label>
            <label style={label}>Internal cost budget<input name="internal_cost_budget" type="number" step="0.01" placeholder="₦" style={field} /></label>
          </section>
          <label style={label}>Aliases / keywords<input name="aliases" placeholder="Comma-separated: Maitama, Site 4, Client name" style={field} /></label>
          <label style={label}>Notes<textarea name="notes" rows={4} placeholder="Optional project notes" style={field} /></label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Link href="/projects" style={{ padding: "11px 15px", border: "1px solid #d8e1e9", borderRadius: 10, textDecoration: "none", color: "#526478", fontWeight: 800 }}>Cancel</Link>
            <button type="submit" style={{ border: 0, borderRadius: 10, padding: "11px 17px", background: "#0b3253", color: "white", fontWeight: 850 }}>Create Project</button>
          </div>
        </form>
      </div>
    </main>
  );
}

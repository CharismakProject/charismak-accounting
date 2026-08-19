import Link from "next/link";
import { createProject } from "../actions";

const field = { width: "100%", border: "1px solid #d3dde6", borderRadius: 9, padding: "9px 10px", fontSize: 12, background: "white" } as const;
const label = { display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#31475d" } as const;

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const candidateId = typeof query.candidate === "string" ? query.candidate : "";
  const importId = typeof query.import === "string" ? query.import : "";
  const suggestedName = typeof query.name === "string" ? query.name : "";
  const suggestedCode = typeof query.code === "string" ? query.code : "";
  const returnHref = importId ? `/statements/${importId}` : "/projects";

  return (
    <main className="page-canvas">
      <div className="page-wrap" style={{ maxWidth: 980 }}>
        <div className="page-toolbar">
          <Link href="/" className="back-link">← Dashboard</Link>
          <Link href={returnHref} className="secondary-link">{importId ? "Statement review" : "Projects"}</Link>
        </div>

        <header className="page-heading compact">
          <p className="page-eyebrow">{candidateId ? "Statement candidate" : "Project setup"}</p>
          <h1>{candidateId ? `Create Project from ${suggestedName || "Keyword"}` : "Create New Project"}</h1>
          <p>{candidateId ? "Confirm the real project identity before creating it. The statement keyword remains a suggestion until you approve it." : "Create the project profile, image and starting commercial information now. Accounting activity can then be linked to it from statements, requests, commitments and site records."}</p>
        </header>

        <form action={createProject} encType="multipart/form-data" className="compact-card" style={{ display: "grid", gap: 16 }}>
          {candidateId && <input type="hidden" name="candidate_id" value={candidateId} />}
          {importId && <input type="hidden" name="import_id" value={importId} />}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(250px,.55fr)", gap: 14 }} className="new-project-top-grid">
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(205px,1fr))", gap: 11 }}>
              <label style={label}>Project code<input name="project_code" required defaultValue={suggestedCode} placeholder="e.g. JAHI-01" style={field} /></label>
              <label style={label}>Project name<input name="name" required defaultValue={suggestedName} placeholder="Project name" style={field} /></label>
              <label style={label}>Project type<input name="project_type" placeholder="Residential, fit-out, civil, MEP…" style={field} /></label>
              <label style={label}>Client<input name="client_name" placeholder="Client/company name" style={field} /></label>
              <label style={label}>Location<input name="location" placeholder="Area / city" style={field} /></label>
              <label style={label}>Site address<input name="site_address" placeholder="Full site address" style={field} /></label>
              <label style={label}>Start date<input name="start_date" type="date" style={field} /></label>
              <label style={label}>Expected end date<input name="end_date" type="date" style={field} /></label>
              <label style={label}>Status<select name="status" defaultValue="active" style={field}><option value="draft">Draft</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
              <label style={label}>Progress %<input name="progress_percent" type="number" min="0" max="100" step="0.1" defaultValue="0" style={field} /></label>
              <label style={label}>External reference<input name="external_reference" placeholder="Contract / PO / client ref" style={field} /></label>
            </section>

            <aside className="project-image-field" style={{ alignContent: "start", background: "#f8fbfd", border: "1px solid #e1e8ee", borderRadius: 12, padding: 12 }}>
              <b style={{ fontSize: 11, color: "#243d55" }}>Project image</b>
              <span style={{ fontSize: 9, color: "#7d8e9e", lineHeight: 1.45 }}>Use a site photo, render or project cover. JPG, PNG or WEBP, up to 10 MB.</span>
              <input name="project_image" type="file" accept="image/jpeg,image/png,image/webp" />
              <label style={label}>Image description<input name="image_alt" defaultValue={suggestedName} placeholder="e.g. Jahi residential front elevation" style={field} /></label>
            </aside>
          </div>

          <section style={{ borderTop: "1px solid #edf1f4", paddingTop: 13 }}>
            <p style={{ margin: "0 0 9px", fontSize: 9, textTransform: "uppercase", letterSpacing: ".11em", fontWeight: 900, color: "#71869a" }}>Commercial starting point</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(205px,1fr))", gap: 11 }}>
              <label style={label}>Client / contract value<input name="contract_value" type="number" step="0.01" placeholder="₦" style={field} /></label>
              <label style={label}>Internal cost budget<input name="internal_cost_budget" type="number" step="0.01" placeholder="₦" style={field} /></label>
              <label style={label}>Expected contract revenue<input name="expected_contract_revenue" type="number" step="0.01" placeholder="Defaults to contract value" style={field} /></label>
              <label style={label}>Original budget<input name="original_budget" type="number" step="0.01" placeholder="Defaults to internal cost budget" style={field} /></label>
            </div>
          </section>

          <label style={label}>Aliases / keywords<input name="aliases" defaultValue={suggestedName} placeholder="Comma-separated: Jahi, Jahi Site, client tag, narration keyword" style={field} /></label>
          <label style={label}>Project description<textarea name="description" rows={3} placeholder="Scope, building/use, key project information" style={field} /></label>
          <label style={label}>Internal notes<textarea name="notes" rows={3} placeholder="Optional internal notes" style={field} /></label>

          {candidateId && <div style={{ background: "#fff8e8", border: "1px solid #f1d89c", borderRadius: 10, padding: 10, color: "#745313", fontSize: 10 }}>After creation, rows carrying this statement signal will be linked to the project for review. They will <b>not</b> be posted automatically.</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <Link href={returnHref} className="secondary-button">Cancel</Link>
            <button type="submit" className="primary-action" style={{ height: 38, padding: "0 16px" }}>Create Project</button>
          </div>
        </form>
      </div>
    </main>
  );
}

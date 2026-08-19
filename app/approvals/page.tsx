import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { approveRequest, createApprovalRequest, partiallyApproveRequest, rejectRequest, returnRequest } from "./actions";

const money = (value: number | string | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value));

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: membership } = await supabase.from("company_memberships").select("id, company_id, is_owner").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) redirect("/login");

  const [{ data: projects }, { data: requests }, { data: positions }] = await Promise.all([
    supabase.from("projects").select("id, project_code, name").eq("company_id", membership.company_id).neq("status", "archived").order("name"),
    supabase.from("approval_requests").select("id, project_id, requested_by, request_type, description, amount, approved_amount, paid_amount, status, urgency, evidence_required, requested_at, project:projects(project_code,name)").eq("company_id", membership.company_id).order("requested_at", { ascending: false }).limit(100),
    supabase.from("membership_positions").select("position:positions(name,interface_family), is_primary").eq("membership_id", membership.id),
  ]);

  const primary: any = (positions ?? []).find((row: any) => row.is_primary) ?? (positions ?? [])[0];
  const interfaceFamily = primary?.position?.interface_family;
  const canDecide = membership.is_owner || interfaceFamily === "accountant_cfo" || interfaceFamily === "project_director";
  const rows = requests ?? [];
  const pending = rows.filter((r: any) => ["pending", "emergency_retrospective"].includes(r.status));
  const pendingValue = pending.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);

  return (
    <main className="page-canvas">
      <div className="page-wrap" style={{ maxWidth: 1120 }}>
        <div className="page-toolbar"><Link href="/" className="back-link">← Dashboard</Link><Link href="/projects" className="secondary-link">Projects</Link></div>
        <header className="page-heading compact"><p className="page-eyebrow">Workflow</p><h1>Requests & Approvals</h1><p>Request money or approval separately from payment. Emergency spend can be recorded for retrospective approval instead of disappearing from the audit trail.</p></header>
        {query.saved && <div className="notice notice-green" style={{ marginBottom: 12 }}><b>Request saved.</b> It is now in the approval queue.</div>}

        <section className="role-kpis" style={{ marginBottom: 10 }}>
          <article className="role-kpi"><span>Pending requests</span><strong>{pending.length}</strong><small>{money(pendingValue)}</small></article>
          <article className="role-kpi"><span>Approved / part approved</span><strong>{rows.filter((r:any)=>["approved","partially_approved"].includes(r.status)).length}</strong><small>Awaiting or partly paid</small></article>
          <article className="role-kpi"><span>Paid</span><strong>{rows.filter((r:any)=>r.status==="paid").length}</strong><small>Completed workflow</small></article>
          <article className="role-kpi"><span>Emergency retrospective</span><strong>{rows.filter((r:any)=>r.status==="emergency_retrospective").length}</strong><small>Must still be reviewed</small></article>
        </section>

        <section className="access-layout">
          <div className="access-main-column">
            <article className="data-card">
              <div className="section-title"><small>Queue</small><h2>{canDecide ? "Requests Requiring Decision" : "My / Assigned Project Requests"}</h2></div>
              {rows.length ? rows.map((row: any) => {
                const project: any = Array.isArray(row.project) ? row.project[0] : row.project;
                return <section className="approval-row" key={row.id}>
                  <div className="approval-summary">
                    <div><b>{row.description}</b><small>{project ? `${project.project_code} · ${project.name}` : "Company-level"} · {String(row.request_type).replaceAll("_", " ")} · {new Date(row.requested_at).toLocaleDateString("en-NG")}</small></div>
                    <strong>{money(row.amount)}</strong><em className={`status-${row.status}`}>{String(row.status).replaceAll("_", " ")}</em>
                  </div>
                  {canDecide && ["pending", "emergency_retrospective"].includes(row.status) && <div className="approval-actions">
                    <form action={approveRequest}><input type="hidden" name="request_id" value={row.id} /><button type="submit" className="approve">Approve</button></form>
                    <form action={partiallyApproveRequest}><input type="hidden" name="request_id" value={row.id} /><input name="approved_amount" type="number" step="0.01" min="0" max={row.amount} placeholder="Partial amount" required /><button type="submit">Part approve</button></form>
                    <form action={returnRequest}><input type="hidden" name="request_id" value={row.id} /><button type="submit">Return</button></form>
                    <form action={rejectRequest}><input type="hidden" name="request_id" value={row.id} /><button type="submit" className="reject">Reject</button></form>
                  </div>}
                </section>;
              }) : <p className="empty-state">No requests yet.</p>}
            </article>
          </div>

          <aside className="access-side-column">
            <article className="data-card">
              <div className="section-title"><small>New request</small><h2>Create Request</h2><p>Creating a request does not mean money has been paid.</p></div>
              <form action={createApprovalRequest} className="access-form-stack">
                <label>Project<select name="project_id" defaultValue=""><option value="">Company-level / no project</option>{(projects ?? []).map((p:any)=><option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label>
                <label>Request type<select name="request_type" defaultValue="purchase"><option value="purchase">Purchase</option><option value="labour">Labour</option><option value="subcontract">Subcontract</option><option value="imprest">Imprest</option><option value="material_advance">Material advance</option><option value="hire">Hire</option><option value="reimbursement">Reimbursement</option><option value="salary">Salary</option><option value="project_funding">Project funding</option><option value="supplier">Supplier payment</option><option value="variation">Variation</option><option value="company_expense">Company expense</option></select></label>
                <label>Description<textarea name="description" rows={3} required placeholder="What is the request for?" /></label>
                <label>Amount<input name="amount" type="number" step="0.01" min="0" required /></label>
                <label>Urgency<select name="urgency" defaultValue="normal"><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="emergency">Emergency / retrospective</option></select></label>
                <label className="access-allow"><input type="checkbox" name="evidence_required" /> Evidence/receipt required</label>
                <button type="submit">Submit request</button>
              </form>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}

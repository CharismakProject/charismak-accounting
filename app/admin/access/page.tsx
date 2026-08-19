import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { assignMemberPosition, assignProjectAccess, removeProjectAccess, saveRoleEmail, setMemberLimit } from "./actions";

const majorPositions = [
  { code: "MD_OWNER", label: "MD / Owner", family: "md_owner", accent: "#1768ac" },
  { code: "CFO", label: "Accountant / CFO", family: "accountant_cfo", accent: "#16825c" },
  { code: "PROJECT_DIRECTOR", label: "Project Director", family: "project_director", accent: "#6f50c7" },
  { code: "PROJECT_MANAGER", label: "Project / Construction Manager", family: "project_manager", accent: "#d97009" },
];

const permissionChoices = [
  ["payments.approve", "Approve payments"],
  ["payments.pay", "Make/record payments"],
  ["transactions.confirm", "Confirm transactions"],
  ["projects.manage", "Manage project records"],
  ["reports.export", "Export reports"],
  ["profitability.view", "View profitability"],
] as const;

export default async function AccessAdminPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("company_memberships")
    .select("id, company_id, is_owner")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership?.is_owner) redirect("/?message=Owner+access+required");

  const [{ data: company }, { data: rosterRaw }, { data: auditRows }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", membership.company_id).maybeSingle(),
    supabase.rpc("company_access_roster", { target_company: membership.company_id }),
    supabase.from("audit_log").select("id, actor_email, acting_interface, action, entity_type, project_id, context, created_at").eq("company_id", membership.company_id).order("created_at", { ascending: false }).limit(30),
  ]);

  const roster: any = rosterRaw ?? { role_emails: [], invites: [], members: [], projects: [], positions: [] };
  const members: any[] = Array.isArray(roster.members) ? roster.members : [];
  const projects: any[] = Array.isArray(roster.projects) ? roster.projects : [];
  const positions: any[] = Array.isArray(roster.positions) ? roster.positions : [];
  const roleEmails: any[] = Array.isArray(roster.role_emails) ? roster.role_emails : [];
  const invites: any[] = Array.isArray(roster.invites) ? roster.invites : [];

  return (
    <main className="page-canvas">
      <div className="page-wrap" style={{ maxWidth: 1180 }}>
        <div className="page-toolbar">
          <Link href="/" className="back-link">← Dashboard</Link>
          <span style={{ fontSize: 10, color: "#738292" }}>{company?.name ?? "Company"} · MD access control</span>
        </div>

        <header className="page-heading compact">
          <p className="page-eyebrow">Company administration</p>
          <h1>People, Positions & Access</h1>
          <p>Set the email/alias for each position, assign people to roles and projects, set individual limits, and review who changed what. MD/Owner retains company-wide access to every interface.</p>
        </header>

        {query.saved && <div className="notice notice-green" style={{ marginBottom: 12 }}><b>Saved.</b> Access settings have been updated and logged.</div>}

        <section className="access-role-grid">
          {majorPositions.map((role) => {
            const roleEmail = roleEmails.find((row: any) => row.position_code === role.code);
            const accepted = roleEmail ? members.find((m: any) => String(m.email).toLowerCase() === String(roleEmail.email).toLowerCase()) : null;
            return (
              <article className="access-role-card" key={role.code} style={{ borderTop: `3px solid ${role.accent}` }}>
                <div className="access-role-head">
                  <div><small>{role.code}</small><h2>{role.label}</h2></div>
                  <span>{accepted ? "Active account" : roleEmail ? "Alias reserved" : "Not configured"}</span>
                </div>
                <form action={saveRoleEmail} className="access-form-stack">
                  <input type="hidden" name="position_code" value={role.code} />
                  <label>Email / alias<input name="email" type="email" required defaultValue={roleEmail?.email ?? (role.code === "MD_OWNER" ? user.email ?? "" : "")} placeholder={`e.g. ${role.code.toLowerCase()}@company.com`} /></label>
                  <label>Display label<input name="display_label" defaultValue={roleEmail?.display_label ?? role.label} /></label>
                  <button type="submit">Save position email</button>
                </form>
                <p className="access-help">After saving a new alias, use <b>Create account</b> on the login page with that alias. The existing company invite will attach the account to this company and position automatically.</p>
              </article>
            );
          })}
        </section>

        <section className="access-layout">
          <div className="access-main-column">
            <article className="data-card">
              <div className="section-title"><small>Company roster</small><h2>Members & Assigned Positions</h2><p>MD can change a member's primary position without changing the person's login email.</p></div>
              <div className="access-member-list">
                {members.map((member: any) => {
                  const primary = (member.positions ?? []).find((p: any) => p.is_primary) ?? (member.positions ?? [])[0];
                  return (
                    <section className="access-member" key={member.membership_id}>
                      <div className="access-member-title">
                        <div><b>{member.email}</b><span>{member.is_owner ? "Owner · company-wide" : primary?.name ?? "No primary position"}</span></div>
                        <em>{member.status}</em>
                      </div>
                      {!member.is_owner && (
                        <form action={assignMemberPosition} className="access-inline-form">
                          <input type="hidden" name="membership_id" value={member.membership_id} />
                          <select name="position_code" defaultValue={primary?.code ?? "PROJECT_MANAGER"}>
                            {positions.map((position: any) => <option key={position.id} value={position.code}>{position.name}</option>)}
                          </select>
                          <button type="submit">Set position</button>
                        </form>
                      )}

                      <div className="access-project-tags">
                        {(member.projects ?? []).length ? (member.projects ?? []).map((assignment: any) => (
                          <span key={assignment.assignment_id}>{assignment.project_code} · {assignment.assignment_role || "Assigned"}
                            {!member.is_owner && <form action={removeProjectAccess}><input type="hidden" name="assignment_id" value={assignment.assignment_id} /><button type="submit" title="Remove project access">×</button></form>}
                          </span>
                        )) : <small>{member.is_owner ? "Owner sees all company projects." : "No project-specific assignment yet."}</small>}
                      </div>
                    </section>
                  );
                })}
              </div>
            </article>

            <article className="data-card">
              <div className="section-title"><small>Project scope</small><h2>Assign Project Access</h2><p>Use this especially for Project Directors, Project Managers, Site Managers, Engineers and Supervisors.</p></div>
              <form action={assignProjectAccess} className="access-assignment-grid">
                <label>Member<select name="membership_id" required defaultValue=""><option value="" disabled>Select member…</option>{members.filter((m: any) => !m.is_owner).map((m: any) => <option key={m.membership_id} value={m.membership_id}>{m.email}</option>)}</select></label>
                <label>Project<select name="project_id" required defaultValue=""><option value="" disabled>Select project…</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label>
                <label>Project role<input name="assignment_role" placeholder="Project Manager, Site Engineer…" /></label>
                <div className="access-checks">
                  <label><input type="checkbox" name="can_view_cost" defaultChecked /> View project cost</label>
                  <label><input type="checkbox" name="can_request" defaultChecked /> Create requests</label>
                  <label><input type="checkbox" name="can_approve" /> Approve project requests</label>
                </div>
                <button type="submit">Assign project</button>
              </form>
            </article>

            <article className="data-card">
              <div className="section-title"><small>Individual overrides</small><h2>Permission & Financial Limits</h2><p>Position gives the default access. Use this only when one person needs a stricter or wider limit than their position template.</p></div>
              <form action={setMemberLimit} className="access-limit-grid">
                <label>Member<select name="membership_id" required defaultValue=""><option value="" disabled>Select member…</option>{members.filter((m: any) => !m.is_owner).map((m: any) => <option key={m.membership_id} value={m.membership_id}>{m.email}</option>)}</select></label>
                <label>Permission<select name="permission_code">{permissionChoices.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
                <label>Scope<select name="scope" defaultValue="assigned_projects"><option value="own">Own</option><option value="assigned_projects">Assigned projects</option><option value="selected_projects">Selected projects</option><option value="selected_accounts">Selected accounts</option><option value="company_wide">Company-wide</option></select></label>
                <label>Approval limit<input name="approval_limit" type="number" step="0.01" placeholder="₦ optional" /></label>
                <label>Payment limit<input name="payment_limit" type="number" step="0.01" placeholder="₦ optional" /></label>
                <label className="access-allow"><input type="checkbox" name="allowed" defaultChecked /> Permission allowed</label>
                <button type="submit">Save override</button>
              </form>
            </article>
          </div>

          <aside className="access-side-column">
            <article className="data-card">
              <div className="section-title"><small>Reserved access</small><h2>Position Emails</h2></div>
              {roleEmails.length ? roleEmails.map((row: any) => <div className="access-mini-row" key={row.id}><div><b>{row.display_label || row.position_code}</b><small>{row.email}</small></div><span>{row.is_active ? "Active" : "Off"}</span></div>) : <p className="empty-state">No position aliases saved yet.</p>}
            </article>

            <article className="data-card">
              <div className="section-title"><small>Account creation</small><h2>Pending / Accepted Aliases</h2></div>
              {invites.slice(0, 12).map((invite: any) => <div className="access-mini-row" key={invite.id}><div><b>{invite.position_code}</b><small>{invite.email}</small></div><span>{invite.accepted_at ? "Accepted" : "Ready"}</span></div>)}
            </article>

            <article className="data-card">
              <div className="section-title"><small>Audit trail</small><h2>Recent Access & Data Activity</h2></div>
              {(auditRows ?? []).length ? (auditRows ?? []).map((row: any) => (
                <div className="audit-mini" key={row.id}>
                  <b>{String(row.action).replaceAll("_", " ").replaceAll(".", " · ")}</b>
                  <span>{row.actor_email || "System"} · {String(row.acting_interface || "system").replaceAll("_", " ")}</span>
                  <small>{new Date(row.created_at).toLocaleString("en-NG")}</small>
                </div>
              )) : <p className="empty-state">No audit activity yet.</p>}
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}

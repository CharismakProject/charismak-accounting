import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export default async function AuditPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: membership } = await supabase.from("company_memberships").select("id,company_id,is_owner").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) redirect("/login");

  const { data: rows } = await supabase
    .from("audit_log")
    .select("id,actor_user_id,actor_email,acting_interface,action,entity_type,entity_id,project_id,before_data,after_data,context,created_at")
    .eq("company_id", membership.company_id)
    .order("created_at", { ascending: false })
    .limit(250);

  return (
    <main className="page-canvas">
      <div className="page-wrap" style={{ maxWidth: 1160 }}>
        <div className="page-toolbar"><Link href="/" className="back-link">← Dashboard</Link>{membership.is_owner && <Link href="/admin/access" className="secondary-link">People & Access</Link>}</div>
        <header className="page-heading compact"><p className="page-eyebrow">Governance</p><h1>Audit Trail</h1><p>{membership.is_owner ? "Company-wide activity showing who acted, which interface they were using, what changed and when." : "Your recorded actions and changes in the company workspace."}</p></header>

        <article className="data-card">
          <div className="section-title"><small>Immutable activity view</small><h2>Recent Changes</h2></div>
          {(rows ?? []).length ? <div className="audit-table">
            <div className="audit-table-head"><span>Date / time</span><span>Actor</span><span>Acting interface</span><span>Action</span><span>Record</span></div>
            {(rows ?? []).map((row:any)=><div className="audit-table-row" key={row.id}>
              <span>{new Date(row.created_at).toLocaleString("en-NG")}</span>
              <span>{row.actor_email || "System"}</span>
              <span>{String(row.acting_interface || "system").replaceAll("_"," ")}</span>
              <b>{String(row.action).replaceAll("."," · ").replaceAll("_"," ")}</b>
              <span>{String(row.entity_type).replaceAll("_"," ")}{row.context && Object.keys(row.context).length ? <small title={JSON.stringify(row.context)}> · details recorded</small> : null}</span>
            </div>)}
          </div> : <p className="empty-state">No auditable activity has been recorded yet.</p>}
        </article>
      </div>
    </main>
  );
}

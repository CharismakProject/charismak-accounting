import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id,notification_type,title,body,href,priority,read_at,created_at")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const unread = (rows ?? []).filter((row: any) => !row.read_at).length;

  return (
    <main className="page-canvas">
      <div className="page-wrap narrow">
        <div className="page-toolbar">
          <Link href="/" className="back-link">← Dashboard</Link>
          {unread > 0 && <form action={markAllNotificationsRead}><button className="md-button" type="submit">Mark all read</button></form>}
        </div>
        <header className="page-heading compact">
          <p className="page-eyebrow">Action centre</p>
          <h1>Notifications</h1>
          <p>{unread} unread · approvals, decisions and other actions that need your attention.</p>
        </header>

        <section className="notification-list">
          {(rows ?? []).length === 0 && <article className="compact-card"><b>No notifications yet.</b><p style={{ marginBottom: 0, color: "#718195" }}>Approval requests and decisions will appear here.</p></article>}
          {(rows ?? []).map((row: any) => (
            <article className={`notification-card ${row.read_at ? "read" : "unread"} priority-${row.priority}`} key={row.id}>
              <div>
                <div className="notification-card-top"><b>{row.title}</b><span>{new Date(row.created_at).toLocaleString("en-NG")}</span></div>
                {row.body && <p>{row.body}</p>}
                <small>{String(row.notification_type).replaceAll("_", " ")}</small>
              </div>
              <div className="notification-card-actions">
                {row.href && <Link href={row.href}>Open</Link>}
                {!row.read_at && <form action={markNotificationRead}><input type="hidden" name="notification_id" value={row.id} /><button type="submit">Mark read</button></form>}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

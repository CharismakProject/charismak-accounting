import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createCompanyWorkspace } from "./actions";

export default async function CompanyOnboardingPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: existing } = await supabase.from("company_memberships").select("id").eq("user_id", auth.user.id).eq("status", "active").limit(1).maybeSingle();
  if (existing) redirect("/");

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ width: "min(560px,100%)", background: "white", border: "1px solid #e1e8ef", borderRadius: 22, padding: 30, boxShadow: "0 20px 60px rgba(15,36,58,.10)" }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 850, letterSpacing: ".12em", color: "#0b6b59" }}>CREATE YOUR WORKSPACE</p>
        <h1 style={{ margin: "8px 0", fontSize: 28, color: "#102942" }}>Set up your construction company</h1>
        <p style={{ margin: "0 0 22px", color: "#687b8e", lineHeight: 1.6, fontSize: 14 }}>This creates your private accounting workspace, owner access, finance settings, reporting brand and starter chart of accounts. You can invite your team after setup.</p>
        <form action={createCompanyWorkspace} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 7, fontSize: 12, fontWeight: 800, color: "#233d56" }}>
            Company / business name
            <input name="company_name" required minLength={2} maxLength={160} placeholder="e.g. ABC Construction Limited" style={{ width: "100%", border: "1px solid #cfd9e3", borderRadius: 11, padding: "12px 13px", fontSize: 15 }} />
          </label>
          <button type="submit" style={{ border: 0, borderRadius: 12, padding: 13, background: "#0b3253", color: "white", fontWeight: 850 }}>Create company workspace</button>
        </form>
      </section>
    </main>
  );
}

"use client";

import { FormEvent, useState } from "react";

export default function WorkspaceSetupPage() {
  const [companyName, setCompanyName] = useState("Charismak Project Nigeria Limited");
  const [countryCode, setCountryCode] = useState("NG");
  const [currencyCode, setCurrencyCode] = useState("NGN");
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: 24, color: "#142539" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "white", display: "grid", placeItems: "center", position: "relative", boxShadow: "0 6px 18px #16324d18" }}>
            <img src="https://raw.githubusercontent.com/CharismakProject/charismak-website/main/public/branding/charismak-logo.png" alt="Charismak" style={{ width: 34, height: 34, objectFit: "contain" }} />
            <b style={{ position: "absolute", right: -3, bottom: -3, width: 20, height: 20, borderRadius: "50%", background: "#0e66d7", color: "white", border: "2px solid white", display: "grid", placeItems: "center", fontSize: 10 }}>A</b>
          </div>
          <div>
            <small style={{ textTransform: "uppercase", letterSpacing: ".12em", color: "#1f6fe5", fontWeight: 800 }}>Workspace setup</small>
            <h1 style={{ margin: "3px 0 0", fontSize: 28 }}>Create your company workspace</h1>
          </div>
        </div>

        <section style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 16 }}>
          <form onSubmit={submit} style={{ background: "white", border: "1px solid #e2e8ef", borderRadius: 16, padding: 22, boxShadow: "0 8px 22px #18304b0c" }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Company details</h2>
            <p style={{ color: "#718295", fontSize: 13 }}>This creates the top-level workspace that will contain users, clients, projects, accounts and reports.</p>

            {[
              ["Company name", companyName, setCompanyName],
              ["Country code", countryCode, setCountryCode],
              ["Currency", currencyCode, setCurrencyCode],
              ["Timezone", timezone, setTimezone],
            ].map(([label, value, setter]) => (
              <label key={String(label)} style={{ display: "block", marginTop: 16, fontSize: 12, fontWeight: 700 }}>
                {String(label)}
                <input
                  value={String(value)}
                  onChange={(e) => (setter as (value: string) => void)(e.target.value)}
                  style={{ width: "100%", marginTop: 6, border: "1px solid #d7e0e8", borderRadius: 10, padding: "11px 12px", fontSize: 14 }}
                />
              </label>
            ))}

            <div style={{ marginTop: 18, background: "#f7faff", border: "1px solid #dbe8fb", borderRadius: 12, padding: 13, fontSize: 12, color: "#46627d" }}>
              Initial active-project limit: <b>10 projects</b>. Completed and archived projects will not consume the active limit.
            </div>

            <button type="submit" style={{ marginTop: 18, border: 0, background: "#0d3155", color: "white", borderRadius: 10, padding: "11px 16px", fontWeight: 800 }}>Save workspace</button>
            {saved && <span style={{ marginLeft: 12, color: "#12825c", fontSize: 12, fontWeight: 700 }}>✓ Demo workspace saved locally</span>}
          </form>

          <aside style={{ background: "linear-gradient(145deg,#061b30,#0d3f6b)", color: "white", borderRadius: 16, padding: 22 }}>
            <small style={{ textTransform: "uppercase", letterSpacing: ".12em", color: "#8fb5d6", fontWeight: 800 }}>Foundation rule</small>
            <h2 style={{ fontSize: 22, marginBottom: 10 }}>One company. One financial truth.</h2>
            <p style={{ color: "#c3d5e4", fontSize: 13, lineHeight: 1.65 }}>Every project, account, transaction, commitment, user and report will be scoped to this company workspace.</p>
            <div style={{ marginTop: 24, borderTop: "1px solid #ffffff22", paddingTop: 16, fontSize: 12, lineHeight: 1.9 }}>
              <b>MD / Owner</b><br />Executive interface + company authority<br /><br />
              <b>Accountant / CFO</b><br />Finance operations interface<br /><br />
              <b>Project Director</b><br />Portfolio and cost-control interface<br /><br />
              <b>Project / Construction Manager</b><br />Project/site-control interface
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

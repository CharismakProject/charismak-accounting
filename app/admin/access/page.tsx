"use client";

import { useMemo, useState } from "react";
import { permissionCatalog, positionTemplates } from "../../../lib/positions";

const familyLabels = {
  md: "MD / Owner",
  finance: "Accountant / CFO",
  director: "Project Director",
  manager: "Project / Construction Manager",
};

export default function AccessAdminPage() {
  const [selected, setSelected] = useState("MD_OWNER");
  const selectedPosition = useMemo(
    () => positionTemplates.find((position) => position.code === selected) ?? positionTemplates[0],
    [selected],
  );

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", color: "#142539", padding: 24 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ marginBottom: 20 }}>
          <small style={{ textTransform: "uppercase", letterSpacing: ".12em", color: "#1f6fe5", fontWeight: 900 }}>Company administration</small>
          <h1 style={{ margin: "5px 0", fontSize: 30 }}>Positions & Permissions</h1>
          <p style={{ margin: 0, color: "#718295", fontSize: 13 }}>Position controls the default interface family. Permissions control what the user can actually see or do.</p>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
          <aside style={{ background: "white", border: "1px solid #e2e8ef", borderRadius: 16, padding: 16 }}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Position hierarchy</h2>
            <div style={{ display: "grid", gap: 7 }}>
              {positionTemplates.map((position) => (
                <button
                  key={position.code}
                  onClick={() => setSelected(position.code)}
                  style={{
                    border: selected === position.code ? "1px solid #1f6fe5" : "1px solid #e3e9ef",
                    background: selected === position.code ? "#eef5ff" : "white",
                    borderRadius: 10,
                    padding: "10px 11px",
                    textAlign: "left",
                  }}
                >
                  <b style={{ display: "block", fontSize: 12 }}>{position.name}</b>
                  <small style={{ color: "#7b8b9a" }}>
                    {familyLabels[position.interfaceFamily]}
                    {position.parentCode ? ` · under ${position.parentCode.replaceAll("_", " ")}` : " · major position"}
                  </small>
                </button>
              ))}
            </div>
          </aside>

          <div style={{ display: "grid", gap: 16 }}>
            <article style={{ background: "white", border: "1px solid #e2e8ef", borderRadius: 16, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
                <div>
                  <small style={{ textTransform: "uppercase", letterSpacing: ".12em", color: "#7e8f9f", fontWeight: 800 }}>Selected position</small>
                  <h2 style={{ fontSize: 22, margin: "5px 0" }}>{selectedPosition.name}</h2>
                  <p style={{ margin: 0, color: "#718295", fontSize: 13 }}>Default interface: <b>{familyLabels[selectedPosition.interfaceFamily]}</b></p>
                </div>
                <span style={{ background: "#eef5ff", color: "#1f6fe5", padding: "7px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800 }}>{selectedPosition.code}</span>
              </div>
            </article>

            <article style={{ background: "white", border: "1px solid #e2e8ef", borderRadius: 16, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <small style={{ textTransform: "uppercase", letterSpacing: ".12em", color: "#7e8f9f", fontWeight: 800 }}>Permission matrix</small>
                  <h2 style={{ fontSize: 17, margin: "4px 0 0" }}>Default access</h2>
                </div>
                <button style={{ border: 0, background: "#0d3155", color: "white", borderRadius: 9, padding: "9px 12px", fontWeight: 800 }}>Save permissions</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.3fr .7fr .7fr", padding: "8px 10px", background: "#f8fafc", color: "#7e8f9f", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>
                <span>Permission</span><span>Access</span><span>Scope</span>
              </div>

              {permissionCatalog.map((permission) => {
                const defaultEnabled = selectedPosition.interfaceFamily === "md" ||
                  (selectedPosition.interfaceFamily === "finance" && !permission.startsWith("profitability")) ||
                  (selectedPosition.interfaceFamily === "director" && ["projects.view", "transactions.view", "payments.approve", "profitability.view", "reports.view", "reports.export"].includes(permission)) ||
                  (selectedPosition.interfaceFamily === "manager" && ["projects.view", "transactions.view", "transactions.create", "reports.view"].includes(permission));

                return (
                  <div key={permission} style={{ display: "grid", gridTemplateColumns: "1.3fr .7fr .7fr", gap: 10, alignItems: "center", padding: "11px 10px", borderBottom: "1px solid #eef2f5", fontSize: 12 }}>
                    <span><b>{permission}</b></span>
                    <span>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" defaultChecked={defaultEnabled} />
                        {defaultEnabled ? "Allowed" : "Off"}
                      </label>
                    </span>
                    <select defaultValue={selectedPosition.interfaceFamily === "manager" ? "assigned_projects" : "company_wide"} style={{ border: "1px solid #dbe3ea", borderRadius: 8, padding: 7, fontSize: 11 }}>
                      <option value="own">Own</option>
                      <option value="assigned_projects">Assigned projects</option>
                      <option value="selected_projects">Selected projects</option>
                      <option value="selected_accounts">Selected accounts</option>
                      <option value="company_wide">Company-wide</option>
                    </select>
                  </div>
                );
              })}
            </article>

            <article style={{ background: "#071e33", color: "white", borderRadius: 16, padding: 18 }}>
              <b style={{ fontSize: 13 }}>Delegation rule</b>
              <p style={{ color: "#c3d5e4", fontSize: 12, lineHeight: 1.6, marginBottom: 0 }}>A user can only delegate permissions, scopes and financial limits that they already possess. Interface switching never increases permission.</p>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}

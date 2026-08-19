"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

export type RoleFamily = "md_owner" | "accountant_cfo" | "project_director" | "project_manager";

const roleMeta: Record<RoleFamily, { label: string; short: string; note: string; className: string }> = {
  md_owner: { label: "MD / Owner", short: "MD", note: "Executive control", className: "role-md" },
  accountant_cfo: { label: "Accountant / CFO", short: "CFO", note: "Finance operations", className: "role-finance" },
  project_director: { label: "Project Director", short: "PD", note: "Portfolio & cost", className: "role-director" },
  project_manager: { label: "Project / Construction Manager", short: "PM", note: "Site & project control", className: "role-manager" },
};

export default function RoleSwitcher({ companyId, active, available }: { companyId: string; active: RoleFamily; available: RoleFamily[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<RoleFamily | null>(null);
  const [error, setError] = useState("");

  async function changeRole(role: RoleFamily) {
    if (role === active || busy) return;
    setBusy(role);
    setError("");
    const supabase = createClient();
    const { error: switchError } = await supabase.rpc("set_active_interface", {
      target_company: companyId,
      target_interface: role,
    });
    if (switchError) {
      setError(switchError.message);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  return (
    <div className="role-switcher">
      <small>SWITCH ROLE</small>
      <div className="role-switch-list">
        {available.map((role) => {
          const meta = roleMeta[role];
          return (
            <button key={role} type="button" className={`${meta.className} ${active === role ? "active" : ""}`} onClick={() => changeRole(role)} disabled={busy !== null}>
              <span>{meta.short}</span>
              <div><b>{meta.label}</b><small>{busy === role ? "Switching…" : meta.note}</small></div>
            </button>
          );
        })}
      </div>
      {error && <p className="role-switch-error">{error}</p>}
    </div>
  );
}

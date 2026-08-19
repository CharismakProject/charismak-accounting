"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

const baseItems = [
  ["Dashboard", "/"],
  ["Projects", "/projects"],
  ["Statements", "/statements"],
  ["Upload statements", "/statements/upload"],
  ["Treasury", "/treasury"],
  ["Approvals", "/approvals"],
  ["Notifications", "/notifications"],
] as const;

export default function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !live) return;
      const { data: membership } = await supabase
        .from("company_memberships")
        .select("is_owner")
        .eq("user_id", auth.user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (live) setOwner(Boolean(membership?.is_owner));
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const items = owner
    ? [...baseItems, ["People & Access", "/admin/access"] as const, ["Audit trail", "/audit"] as const]
    : baseItems;

  return (
    <>
      <button
        type="button"
        className="mobile-menu-trigger"
        aria-expanded={open}
        aria-controls="mobile-accounting-menu"
        onClick={() => setOpen(v => !v)}
      >
        <span aria-hidden="true">☰</span>
        <b>Menu</b>
      </button>

      {open && <button className="mobile-menu-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <aside id="mobile-accounting-menu" className={`mobile-menu-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="mobile-menu-head">
          <div>
            <small>CHARISMAK</small>
            <b>Accounting</b>
          </div>
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>×</button>
        </div>
        <nav>
          {items.map(([label, href]) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} href={href} className={active ? "active" : ""}>{label}<span>›</span></Link>;
          })}
        </nav>
        <p>Same workspace and permissions on phone, tablet and desktop.</p>
      </aside>
    </>
  );
}

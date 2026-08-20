"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

const moreItems = [
  ["Needs your decision", "/review"],
  ["Money & Treasury", "/treasury"],
  ["Money Activity", "/statements"],
  ["Notifications", "/notifications"],
  ["Reports", "/reports"],
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
      const { data: membership } = await supabase.from("company_memberships").select("is_owner").eq("user_id", auth.user.id).eq("status", "active").limit(1).maybeSingle();
      if (live) setOwner(Boolean(membership?.is_owner));
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => setOpen(false), [pathname]);
  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) return null;

  const secondary = owner
    ? [...moreItems, ["People & Access", "/admin/access"] as const, ["Audit trail", "/audit"] as const]
    : moreItems;
  const active = (href:string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  return <>
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      <Link href="/" className={active("/") ? "active" : ""}><span>⌂</span><b>Home</b></Link>
      <Link href="/projects" className={active("/projects") ? "active" : ""}><span>▦</span><b>Projects</b></Link>
      <Link href="/add" className={`mobile-add-tab ${active("/add") ? "active" : ""}`}><span>＋</span><b>Add</b></Link>
      <Link href="/approvals" className={active("/approvals") ? "active" : ""}><span>✓</span><b>Approvals</b></Link>
      <button type="button" className={open ? "active" : ""} onClick={() => setOpen(v => !v)}><span>•••</span><b>More</b></button>
    </nav>

    {open && <button className="mobile-menu-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />}
    <aside className={`mobile-menu-drawer compact-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="mobile-menu-head"><div><small>CHARISMAK</small><b>More</b></div><button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>×</button></div>
      <nav>{secondary.map(([label,href]) => <Link key={href} href={href} className={active(href) ? "active" : ""}>{label}<span>›</span></Link>)}</nav>
      <p>Advanced tools stay here so everyday project finance stays simple.</p>
    </aside>
  </>;
}

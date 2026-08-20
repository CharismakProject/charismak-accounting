"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

type RoleFamily="md_owner"|"accountant_cfo"|"project_director"|"project_manager";
const roleLabel:Record<RoleFamily,string>={md_owner:"MD / Owner",accountant_cfo:"Accountant / CFO",project_director:"Project Director",project_manager:"Project / Construction Manager"};
const allRoles:RoleFamily[]=["md_owner","accountant_cfo","project_director","project_manager"];
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
  const [companyId,setCompanyId]=useState("");
  const [roles,setRoles]=useState<RoleFamily[]>([]);
  const [activeRole,setActiveRole]=useState<RoleFamily>("md_owner");
  const [roleBusy,setRoleBusy]=useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !live) return;
      const { data: membership } = await supabase.from("company_memberships").select("id,company_id,is_owner").eq("user_id", auth.user.id).eq("status", "active").limit(1).maybeSingle();
      if(!membership||!live)return;
      setOwner(Boolean(membership.is_owner));setCompanyId(membership.company_id);
      const [{data:positions},{data:preference}]=await Promise.all([
        supabase.from("membership_positions").select("position:positions(interface_family)").eq("membership_id",membership.id),
        supabase.from("user_interface_preferences").select("active_interface").eq("company_id",membership.company_id).eq("user_id",auth.user.id).maybeSingle(),
      ]);
      if(!live)return;
      const families=Array.from(new Set((positions??[]).map((r:any)=>r.position?.interface_family).filter(Boolean))) as RoleFamily[];
      const available=membership.is_owner?allRoles:(families.length?families:["project_manager"] as RoleFamily[]);
      const preferred=preference?.active_interface as RoleFamily|undefined;
      setRoles(available);setActiveRole(preferred&&available.includes(preferred)?preferred:(membership.is_owner?"md_owner":available[0]));
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => setOpen(false), [pathname]);
  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) return null;

  async function changeRole(role:RoleFamily){
    if(role===activeRole||!companyId||roleBusy)return;
    setRoleBusy(true);
    const supabase=createClient();
    const {error}=await supabase.rpc("set_active_interface",{target_company:companyId,target_interface:role});
    if(!error){setActiveRole(role);setOpen(false);window.location.assign("/");}
    else setRoleBusy(false);
  }

  const secondary = owner
    ? [...moreItems, ["Company Branding", "/company/branding"] as const, ["People & Access", "/admin/access"] as const, ["Audit trail", "/audit"] as const]
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
      {roles.length>1&&<section className="mobile-acting-as"><small>ACTING AS</small><strong>{roleLabel[activeRole]}</strong><div>{roles.map(role=><button key={role} type="button" disabled={roleBusy} className={activeRole===role?"active":""} onClick={()=>changeRole(role)}>{roleLabel[role]}</button>)}</div></section>}
      <nav>{secondary.map(([label,href]) => <Link key={href} href={href} className={active(href) ? "active" : ""}>{label}<span>›</span></Link>)}</nav>
      <p>Advanced tools stay here so everyday project finance stays simple.</p>
    </aside>
  </>;
}

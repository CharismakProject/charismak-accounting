import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { defaultBranding, resolveBrandingAssets } from "../../../lib/company-branding";
import BrandingForm from "./BrandingForm";

export default async function CompanyBrandingPage() {
  const supabase = await createClient(); const { data: auth } = await supabase.auth.getUser(); if (!auth.user) redirect("/login");
  const { data: membership } = await supabase.from("company_memberships").select("company_id,is_owner,company:companies(name)").eq("user_id", auth.user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership?.is_owner) redirect("/");
  const company: any = Array.isArray((membership as any).company) ? (membership as any).company[0] : (membership as any).company;
  const { data } = await supabase.from("company_branding").select("*").eq("company_id", membership.company_id).maybeSingle();
  const branding = data ?? defaultBranding(membership.company_id, company?.name ?? "Your company"); const assets = await resolveBrandingAssets(supabase, branding);
  return <main className="branding-page"><div className="branding-page-wrap"><div className="branding-toolbar"><Link href="/">← Home</Link><Link href="/reports">View reports</Link></div><header className="branding-heading"><small>COMPANY SETTINGS</small><h1>Your brand, on every report</h1><p>Add your logo, letterhead, company details and colours once. Client-facing reports will use your identity—not the accounting application’s brand.</p></header><BrandingForm companyId={membership.company_id} initial={branding} assetUrls={assets} /></div></main>;
}

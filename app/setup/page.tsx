import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { defaultBranding, resolveBrandingAssets } from "../../lib/company-branding";
import BrandingForm from "../company/branding/BrandingForm";

export default async function WorkspaceSetupPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: membership } = await supabase.from("company_memberships").select("company_id,is_owner,company:companies(name)").eq("user_id", auth.user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership?.is_owner) redirect("/");
  const company: any = Array.isArray((membership as any).company) ? (membership as any).company[0] : (membership as any).company;
  const { data } = await supabase.from("company_branding").select("*").eq("company_id", membership.company_id).maybeSingle();
  const branding = data ?? defaultBranding(membership.company_id, company?.name ?? "Your company");
  const assets = await resolveBrandingAssets(supabase, branding);
  return <main className="branding-page onboarding"><div className="branding-page-wrap">
    <header className="branding-heading"><small>COMPANY ONBOARDING</small><h1>Make every report unmistakably yours</h1><p>Set up your company identity now. You can change it later from Company Branding.</p></header>
    <BrandingForm companyId={membership.company_id} initial={branding} assetUrls={assets} onboarding />
  </div></main>;
}

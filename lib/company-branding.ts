export type CompanyBranding = {
  company_id: string;
  display_name: string;
  legal_name: string | null;
  rc_number: string | null;
  tax_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  primary_color: string;
  secondary_color: string;
  report_footer: string | null;
  logo_path: string | null;
  letterhead_header_path: string | null;
  letterhead_footer_path: string | null;
  onboarding_complete: boolean;
};

export type BrandingAssetUrls = {
  logo: string | null;
  letterheadHeader: string | null;
  letterheadFooter: string | null;
};

export function defaultBranding(companyId: string, companyName: string): CompanyBranding {
  return {
    company_id: companyId,
    display_name: companyName,
    legal_name: companyName,
    rc_number: null,
    tax_number: null,
    address: null,
    phone: null,
    email: null,
    website: null,
    primary_color: '#073F65',
    secondary_color: '#0B8B64',
    report_footer: null,
    logo_path: null,
    letterhead_header_path: null,
    letterhead_footer_path: null,
    onboarding_complete: false,
  };
}

export async function resolveBrandingAssets(supabase: any, branding: CompanyBranding): Promise<BrandingAssetUrls> {
  const entries = [
    ['logo', branding.logo_path],
    ['letterheadHeader', branding.letterhead_header_path],
    ['letterheadFooter', branding.letterhead_footer_path],
  ] as const;
  const urls: BrandingAssetUrls = { logo: null, letterheadHeader: null, letterheadFooter: null };
  await Promise.all(entries.map(async ([key, path]) => {
    if (!path) return;
    const { data } = await supabase.storage.from('company-branding').createSignedUrl(path, 3600);
    urls[key] = data?.signedUrl ?? null;
  }));
  return urls;
}

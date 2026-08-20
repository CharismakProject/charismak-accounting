"use client";

import type { CSSProperties, ChangeEvent, FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import type { BrandingAssetUrls, CompanyBranding } from "../../../lib/company-branding";

type AssetKey = "logo" | "letterheadHeader" | "letterheadFooter";
type PathKey = "logo_path" | "letterhead_header_path" | "letterhead_footer_path";
const assetPathKeys: Record<AssetKey, PathKey> = { logo: "logo_path", letterheadHeader: "letterhead_header_path", letterheadFooter: "letterhead_footer_path" };
const assetFolders: Record<AssetKey, string> = { logo: "logo", letterheadHeader: "letterhead-header", letterheadFooter: "letterhead-footer" };

export default function BrandingForm({ companyId, initial, assetUrls, onboarding = false }: { companyId: string; initial: CompanyBranding; assetUrls: BrandingAssetUrls; onboarding?: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [files, setFiles] = useState<Partial<Record<AssetKey, File>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const previews = useMemo(() => ({
    logo: files.logo ? URL.createObjectURL(files.logo) : assetUrls.logo,
    letterheadHeader: files.letterheadHeader ? URL.createObjectURL(files.letterheadHeader) : assetUrls.letterheadHeader,
    letterheadFooter: files.letterheadFooter ? URL.createObjectURL(files.letterheadFooter) : assetUrls.letterheadFooter,
  }), [files, assetUrls]);

  function field<K extends keyof CompanyBranding>(key: K, value: CompanyBranding[K]) { setForm(current => ({ ...current, [key]: value })); }
  function selectAsset(key: AssetKey) { return (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError(`${file.name} is larger than 5 MB.`); return; }
    setError(""); setFiles(current => ({ ...current, [key]: file }));
  }; }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Your session has expired. Sign in again."); setBusy(false); return; }
    const payload: CompanyBranding & { updated_by: string; updated_at: string } = {
      ...form, display_name: form.display_name.trim(), legal_name: form.legal_name?.trim() || null,
      rc_number: form.rc_number?.trim() || null, tax_number: form.tax_number?.trim() || null,
      address: form.address?.trim() || null, phone: form.phone?.trim() || null, email: form.email?.trim() || null,
      website: form.website?.trim() || null, report_footer: form.report_footer?.trim() || null,
      onboarding_complete: true, updated_by: auth.user.id, updated_at: new Date().toISOString(),
    };
    const replaced: string[] = [];
    try {
      for (const key of Object.keys(files) as AssetKey[]) {
        const file = files[key]; if (!file) continue;
        const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
        const path = `${companyId}/${assetFolders[key]}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("company-branding").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        const pathKey = assetPathKeys[key]; const previous = payload[pathKey]; if (previous) replaced.push(previous); payload[pathKey] = path;
      }
      const { error: saveError } = await supabase.from("company_branding").upsert(payload, { onConflict: "company_id" });
      if (saveError) throw saveError;
      if (replaced.length) await supabase.storage.from("company-branding").remove(replaced);
      setForm(payload); setFiles({});
      setMessage(onboarding ? "Your company brand is ready." : "Branding saved. New reports will use these details.");
      router.refresh(); if (onboarding) window.setTimeout(() => router.push("/"), 600);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save the company branding."); }
    finally { setBusy(false); }
  }

  return <div className="branding-layout">
    <form className="branding-form" onSubmit={submit}>
      <section className="branding-card"><div className="branding-section-title"><small>Company identity</small><h2>Details shown on your reports</h2></div><div className="branding-fields">
        <label>Display name<input required value={form.display_name} onChange={e => field("display_name", e.target.value)} /></label>
        <label>Registered / legal name<input value={form.legal_name ?? ""} onChange={e => field("legal_name", e.target.value)} /></label>
        <label>RC / registration number<input value={form.rc_number ?? ""} onChange={e => field("rc_number", e.target.value)} /></label>
        <label>Tax identification number<input value={form.tax_number ?? ""} onChange={e => field("tax_number", e.target.value)} /></label>
        <label>Phone<input value={form.phone ?? ""} onChange={e => field("phone", e.target.value)} /></label>
        <label>Email<input type="email" value={form.email ?? ""} onChange={e => field("email", e.target.value)} /></label>
        <label>Website<input value={form.website ?? ""} onChange={e => field("website", e.target.value)} placeholder="www.yourcompany.com" /></label>
        <label className="wide">Office address<textarea rows={3} value={form.address ?? ""} onChange={e => field("address", e.target.value)} /></label>
      </div></section>
      <section className="branding-card"><div className="branding-section-title"><small>Logo & letterhead</small><h2>Upload your own report identity</h2><p>PNG, JPG, WEBP or SVG. Maximum 5 MB per file.</p></div><div className="branding-assets">
        <AssetInput label="Company logo" note="Used when a full letterhead is not supplied" preview={previews.logo} onChange={selectAsset("logo")} />
        <AssetInput label="Letterhead header" note="A wide image shown at the top of reports" preview={previews.letterheadHeader} wide onChange={selectAsset("letterheadHeader")} />
        <AssetInput label="Letterhead footer" note="Optional footer artwork" preview={previews.letterheadFooter} wide onChange={selectAsset("letterheadFooter")} />
      </div></section>
      <section className="branding-card"><div className="branding-section-title"><small>Report style</small><h2>Colours and footer text</h2></div><div className="branding-fields">
        <label>Primary colour<span className="colour-input"><input type="color" value={form.primary_color} onChange={e => field("primary_color", e.target.value.toUpperCase())} /><input value={form.primary_color} pattern="^#[0-9A-Fa-f]{6}$" onChange={e => field("primary_color", e.target.value)} /></span></label>
        <label>Secondary colour<span className="colour-input"><input type="color" value={form.secondary_color} onChange={e => field("secondary_color", e.target.value.toUpperCase())} /><input value={form.secondary_color} pattern="^#[0-9A-Fa-f]{6}$" onChange={e => field("secondary_color", e.target.value)} /></span></label>
        <label className="wide">Footer note<textarea rows={3} value={form.report_footer ?? ""} onChange={e => field("report_footer", e.target.value)} placeholder="Confidential report prepared for the client…" /></label>
      </div></section>
      {error && <p className="branding-message error">{error}</p>}{message && <p className="branding-message success">✓ {message}</p>}
      <button className="branding-save" disabled={busy}>{busy ? "Saving your brand…" : onboarding ? "Finish company setup" : "Save company branding"}</button>
    </form>
    <aside className="branding-preview-wrap"><div className="branding-preview-label">LIVE REPORT PREVIEW</div><article className="branding-preview" style={{ "--brand-primary": form.primary_color, "--brand-secondary": form.secondary_color } as CSSProperties}>
      {previews.letterheadHeader ? <img className="preview-letterhead" src={previews.letterheadHeader} alt="Letterhead preview" /> : <div className="preview-company-head">{previews.logo ? <img src={previews.logo} alt="Company logo preview" /> : <div className="preview-logo-placeholder">LOGO</div>}<div><b>{form.display_name || "Your company"}</b><span>{form.legal_name || "Registered company name"}</span></div></div>}
      <div className="preview-rule" /><small>PROJECT FINANCIAL REPORT</small><h3>Sample Construction Project</h3><p>Commercial and financial position</p>
      <div className="preview-kpis"><div><span>Current project value</span><b>₦29,587,943</b></div><div><span>Funding received</span><b>₦12,211,356</b></div><div><span>Confirmed spend</span><b>₦8,811,845</b></div><div><span>Cash position</span><b>₦3,399,511</b></div></div><div className="preview-lines"><i /><i /><i /></div>
      {previews.letterheadFooter ? <img className="preview-letterhead footer" src={previews.letterheadFooter} alt="Letterhead footer preview" /> : <footer>{form.report_footer || [form.address, form.phone, form.email].filter(Boolean).join(" · ") || "Your company contact details"}</footer>}
    </article><p>The accounting engine stays in the background. Reports shared with clients carry your company identity.</p></aside>
  </div>;
}

function AssetInput({ label, note, preview, wide, onChange }: { label: string; note: string; preview: string | null; wide?: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className={wide ? "branding-asset wide" : "branding-asset"}><span className={wide ? "asset-preview wide" : "asset-preview"}>{preview ? <img src={preview} alt="" /> : <b>{wide ? "LETTERHEAD" : "LOGO"}</b>}</span><strong>{label}</strong><small>{note}</small><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onChange} /></label>;
}

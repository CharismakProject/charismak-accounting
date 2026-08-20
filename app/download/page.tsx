const ANDROID_APK_URL = "https://github.com/CharismakProject/charismak-accounting/releases/download/android-latest/Charismak-Accounting-Android.apk";
const LOGO_URL = "https://raw.githubusercontent.com/CharismakProject/charismak-website/main/public/branding/charismak-logo.png";

export default function DownloadPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", display: "grid", placeItems: "center", padding: 28, color: "#102942" }}>
      <section style={{ width: "min(720px,100%)", background: "white", border: "1px solid #dfe7ee", borderRadius: 22, padding: 32, boxShadow: "0 20px 60px rgba(15,36,58,.10)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src={LOGO_URL} alt="Charismak" style={{ width: 66, height: 66, objectFit: "contain" }} />
          <div><small style={{ color: "#1768ac", fontWeight: 900, letterSpacing: ".12em" }}>ANDROID APP</small><h1 style={{ margin: "5px 0 0", fontSize: 28 }}>Charismak Accounting Mobile</h1></div>
        </div>
        <p style={{ color: "#617388", fontSize: 15, lineHeight: 1.65, margin: "24px 0" }}>A native, phone-first construction finance workspace. Sign in with the same Charismak Accounting account and work with the same live projects, records and permissions.</p>
        <a href={ANDROID_APK_URL} style={{ display: "block", background: "#0b4f82", color: "white", borderRadius: 13, padding: "15px 20px", textAlign: "center", textDecoration: "none", fontSize: 16, fontWeight: 900 }}>Download Android APK</a>
        <div style={{ marginTop: 25, background: "#f6f9fc", borderRadius: 14, padding: 18 }}>
          <b style={{ fontSize: 14 }}>Install on your Android phone</b>
          <ol style={{ color: "#617388", fontSize: 13, lineHeight: 1.75, paddingLeft: 20, margin: "10px 0 0" }}>
            <li>Tap Download Android APK.</li>
            <li>Open the downloaded file.</li>
            <li>If Android asks, allow installation from your browser for this install.</li>
            <li>Tap Install, then sign in with your existing account.</li>
          </ol>
        </div>
        <p style={{ color: "#8392a1", fontSize: 12, lineHeight: 1.55, margin: "18px 0 0" }}>Beta release for direct testing. Android may show a standard warning because this version is installed directly rather than through Google Play.</p>
      </section>
    </main>
  );
}

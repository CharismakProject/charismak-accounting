"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

const LOGO_URL = "https://raw.githubusercontent.com/CharismakProject/charismak-website/main/public/branding/charismak-logo.png";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        router.push("/");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
        },
      });
      if (error) {
        setMessage(error.message);
      } else if (!data.session) {
        setMessage("Account created. Check your email to confirm the account, then return here to sign in.");
        setMode("login");
      } else {
        router.push("/");
        router.refresh();
      }
    }
    setBusy(false);
  }

  async function resendConfirmation() {
    if (!email) {
      setMessage("Enter your email address first, then click resend confirmation.");
      return;
    }
    setResending(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
      },
    });
    setMessage(error ? error.message : "Confirmation email sent again. Check Inbox, Spam/Junk and Promotions.");
    setResending(false);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ width: "min(460px,100%)", background: "white", border: "1px solid #e1e8ef", borderRadius: 22, padding: 30, boxShadow: "0 20px 60px rgba(15,36,58,.10)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "white", border: "1px solid #dce4ec", display: "grid", placeItems: "center", position: "relative", overflow: "visible" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", background: "white", display: "grid", placeItems: "center" }}>
              <img src={LOGO_URL} alt="Charismak" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <b style={{ position: "absolute", right: -2, bottom: -2, width: 21, height: 21, borderRadius: "50%", background: "#0b3253", color: "white", fontSize: 11, display: "grid", placeItems: "center", border: "2px solid white" }}>A</b>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 25, color: "#102942" }}>Charismak Accounting</h1>
            <p style={{ margin: "4px 0 0", color: "#728296", fontSize: 13 }}>Track the truth. Every movement. Every project.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#f3f6f9", padding: 4, borderRadius: 12, marginBottom: 22 }}>
          <button onClick={() => { setMode("login"); setMessage(""); }} style={{ border: 0, borderRadius: 9, padding: 10, background: mode === "login" ? "white" : "transparent", fontWeight: 800 }}>Sign in</button>
          <button onClick={() => { setMode("signup"); setMessage(""); }} style={{ border: 0, borderRadius: 9, padding: 10, background: mode === "signup" ? "white" : "transparent", fontWeight: 800 }}>Create account</button>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          {mode === "signup" && <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>Full name<input required value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} /></label>}
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>Email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>Password<input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} /></label>
          {message && <p style={{ margin: 0, padding: 11, borderRadius: 10, background: "#fff5df", color: "#8d6005", fontSize: 12 }}>{message}</p>}
          <button disabled={busy} type="submit" style={{ border: 0, borderRadius: 12, padding: 13, background: "#0b3253", color: "white", fontWeight: 850 }}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
          {mode === "login" && (
            <button type="button" disabled={resending} onClick={resendConfirmation} style={{ border: "1px solid #cfd9e3", borderRadius: 12, padding: 11, background: "white", color: "#0b3253", fontWeight: 800 }}>
              {resending ? "Resending…" : "Resend confirmation email"}
            </button>
          )}
        </form>
      </section>
    </main>
  );
}

const inputStyle = { width: "100%", border: "1px solid #cfd9e3", borderRadius: 10, padding: "11px 12px", fontSize: 14 } as const;

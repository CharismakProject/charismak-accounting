"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, background: "#f4f7fb" }}>
      <section style={{ width: "min(520px, 100%)", padding: 28, border: "1px solid #dfe7ee", borderRadius: 16, background: "white", color: "#102942" }}>
        <small style={{ color: "#1768ac", fontWeight: 900, letterSpacing: ".12em" }}>ACCOUNTING</small>
        <h1 style={{ margin: "8px 0", fontSize: 26 }}>This page did not load correctly</h1>
        <p style={{ color: "#718295", lineHeight: 1.55 }}>Your records are safe. Retry the page; if the problem continues, the error reference below will help us trace it.</p>
        <button type="button" onClick={reset} style={{ marginTop: 12, border: 0, borderRadius: 9, padding: "11px 16px", background: "#082945", color: "white", fontWeight: 800 }}>Retry page</button>
        {error.digest && <p style={{ marginTop: 14, fontSize: 11, color: "#8a97a5" }}>Reference: {error.digest}</p>}
      </section>
    </main>
  );
}

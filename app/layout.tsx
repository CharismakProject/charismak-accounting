import type { Metadata } from "next";
import "./globals.css";

// Authenticated accounting pages depend on live Supabase session/company data.
// Force request-time rendering so Vercel does not evaluate those queries during build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charismak Accounting",
  description: "Construction accounting, cost control and treasury platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

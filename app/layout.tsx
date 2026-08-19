import type { Metadata } from "next";
import "./globals.css";
import "./responsive.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charismak Accounting",
  description: "Construction accounting, cost control and treasury platform",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

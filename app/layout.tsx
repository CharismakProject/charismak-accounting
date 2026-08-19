import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./responsive.css";
import "./statement-review.css";
import "./project-workspace.css";
import "./app-enhancements.css";
import "./role-dashboard.css";
import "./operations.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charismak Accounting",
  description: "Construction accounting, cost control and treasury platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

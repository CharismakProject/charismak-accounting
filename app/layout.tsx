import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./responsive.css";
import "./statement-review.css";
import "./project-workspace.css";
import "./app-enhancements.css";
import "./role-dashboard.css";
import "./operations.css";
import PwaRegister from "./PwaRegister";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charismak Accounting",
  description: "Construction accounting, cost control and treasury platform",
  manifest: "/manifest.webmanifest",
  applicationName: "Charismak Accounting",
  appleWebApp: {
    capable: true,
    title: "Charismak Accounting",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#082945",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}

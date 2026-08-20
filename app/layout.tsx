import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./responsive.css";
import "./statement-review.css";
import "./project-workspace.css";
import "./app-enhancements.css";
import "./role-dashboard.css";
import "./operations.css";
import "./workflow-enhancements.css";
import "./mobile-menu.css";
import "./chart-enhancements.css";
import "./mobile-v2.css";
import "./mobile-polish.css";
import "./project-documents.css";
import "./project-nav.css";
import "./product-simplification.css";
import "./branding.css";
import "./reports.css";
import "./typography-system.css";
import PwaRegister from "./PwaRegister";
import NotificationBell from "./NotificationBell";
import MobileMenu from "./MobileMenu";
import GlobalAddButton from "./GlobalAddButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charismak Accounting",
  description: "Construction accounting, cost control and treasury platform",
  applicationName: "Charismak Accounting",
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
        <NotificationBell />
        <GlobalAddButton />
        <MobileMenu />
        {children}
      </body>
    </html>
  );
}

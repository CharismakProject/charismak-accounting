import Link from "next/link";
import UploadStatementClient from "./UploadStatementClient";

export default function UploadStatementPage() {
  return (
    <main className="page-canvas">
      <div className="page-wrap narrow">
        <div className="page-toolbar">
          <Link href="/" className="back-link">← Dashboard</Link>
          <Link href="/statements" className="secondary-link">Statement history</Link>
        </div>

        <header className="page-heading compact">
          <div>
            <p className="page-eyebrow green">Recurring statement import</p>
            <h1>Upload bank statement</h1>
            <p>Upload each month from the same or a new account. The app stores the original securely and checks for exact duplicate files before registering the import.</p>
          </div>
        </header>

        <section className="compact-card">
          <UploadStatementClient />
        </section>

        <section className="info-strip">
          <b>Current working scope</b>
          <span>PDFs are stored and registered reliably. CSV transaction parsing exists. Bank-specific PDF transaction extraction will be added against the real statement formats you upload.</span>
        </section>
      </div>
    </main>
  );
}

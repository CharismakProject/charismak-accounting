import Link from "next/link";
import UploadStatementClient from "./UploadStatementClient";

export default function UploadStatementPage() {
  return (
    <main className="page-canvas">
      <div className="page-wrap upload-wrap">
        <div className="page-toolbar">
          <Link href="/" className="back-link">← Dashboard</Link>
          <Link href="/statements" className="secondary-link">Statement history</Link>
        </div>

        <header className="page-heading compact">
          <div>
            <p className="page-eyebrow green">Banking · recurring imports</p>
            <h1>Upload & analyse statements</h1>
            <p>Select one or several statements in the same batch. Each file keeps its own bank/account identity, duplicate check, transaction analysis and project-discovery result.</p>
          </div>
        </header>

        <section className="compact-card">
          <UploadStatementClient />
        </section>

        <section className="info-strip">
          <b>What happens automatically</b>
          <span>Each original file is stored privately → exact duplicates are blocked → transactions are extracted → existing project names/codes/aliases are checked → repeated unknown keywords are proposed as possible projects. Nothing changes an official project total until an authorised user confirms the classification.</span>
        </section>
      </div>
    </main>
  );
}

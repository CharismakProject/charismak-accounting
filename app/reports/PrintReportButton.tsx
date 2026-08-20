"use client";

export default function PrintReportButton() {
  return <button className="report-print-button" type="button" onClick={() => window.print()}>Print / Save as PDF</button>;
}

"use client";

import { useRef } from "react";
import { bulkCompanyLevel, bulkPersonal, bulkReconciliationOnly, bulkTransfer } from "./bulk-actions";

type ActionDef = {
  label: string;
  note: string;
  action: (formData: FormData) => Promise<void>;
  confirm: string;
};

export default function BulkResolvePanel({ importId, keyword, unresolvedCount }: { importId: string; keyword?: string; unresolvedCount: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  if (!unresolvedCount) return null;

  const actions: ActionDef[] = [
    {
      label: "Company-level",
      note: "Credits become company income; debits become company expense. No project is affected.",
      action: bulkCompanyLevel,
      confirm: "Mark all unresolved rows in this view as company-level transactions?",
    },
    {
      label: "Personal / non-business",
      note: "Keeps the bank movement for reconciliation but excludes it from project/company operating cost.",
      action: bulkPersonal,
      confirm: "Mark all unresolved rows in this view as personal/non-business?",
    },
    {
      label: "Internal transfer",
      note: "Use for movements between your own accounts/projects. It will not be treated as revenue or expense.",
      action: bulkTransfer,
      confirm: "Mark all unresolved rows in this view as internal transfers?",
    },
    {
      label: "Clear from project queue",
      note: "Keeps each bank row for reconciliation only. Nothing is deleted and nothing hits project/company P&L.",
      action: bulkReconciliationOnly,
      confirm: "Clear all unresolved rows in this view from the project review queue and keep them for reconciliation only?",
    },
  ];

  return (
    <section className="bulk-resolve-panel">
      <div className="bulk-resolve-copy">
        <small>BULK REVIEW</small>
        <b>{keyword ? `Apply to unresolved rows matching “${keyword}”` : `Resolve ${unresolvedCount.toLocaleString()} unresolved rows at once`}</b>
        <span>Project-matched rows should be handled first. These controls are for rows you have decided are not individual project postings.</span>
      </div>
      <div className="bulk-resolve-actions">
        {actions.map((item) => (
          <form
            ref={formRef}
            key={item.label}
            action={item.action}
            onSubmit={(event) => {
              if (!window.confirm(item.confirm)) event.preventDefault();
            }}
          >
            <input type="hidden" name="import_id" value={importId} />
            <input type="hidden" name="keyword" value={keyword || ""} />
            <button type="submit" title={item.note}>{item.label}</button>
          </form>
        ))}
      </div>
    </section>
  );
}

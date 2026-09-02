"use client";

import { useMemo, useState } from "react";
import {
  approveEstimatorBillCandidate,
  buildEstimatorBillReviewCandidate,
  type EstimatorBillApprovalDecisions,
  type EstimatorBillReviewCandidate,
} from "../../../lib/project-cost/from-estimator-bill";
import {
  normalizeEstimatorBridge,
  type SupplyResponsibility,
} from "../../../lib/project-cost/estimator-bridge";
import {
  COST_CODE_GROUPS,
  isValidCostCode,
  type CostCode,
} from "../../../lib/project-cost/cost-codes";
import { buildAccountingProjectSeed } from "../../../lib/project-cost/accounting-project-adapter";
import {
  buildStageEstimatorBudgetRpcArgs,
  type StageEstimatorBudgetRpcArgs,
} from "../../../lib/project-cost/persistence-contract";
import type { EstimatorReviewProjectOption } from "./page";

type PreparedReview = {
  args: StageEstimatorBudgetRpcArgs;
  project: EstimatorReviewProjectOption;
};

const money = (value: number | null | undefined, currency = "NGN") =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);

const controlStyle = {
  width: "100%",
  border: "1px solid #d8e1ea",
  borderRadius: 12,
  padding: "11px 12px",
  background: "white",
  color: "#0b2138",
  fontSize: 14,
} as const;

const labelStyle = {
  display: "grid",
  gap: 6,
  color: "#536579",
  fontSize: 12,
  fontWeight: 700,
} as const;

export default function EstimatorBudgetReview({
  projects,
  bridgeEnabled,
}: {
  projects: EstimatorReviewProjectOption[];
  bridgeEnabled: boolean;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<EstimatorBillReviewCandidate | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [costCodes, setCostCodes] = useState<Record<string, string>>({});
  const [responsibility, setResponsibility] = useState<
    Record<string, SupplyResponsibility>
  >({});
  const [internalBasis, setInternalBasis] = useState<
    "direct_cost" | "direct_plus_contingency" | "explicit"
  >("direct_plus_contingency");
  const [explicitInternalBudget, setExplicitInternalBudget] = useState("");
  const [contractBasis, setContractBasis] = useState<
    "none" | "subtotal_before_tax" | "grand_total" | "explicit"
  >("none");
  const [explicitContractValue, setExplicitContractValue] = useState("");
  const [prepared, setPrepared] = useState<PreparedReview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  const groupedSections = useMemo(() => {
    if (!candidate) return [];
    const groups = new Map<
      string,
      { id: string; title: string; lines: EstimatorBillReviewCandidate["lines"] }
    >();
    for (const line of candidate.lines) {
      const key = `${line.sectionId}:${line.sectionTitle}`;
      const current = groups.get(key) ?? {
        id: line.sectionId,
        title: line.sectionTitle,
        lines: [],
      };
      current.lines.push(line);
      groups.set(key, current);
    }
    return Array.from(groups.values());
  }, [candidate]);

  const unmappedCount = useMemo(
    () =>
      candidate?.lines.filter((line) => !isValidCostCode(costCodes[line.sourceLineId] ?? ""))
        .length ?? 0,
    [candidate, costCodes],
  );

  const readTransferFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setMessage(null);
    setPrepared(null);
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (
        parsed.schemaVersion !== 1 ||
        parsed.sourceSystem !== "charismak_estimator" ||
        parsed.reviewRequired !== true
      ) {
        throw new Error("This is not a Charismak Estimator Accounting hand-off file.");
      }

      const nextCandidate = buildEstimatorBillReviewCandidate(parsed as any);
      const nextCodes: Record<string, string> = {};
      const nextResponsibility: Record<string, SupplyResponsibility> = {};
      for (const line of nextCandidate.lines) {
        nextCodes[line.sourceLineId] = line.providedCostCode ?? "";
        nextResponsibility[line.sourceLineId] = "unknown";
      }

      const nameMatch = projects.find(
        (project) =>
          project.name.trim().toLowerCase() ===
          nextCandidate.projectName.trim().toLowerCase(),
      );

      setFileName(file.name);
      setCandidate(nextCandidate);
      setCostCodes(nextCodes);
      setResponsibility(nextResponsibility);
      setSelectedProjectId(nameMatch?.id ?? "");
      setInternalBasis("direct_plus_contingency");
      setContractBasis("none");
      setExplicitInternalBudget("");
      setExplicitContractValue("");
      setMessage(
        nameMatch
          ? `Matched to ${nameMatch.name}. Review the budget and cost codes before staging.`
          : "BOQ loaded. Choose the matching Accounting project and review the cost codes.",
      );
    } catch (loadError) {
      setCandidate(null);
      setFileName(null);
      setCostCodes({});
      setResponsibility({});
      setSelectedProjectId("");
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The Estimator hand-off could not be read.",
      );
    }
  };

  const setSectionCostCode = (lineIds: string[], code: string) => {
    setPrepared(null);
    setCostCodes((current) => {
      const next = { ...current };
      for (const lineId of lineIds) next[lineId] = code;
      return next;
    });
  };

  const validateReview = async () => {
    if (!candidate) return;
    setError(null);
    setMessage(null);
    setPrepared(null);

    try {
      if (!selectedProject) throw new Error("Choose the matching Accounting project.");
      if (unmappedCount > 0) {
        throw new Error(`Review the construction cost code for ${unmappedCount} BOQ item(s).`);
      }

      let internalCostBasis: EstimatorBillApprovalDecisions["internalCostBasis"];
      if (internalBasis === "direct_cost") {
        internalCostBasis = { kind: "direct_cost" };
      } else if (internalBasis === "direct_plus_contingency") {
        internalCostBasis = { kind: "direct_plus_contingency" };
      } else {
        const amount = Number(explicitInternalBudget);
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error("Enter a valid custom internal budget.");
        }
        internalCostBasis = { kind: "explicit", amount };
      }

      let contractValueBasis: EstimatorBillApprovalDecisions["contractValueBasis"];
      if (contractBasis === "none") contractValueBasis = { kind: "none" };
      else if (contractBasis === "subtotal_before_tax") {
        contractValueBasis = { kind: "subtotal_before_tax" };
      } else if (contractBasis === "grand_total") {
        contractValueBasis = { kind: "grand_total" };
      } else {
        const amount = Number(explicitContractValue);
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error("Enter a valid contract value snapshot.");
        }
        contractValueBasis = { kind: "explicit", amount };
      }

      const lineDecisions: EstimatorBillApprovalDecisions["lineDecisions"] = {};
      for (const line of candidate.lines) {
        const code = costCodes[line.sourceLineId] ?? "";
        if (!isValidCostCode(code)) {
          throw new Error(`Choose a cost code for “${line.description}”.`);
        }
        lineDecisions[line.sourceLineId] = {
          costCode: code as CostCode,
          supplyResponsibility: responsibility[line.sourceLineId] ?? "unknown",
        };
      }

      const reviewed = approveEstimatorBillCandidate(candidate, {
        internalCostBasis,
        contractValueBasis,
        lineDecisions,
      });
      const normalized = normalizeEstimatorBridge(reviewed);
      const seed = await buildAccountingProjectSeed(normalized);
      const args = buildStageEstimatorBudgetRpcArgs({
        companyId: selectedProject.companyId,
        projectId: selectedProject.id,
        seed,
      });

      setPrepared({ args, project: selectedProject });
      setMessage(
        bridgeEnabled
          ? "Review passed. This budget is ready to be staged as an Accounting draft."
          : "Review passed. The budget is ready; database staging remains disabled on this preview branch.",
      );
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "The Accounting review could not be completed.",
      );
    }
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="compact-card">
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <b>1. Load the completed Estimator BOQ</b>
            <p style={{ margin: "6px 0 0", color: "#718195" }}>
              Use the Accounting hand-off exported from a completed, locked BOQ.
            </p>
          </div>
          <label style={labelStyle}>
            Estimator Accounting hand-off (.json)
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => void readTransferFile(event.target.files?.[0] ?? null)}
              style={controlStyle}
            />
          </label>
          {fileName ? (
            <span style={{ color: "#1b6b49", fontSize: 12, fontWeight: 800 }}>
              Loaded: {fileName}
            </span>
          ) : null}
        </div>
      </section>

      {message ? (
        <div
          style={{
            border: "1px solid #b9d7c7",
            background: "#f1faf5",
            color: "#285e45",
            padding: "12px 14px",
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      ) : null}
      {error ? (
        <div
          style={{
            border: "1px solid #f0c1b4",
            background: "#fff4f0",
            color: "#9f3518",
            padding: "12px 14px",
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      ) : null}

      {candidate ? (
        <>
          <section className="compact-card">
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <b>2. Confirm the project and budget</b>
                <p style={{ margin: "6px 0 0", color: "#718195" }}>
                  Estimator project: <strong>{candidate.projectName}</strong> · Version {candidate.sourceVersion}
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 10,
                }}
              >
                <div className="compact-card" style={{ margin: 0 }}>
                  <small>Direct BOQ cost</small>
                  <b style={{ display: "block", marginTop: 5 }}>
                    {money(candidate.totals.directCost, candidate.currency)}
                  </b>
                </div>
                <div className="compact-card" style={{ margin: 0 }}>
                  <small>Contingency</small>
                  <b style={{ display: "block", marginTop: 5 }}>
                    {money(candidate.totals.contingency, candidate.currency)}
                  </b>
                </div>
                <div className="compact-card" style={{ margin: 0 }}>
                  <small>Overhead + profit</small>
                  <b style={{ display: "block", marginTop: 5 }}>
                    {money(candidate.totals.overhead + candidate.totals.profit, candidate.currency)}
                  </b>
                </div>
                <div className="compact-card" style={{ margin: 0 }}>
                  <small>BOQ grand total</small>
                  <b style={{ display: "block", marginTop: 5 }}>
                    {money(candidate.totals.grandTotal, candidate.currency)}
                  </b>
                </div>
              </div>

              <label style={labelStyle}>
                Matching Accounting project
                <select
                  value={selectedProjectId}
                  onChange={(event) => {
                    setPrepared(null);
                    setSelectedProjectId(event.target.value);
                  }}
                  style={controlStyle}
                >
                  <option value="">Choose project…</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.projectCode ? `${project.projectCode} · ` : ""}
                      {project.name}
                      {project.location ? ` · ${project.location}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {selectedProject ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                    gap: 10,
                    padding: 12,
                    borderRadius: 14,
                    background: "#f6f8fb",
                  }}
                >
                  <span style={{ fontSize: 12, color: "#607186" }}>
                    Accounting project: <b style={{ color: "#0b2138" }}>{selectedProject.name}</b>
                  </span>
                  <span style={{ fontSize: 12, color: "#607186" }}>
                    Existing contract value: <b style={{ color: "#0b2138" }}>{money(selectedProject.contractValue, candidate.currency)}</b>
                  </span>
                </div>
              ) : null}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
                  gap: 12,
                }}
              >
                <label style={labelStyle}>
                  Internal project budget
                  <select
                    value={internalBasis}
                    onChange={(event) => {
                      setPrepared(null);
                      setInternalBasis(event.target.value as typeof internalBasis);
                    }}
                    style={controlStyle}
                  >
                    <option value="direct_plus_contingency">Direct cost + contingency</option>
                    <option value="direct_cost">Direct cost only</option>
                    <option value="explicit">Custom reviewed budget</option>
                  </select>
                </label>
                {internalBasis === "explicit" ? (
                  <label style={labelStyle}>
                    Custom internal budget
                    <input
                      inputMode="decimal"
                      value={explicitInternalBudget}
                      onChange={(event) => {
                        setPrepared(null);
                        setExplicitInternalBudget(event.target.value);
                      }}
                      style={controlStyle}
                      placeholder="0"
                    />
                  </label>
                ) : null}

                <label style={labelStyle}>
                  Commercial value snapshot
                  <select
                    value={contractBasis}
                    onChange={(event) => {
                      setPrepared(null);
                      setContractBasis(event.target.value as typeof contractBasis);
                    }}
                    style={controlStyle}
                  >
                    <option value="none">Do not import a contract value</option>
                    <option value="subtotal_before_tax">BOQ subtotal before VAT</option>
                    <option value="grand_total">BOQ grand total</option>
                    <option value="explicit">Custom reviewed value</option>
                  </select>
                </label>
                {contractBasis === "explicit" ? (
                  <label style={labelStyle}>
                    Custom commercial value
                    <input
                      inputMode="decimal"
                      value={explicitContractValue}
                      onChange={(event) => {
                        setPrepared(null);
                        setExplicitContractValue(event.target.value);
                      }}
                      style={controlStyle}
                      placeholder="0"
                    />
                  </label>
                ) : null}
              </div>
            </div>
          </section>

          <section className="compact-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <b>3. Confirm construction cost codes</b>
                <p style={{ margin: "6px 0 0", color: "#718195" }}>
                  Apply one code to a whole BOQ section, then adjust individual items only where needed.
                </p>
              </div>
              <span
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 999,
                  padding: "7px 11px",
                  background: unmappedCount ? "#fff0eb" : "#eef9f3",
                  color: unmappedCount ? "#a83c1b" : "#176b48",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {unmappedCount ? `${unmappedCount} item(s) still need a code` : "All items coded"}
              </span>
            </div>

            <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
              {groupedSections.map((section) => (
                <article
                  key={`${section.id}:${section.title}`}
                  style={{
                    border: "1px solid #dde4ec",
                    borderRadius: 16,
                    overflow: "hidden",
                    background: "white",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0,1fr) minmax(180px,260px)",
                      gap: 12,
                      alignItems: "center",
                      padding: 14,
                      background: "#f6f8fb",
                    }}
                  >
                    <div>
                      <b>{section.title}</b>
                      <small style={{ display: "block", marginTop: 3, color: "#718195" }}>
                        {section.lines.length} BOQ item(s)
                      </small>
                    </div>
                    <select
                      defaultValue=""
                      onChange={(event) => {
                        if (!event.target.value) return;
                        setSectionCostCode(
                          section.lines.map((line) => line.sourceLineId),
                          event.target.value,
                        );
                      }}
                      style={controlStyle}
                      aria-label={`Apply cost code to ${section.title}`}
                    >
                      <option value="">Apply code to section…</option>
                      {COST_CODE_GROUPS.map((group) => (
                        <option key={group.code} value={group.code}>
                          {group.code} · {group.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid" }}>
                    {section.lines.map((line) => (
                      <div
                        key={line.sourceLineId}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0,1.4fr) minmax(180px,.7fr) minmax(145px,.55fr)",
                          gap: 10,
                          alignItems: "center",
                          padding: 12,
                          borderTop: "1px solid #edf1f5",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <b style={{ fontSize: 13 }}>{line.description}</b>
                          <small style={{ display: "block", marginTop: 3, color: "#718195" }}>
                            {line.quantity ?? "—"} {line.unit ?? ""} · {money(line.amount, candidate.currency)}
                          </small>
                        </div>
                        <select
                          value={costCodes[line.sourceLineId] ?? ""}
                          onChange={(event) => {
                            setPrepared(null);
                            setCostCodes((current) => ({
                              ...current,
                              [line.sourceLineId]: event.target.value,
                            }));
                          }}
                          style={controlStyle}
                          aria-label={`Cost code for ${line.description}`}
                        >
                          <option value="">Choose cost code…</option>
                          {COST_CODE_GROUPS.map((group) => (
                            <option key={group.code} value={group.code}>
                              {group.code} · {group.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={responsibility[line.sourceLineId] ?? "unknown"}
                          onChange={(event) => {
                            setPrepared(null);
                            setResponsibility((current) => ({
                              ...current,
                              [line.sourceLineId]: event.target.value as SupplyResponsibility,
                            }));
                          }}
                          style={controlStyle}
                          aria-label={`Supply responsibility for ${line.description}`}
                        >
                          <option value="unknown">Responsibility: review</option>
                          <option value="contractor">Contractor</option>
                          <option value="client">Client</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="compact-card">
            <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div>
                <b>4. Validate the Accounting budget</b>
                <p style={{ margin: "6px 0 0", color: "#718195" }}>
                  Validation checks project identity, source version, line totals, allowances and every cost code.
                </p>
              </div>
              <button type="button" onClick={() => void validateReview()} className="md-button">
                Validate review
              </button>
            </div>

            {prepared ? (
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  marginTop: 16,
                  padding: 16,
                  borderRadius: 16,
                  background: "#f4f8fc",
                  border: "1px solid #d7e1eb",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                    gap: 10,
                  }}
                >
                  <div><small>Accounting project</small><b style={{ display: "block", marginTop: 4 }}>{prepared.project.name}</b></div>
                  <div><small>Direct cost</small><b style={{ display: "block", marginTop: 4 }}>{money(prepared.args.budget_direct_cost, candidate.currency)}</b></div>
                  <div><small>Allowance / reserve</small><b style={{ display: "block", marginTop: 4 }}>{money(prepared.args.budget_allowance_total, candidate.currency)}</b></div>
                  <div><small>Reviewed internal budget</small><b style={{ display: "block", marginTop: 4 }}>{money(prepared.args.budget_internal_cost, candidate.currency)}</b></div>
                </div>
                <p style={{ margin: 0, color: "#617286", fontSize: 12, lineHeight: 1.6 }}>
                  Source Version {prepared.args.estimator_version} is fingerprinted and will stage as a draft. Re-importing the same reviewed source will not create a duplicate budget.
                </p>
                <button
                  type="button"
                  disabled={!bridgeEnabled}
                  title={bridgeEnabled ? "Database staging is enabled" : "Database staging is intentionally disabled on this preview branch"}
                  className="md-button"
                  style={{ opacity: bridgeEnabled ? 1 : 0.45, cursor: bridgeEnabled ? "pointer" : "not-allowed" }}
                >
                  {bridgeEnabled ? "Stage draft budget" : "Stage disabled until migration approval"}
                </button>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

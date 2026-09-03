import assert from "node:assert/strict";
import test from "node:test";
import { buildCommitmentForecastPosition } from "../lib/project-cost/commitment-forecast-review.ts";

test("unpaid commitments are calculated without double counting paid amounts", () => {
  const result = buildCommitmentForecastPosition({
    projectId: "p1",
    commitments: [
      { id: "c1", projectId: "p1", description: "Blockwork subcontract", costCode: "04", committedAmount: 900_000, paidAmount: 300_000, status: "open" },
    ],
    snapshot: { projectId: "p1", reviewedAt: "2026-09-03T06:00:00Z", lines: [{ costCode: "04", amount: 800_000 }] },
  });
  assert.equal(result.commitmentTotal, 900_000);
  assert.equal(result.paidAgainstCommitments, 300_000);
  assert.equal(result.unpaidCommitmentTotal, 600_000);
  assert.equal(result.costToCompleteTotal, 800_000);
  const blockwork = result.costToCompleteByCode.find((row) => row.costCode === "04");
  assert.equal(blockwork?.headroomAfterCommitments, 200_000);
  assert.equal(blockwork?.status, "covers_commitments");
  assert.equal(result.readyForForecast, true);
});

test("forecast cost to complete cannot be below known unpaid commitments", () => {
  const result = buildCommitmentForecastPosition({
    projectId: "p1",
    commitments: [
      { id: "c1", projectId: "p1", description: "Roof balance", costCode: "06", committedAmount: 500_000, paidAmount: 100_000, status: "open" },
    ],
    snapshot: { projectId: "p1", reviewedAt: "2026-09-03T06:00:00Z", lines: [{ costCode: "06", amount: 300_000 }] },
  });
  assert.equal(result.readyForForecast, false);
  assert.match(result.issues.join(" "), /below known unpaid commitments/i);
});

test("cancelled commitments are excluded from exposure", () => {
  const result = buildCommitmentForecastPosition({
    projectId: "p1",
    commitments: [
      { id: "cancelled", projectId: "p1", description: "Cancelled supply", costCode: "07", committedAmount: 1_000_000, paidAmount: 0, status: "cancelled" },
    ],
    snapshot: { projectId: "p1", reviewedAt: "2026-09-03T06:00:00Z", lines: [] },
  });
  assert.equal(result.commitmentTotal, 0);
  assert.equal(result.unpaidCommitmentTotal, 0);
  assert.equal(result.readyForForecast, true);
});

test("closed commitments cannot retain an unpaid balance", () => {
  const result = buildCommitmentForecastPosition({
    projectId: "p1",
    commitments: [
      { id: "closed", projectId: "p1", description: "Closed work", costCode: "12", committedAmount: 200_000, paidAmount: 100_000, status: "closed" },
    ],
    snapshot: { projectId: "p1", reviewedAt: "2026-09-03T06:00:00Z", lines: [{ costCode: "12", amount: 100_000 }] },
  });
  assert.equal(result.readyForForecast, false);
  assert.match(result.issues.join(" "), /closed commitment/i);
});

test("forecast review is unavailable until explicitly supplied", () => {
  const result = buildCommitmentForecastPosition({ projectId: "p1", commitments: [], snapshot: null });
  assert.equal(result.costToCompleteTotal, null);
  assert.equal(result.readyForForecast, false);
  assert.ok(result.costToCompleteByCode.every((row) => row.forecastCostToComplete === null));
});

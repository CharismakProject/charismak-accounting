import test from "node:test";
import assert from "node:assert/strict";
import { parseBoqWorkbookSheets } from "../supabase/functions/_shared/boq-workbook-parser.ts";

test("parses S/N Description Qty Unit Rate Amount and preserves section headings", () => {
  const result = parseBoqWorkbookSheets([{
    name: "Bill 1",
    rows: [
      ["PROJECT BOQ"],
      ["S/N", "Description", "Qty", "Unit", "Rate", "Amount"],
      ["", "SUBSTRUCTURE", "", "", "", ""],
      ["1", "Excavate foundation trenches", "85", "m3", "2500", "212,500"],
      ["2", "Plain concrete blinding", "12.5", "m3", "145000", "1,812,500"],
      ["", "SUBTOTAL", "", "", "", "2,025,000"],
      ["", "BLOCKWORK", "", "", "", ""],
      ["3", "225mm hollow block wall", "1820", "m2", "18500", "33,670,000"],
    ],
  }], "Jahi BOQ.xlsx");

  assert.equal(result.itemCount, 3);
  assert.deepEqual(result.recognizedSheets, ["Bill 1"]);
  assert.equal(result.boq.sections.length, 2);
  assert.equal(result.boq.sections[0].title, "SUBSTRUCTURE");
  assert.equal(result.boq.sections[1].title, "BLOCKWORK");
  assert.equal(result.boq.sections[0].items[0].quantity, 85);
  assert.equal(result.boq.sections[0].items[0].amount, 212500);
  assert.equal(result.boq.sections[1].items[0].itemNo, "3");
  assert.equal(result.boq.sections[1].items[0].materialBreakdown.status, "needs_review");
});

test("real hospitality BOQ keeps measured total descriptions and ignores narrative headings", () => {
  const result = parseBoqWorkbookSheets([{
    name: "Bill of Quantities",
    rows: [
      ["ELEMENT NO. 1 - SCREEDS AND FLOOR PREPARATION"],
      ["INFORMATION"],
      ["M10: SAND CEMENT SCREEDS/TOPPINGS"],
      ["No", "Item Description", "Qty", "Unit", "Rate (₦)", "Amount (₦)"],
      ["A", "10mm levelling screed to floors", 35, "m2", 3550, 124250],
      ["ELEMENT NO. 9 - CEILING FINISHES"],
      ["INFORMATION"],
      ["CF01: GYPSUM BOARD"],
      ["gypsum board fixed using aluminum profiles at 60cm spacing minimum; rate to include materials, joint tape, labour and transport"],
      ["No", "Item Description", "Qty", "Unit", "Rate (₦)", "Amount (₦)"],
      ["A", "indoor flat surface area to be covered", 373, "m2", 13500, 5035500],
      ["CF04: PAINTING"],
      ["allow budget for screeding and painting; apply primer and two coats after preparation"],
      ["No", "Item Description", "Qty", "Unit", "Rate (₦)", "Amount (₦)"],
      ["R", "total paint area:", 414, "m2", 6500, 2691000],
      ["PAINT — CARRIED TO SUMMARY", "", "", "", "", 2691000],
      ["GRAND TOTAL — BILL NR. 1 + BILL NR. 9", "", "", "", "", 22214355],
    ],
  }], "Sora Restaurant BOQ.xlsx");

  assert.equal(result.itemCount, 3);
  assert.deepEqual(result.boq.sections.map((section) => section.title), [
    "M10: SAND CEMENT SCREEDS/TOPPINGS",
    "CF01: GYPSUM BOARD",
    "CF04: PAINTING",
  ]);
  const paint = result.boq.sections[2].items[0];
  assert.equal(paint.itemNo, "R");
  assert.equal(paint.description, "total paint area:");
  assert.equal(paint.quantity, 414);
  assert.equal(paint.amount, 2691000);
  assert.ok(result.boq.sections.every((section) => !/gypsum board fixed using/i.test(section.title)));
  assert.ok(result.boq.sections.every((section) => !/allow budget for screeding/i.test(section.title)));
});

test("accepts reordered alternate headings and unpriced BOQ", () => {
  const result = parseBoqWorkbookSheets([{
    name: "Roofing",
    rows: [
      ["Particulars", "UOM", "Item No.", "Measured Quantity"],
      ["Supply and install longspan aluminium roofing", "m²", "R1", "560"],
      ["Ridge cap", "m", "R2", "42"],
    ],
  }], "Unpriced works.xlsx");

  assert.equal(result.itemCount, 2);
  assert.equal(result.boq.sections[0].title, "Roofing");
  assert.equal(result.boq.sections[0].items[0].itemNo, "R1");
  assert.equal(result.boq.sections[0].items[0].quantity, 560);
  assert.equal(result.boq.sections[0].items[0].rate, null);
  assert.equal(result.boq.sections[0].items[0].amount, null);
});

test("uses worksheet names as sections and ignores non-BOQ sheets", () => {
  const result = parseBoqWorkbookSheets([
    {
      name: "Preliminaries",
      rows: [
        ["Ref", "Description of Work", "Unit", "Quantity", "Unit Price", "Total Amount"],
        ["P1", "Mobilisation to site", "LS", "1", "2500000", "2500000"],
      ],
    },
    {
      name: "Electrical",
      rows: [
        ["No", "Scope of Work", "Qty", "UOM", "Rate", "Value"],
        ["E1", "20mm PVC conduit", "1200", "m", "650", "780000"],
      ],
    },
    {
      name: "Cover",
      rows: [["CHARISMAK PROJECT"], ["BILL OF QUANTITIES"]],
    },
  ], "Project.xlsx");

  assert.equal(result.itemCount, 2);
  assert.deepEqual(result.recognizedSheets, ["Preliminaries", "Electrical"]);
  assert.deepEqual(result.skippedSheets, ["Cover"]);
  assert.deepEqual(result.boq.sections.map((s) => s.title), ["Preliminaries", "Electrical"]);
});

test("flags lump-sum or incomplete quantities for review instead of dropping the line", () => {
  const result = parseBoqWorkbookSheets([{
    name: "Preliminaries",
    rows: [
      ["S/N", "Description", "Unit", "Rate", "Amount"],
      ["1", "Contractor mobilisation", "LS", "1500000", "1500000"],
      ["2", "Temporary site office", "", "800000", "800000"],
    ],
  }], "Prelims.xlsx");

  assert.equal(result.itemCount, 2);
  assert.equal(result.boq.sections[0].items[0].quantity, 1);
  assert.equal(result.boq.sections[0].items[1].unit, "item");
  assert.ok(result.warnings.some((w) => /quantity 1/i.test(w.message)));
  assert.ok(result.warnings.some((w) => /unit is shown as “item”/i.test(w.message)));
});

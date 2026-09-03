import test from "node:test";
import assert from "node:assert/strict";
import {
  detectBoqHeaderRow,
  mapBoqHeaderRow,
  matchBoqColumnHeader,
} from "../lib/estimate/boq-column-mapping.ts";

test("maps S/N, Description, Qty, Unit, Rate, Amount regardless of order", () => {
  const mapped = mapBoqHeaderRow(["S/N", "Description", "Qty", "Unit", "Rate", "Amount"]);
  assert.deepEqual(mapped, {
    serial: 0,
    description: 1,
    quantity: 2,
    unit: 3,
    rate: 4,
    amount: 5,
  });
});

test("maps alternate professional BOQ headings", () => {
  const mapped = mapBoqHeaderRow([
    "Item No.",
    "Description of Work",
    "Unit of Measurement",
    "Measured Quantity",
    "Unit Price",
    "Total Amount",
  ]);
  assert.deepEqual(mapped, {
    serial: 0,
    description: 1,
    unit: 2,
    quantity: 3,
    rate: 4,
    amount: 5,
  });
});

test("recognizes an explicit section column in wide professional bills", () => {
  const mapped = mapBoqHeaderRow(["Section", "Item No.", "Description", "Specification / Scope", "Unit", "Qty", "Rate", "Amount"]);
  assert.deepEqual(mapped, {
    section: 0,
    serial: 1,
    description: 2,
    unit: 4,
    quantity: 5,
    rate: 6,
    amount: 7,
  });
});

test("uses the rightmost duplicate commercial Rate and Amount columns", () => {
  const mapped = mapBoqHeaderRow(["ITEM", "DESCRIPTION", "UNIT", "QTY", "RATE (₦)", "RATE (₦)", "AMOUNT (₦)"]);
  assert.equal(mapped.serial, 0);
  assert.equal(mapped.description, 1);
  assert.equal(mapped.unit, 2);
  assert.equal(mapped.quantity, 3);
  assert.equal(mapped.rate, 5);
  assert.equal(mapped.amount, 6);
});

test("detects an unpriced BOQ header without requiring rate or amount", () => {
  const rows = [
    ["PROJECT: SAMPLE RESIDENCE"],
    ["SUBSTRUCTURE"],
    ["Ref", "Particulars", "UOM", "QTY"],
    ["1.1", "Excavate foundation trenches", "m3", 42],
  ];
  const detected = detectBoqHeaderRow(rows);
  assert.ok(detected);
  assert.equal(detected.rowIndex, 2);
  assert.deepEqual(detected.columns, {
    serial: 0,
    description: 1,
    unit: 2,
    quantity: 3,
  });
});

test("supports common aliases without treating arbitrary text as a header", () => {
  assert.equal(matchBoqColumnHeader("Section"), "section");
  assert.equal(matchBoqColumnHeader("Particulars"), "description");
  assert.equal(matchBoqColumnHeader("Qnty"), "quantity");
  assert.equal(matchBoqColumnHeader("UOM"), "unit");
  assert.equal(matchBoqColumnHeader("Quoted Rate"), "rate");
  assert.equal(matchBoqColumnHeader("Line Total"), "amount");
  assert.equal(matchBoqColumnHeader("Reinforced concrete in foundations"), null);
});

test("chooses the strongest BOQ header row when title rows appear above it", () => {
  const rows = [
    ["BILL OF QUANTITIES"],
    ["Description", "Amount"],
    ["S/N", "Work Description", "Qty", "Unit", "Rate", "Amount"],
  ];
  const detected = detectBoqHeaderRow(rows);
  assert.ok(detected);
  assert.equal(detected.rowIndex, 2);
  assert.equal(detected.columns.description, 1);
  assert.equal(detected.columns.quantity, 2);
  assert.equal(detected.columns.amount, 5);
});

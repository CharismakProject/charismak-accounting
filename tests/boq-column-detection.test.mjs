import test from "node:test";
import assert from "node:assert/strict";
import {
  PRIMARY_BOQ_COLUMNS,
  detectBoqColumns,
  findBestBoqHeader,
  identifyBoqColumn,
  isUsableBoqHeader,
} from "../lib/estimate/boq-columns.ts";

test("primary BOQ layout is S/N, Description, Qty, Unit, Rate, Amount", () => {
  assert.deepEqual(PRIMARY_BOQ_COLUMNS, ["serial", "description", "quantity", "unit", "rate", "amount"]);
  assert.deepEqual(detectBoqColumns(["S/N", "Description", "Qty", "Unit", "Rate", "Amount"]), {
    serial: 0,
    description: 1,
    quantity: 2,
    unit: 3,
    rate: 4,
    amount: 5,
  });
});

test("common BOQ header aliases are accepted", () => {
  assert.equal(identifyBoqColumn("Item No."), "serial");
  assert.equal(identifyBoqColumn("Description of Work"), "description");
  assert.equal(identifyBoqColumn("Quantity"), "quantity");
  assert.equal(identifyBoqColumn("UOM"), "unit");
  assert.equal(identifyBoqColumn("Unit Rate"), "rate");
  assert.equal(identifyBoqColumn("Total Amount"), "amount");
});

test("column order can change without breaking import", () => {
  assert.deepEqual(detectBoqColumns(["Description", "Unit", "Qty", "Amount", "Rate", "S/N"]), {
    description: 0,
    unit: 1,
    quantity: 2,
    amount: 3,
    rate: 4,
    serial: 5,
  });
});

test("description, quantity and unit are the minimum usable BOQ header", () => {
  assert.equal(isUsableBoqHeader(["S/N", "Description", "Qty", "Unit"]), true);
  assert.equal(isUsableBoqHeader(["Description", "Rate", "Amount"]), false);
});

test("best BOQ header is detected even when title rows come first", () => {
  const result = findBestBoqHeader([
    ["BILL OF QUANTITIES"],
    ["Project: Jahi Residence"],
    ["S/N", "Description", "Qty", "Unit", "Rate", "Amount"],
  ]);
  assert.equal(result?.rowIndex, 2);
  assert.equal(result?.columns.description, 1);
  assert.equal(result?.columns.quantity, 2);
});

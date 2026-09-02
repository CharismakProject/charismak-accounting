import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRateReference,
  priceBoqLine,
  reviewBoqRate,
  selectWorkingRate,
} from "../lib/estimate/rate-engine.ts";

const observations = [
  { id:"1", rate:18000, currency:"NGN", unit:"m2", observedAt:"2026-08-01", sourceLabel:"Supplier A", location:{country:"Nigeria",state:"FCT",city:"Abuja"} },
  { id:"2", rate:18500, currency:"NGN", unit:"m2", observedAt:"2026-08-03", sourceLabel:"Supplier B", location:{country:"Nigeria",state:"FCT",city:"Abuja"} },
  { id:"3", rate:19000, currency:"NGN", unit:"m2", observedAt:"2026-08-05", sourceLabel:"Project history", location:{country:"Nigeria",state:"FCT",city:"Abuja"} },
  { id:"4", rate:19500, currency:"NGN", unit:"m2", observedAt:"2026-08-07", sourceLabel:"Supplier C", location:{country:"Nigeria",state:"FCT",city:"Abuja"} },
  { id:"5", rate:20000, currency:"NGN", unit:"m2", observedAt:"2026-08-09", sourceLabel:"Supplier D", location:{country:"Nigeria",state:"FCT",city:"Abuja"} },
];

test("builds a location-aware reference range from reviewed observations", () => {
  const ref = buildRateReference(observations, {currency:"NGN",unit:"m2",location:{country:"Nigeria",state:"FCT",city:"Abuja"}});
  assert.ok(ref);
  assert.equal(ref.typical, 19000);
  assert.equal(ref.low, 18500);
  assert.equal(ref.high, 19500);
  assert.equal(ref.observationCount, 5);
  assert.equal(ref.confidence, "high");
});

test("keeps imported rate as working rate until the user changes it", () => {
  const ref = buildRateReference(observations, {currency:"NGN",unit:"m2"});
  const review = reviewBoqRate({importedRate:18500,reference:ref});
  assert.equal(review.workingRate,18500);
  assert.equal(review.workingRateSource,"imported");
  assert.equal(review.status,"within_reference");
});

test("flags outliers without overwriting the imported rate", () => {
  const ref = buildRateReference(observations, {currency:"NGN",unit:"m2"});
  const review = reviewBoqRate({importedRate:12000,reference:ref});
  assert.equal(review.workingRate,12000);
  assert.equal(review.status,"below_reference");
  assert.equal(review.requiresAttention,true);
});

test("unpriced BOQ remains unpriced even when a reference exists", () => {
  const ref = buildRateReference(observations, {currency:"NGN",unit:"m2"});
  const review = reviewBoqRate({importedRate:null,reference:ref});
  assert.equal(review.workingRate,null);
  assert.equal(review.status,"unpriced");
  assert.equal(review.requiresAttention,true);
});

test("user can explicitly choose a Charismak reference rate", () => {
  const ref = buildRateReference(observations, {currency:"NGN",unit:"m2"});
  const initial = reviewBoqRate({importedRate:22000,reference:ref});
  const selected = selectWorkingRate(initial,{rate:ref.typical,source:"charismak_reference"});
  assert.equal(selected.workingRate,19000);
  assert.equal(selected.workingRateSource,"charismak_reference");
  assert.equal(selected.status,"within_reference");
  assert.equal(priceBoqLine(100,selected),1900000);
});

test("zero-value working rate is preserved for no-charge or client-supplied lines", () => {
  const initial = reviewBoqRate({importedRate:5000,reference:null});
  const selected = selectWorkingRate(initial,{rate:0,source:"manual"});
  assert.equal(selected.workingRate,0);
  assert.equal(selected.workingRateSource,"manual");
  assert.equal(priceBoqLine(25,selected),0);
});

test("without a reference, imported rates remain usable and clearly marked", () => {
  const review = reviewBoqRate({importedRate:2500,reference:null});
  assert.equal(review.status,"reference_unavailable");
  assert.equal(review.workingRate,2500);
  assert.equal(review.requiresAttention,false);
});

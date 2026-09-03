import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const web=readFileSync(new URL("../app/projects/[id]/cost-control/page.tsx",import.meta.url),"utf8");const mobile=readFileSync(new URL("../mobile/app/project-cost/[id].tsx",import.meta.url),"utf8");
test("cost control is feature-gated on web and mobile",()=>{assert.match(web,/PROJECT_COST_BRIDGE_ENABLED/);assert.match(mobile,/EXPO_PUBLIC_PROJECT_COST_BRIDGE_ENABLED/);});
test("actual cost reads posted expenses only",()=>{for(const source of [web,mobile]){assert.match(source,/\.eq\("kind","expense"\)/);assert.match(source,/\.eq\("status","posted"\)/);assert.doesNotMatch(source,/\.eq\("kind","income"\)/);}});
test("unknown commitments and forecast are presented as unavailable while forecast extension is disabled",()=>{assert.match(web,/commitments\s*:\s*forecastEnabled\s*\?[\s\S]*?\:\s*null/);assert.match(web,/let\s+forecastCostToComplete\s*:\s*number\s*\|\s*null\s*=\s*null/);assert.match(web,/if\s*\(forecastEnabled&&forecast\?\.id\)/);assert.match(mobile,/Unpaid Commitments/);assert.match(mobile,/Forecast Final Cost/);});

import test from "node:test";
import assert from "node:assert/strict";
import { COST_CODE_GROUPS } from "../lib/project-cost/cost-codes.ts";
import { REVIEW_COST_CODES, decorateBoqWithReview, suggestBoqItemReview } from "../supabase/functions/_shared/boq-review.ts";

test("review cost-code labels stay aligned with the shared project-cost taxonomy", () => {
  assert.deepEqual(
    REVIEW_COST_CODES.map(([code,name])=>({code,name})),
    COST_CODE_GROUPS.map(({code,name})=>({code,name})),
  );
});

test("225mm blockwork gets masonry classification and a thickness-specific recipe", () => {
  const result=suggestBoqItemReview("Blockwork & Masonry",{description:"225mm hollow sandcrete block wall in cement sand mortar",unit:"m²",quantity:120});
  assert.equal(result.costCode,"04");
  assert.equal(result.recipeFamily,"blockwork_225");
  assert.equal(result.supplyResponsibility,"contractor");
  assert.equal(result.requiresAttention,false);
});

test("concrete, reinforcement and formwork remain separate recipes under one cost group", () => {
  const concrete=suggestBoqItemReview("Concrete Works",{description:"Reinforced concrete in foundation bases",unit:"m³"});
  const rebar=suggestBoqItemReview("Concrete Works",{description:"High yield reinforcement Y12 bars",unit:"kg"});
  const formwork=suggestBoqItemReview("Concrete Works",{description:"Formwork to sides of beams",unit:"m²"});
  assert.equal(concrete.costCode,"03");
  assert.equal(concrete.recipeFamily,"concrete");
  assert.equal(rebar.costCode,"03");
  assert.equal(rebar.recipeFamily,"reinforcement");
  assert.equal(formwork.costCode,"03");
  assert.equal(formwork.recipeFamily,"formwork");
});

test("explicit client-supplied and labour-only wording overrides contractor supply default", () => {
  const client=suggestBoqItemReview("Sanitary",{description:"Install client supplied wall hung WC",unit:"nr"});
  const labour=suggestBoqItemReview("Floor Finishes",{description:"Labour only for laying porcelain floor tiles",unit:"m²"});
  assert.equal(client.supplyResponsibility,"client");
  assert.equal(labour.supplyResponsibility,"labour_only");
});

test("direct fixtures are not forced through bulk material recipes", () => {
  const door=suggestBoqItemReview("Doors",{description:"Supply and install hardwood flush door complete with ironmongery",unit:"nr"});
  const socket=suggestBoqItemReview("Electrical",{description:"13A double socket outlet",unit:"nr"});
  assert.equal(door.costCode,"07");
  assert.equal(door.recipeFamily,"direct_supply");
  assert.equal(socket.costCode,"16");
  assert.equal(socket.recipeFamily,"direct_supply");
});

test("unknown specialist descriptions stay in review instead of inventing a material recipe", () => {
  const unknown=suggestBoqItemReview("Special Works",{description:"Proprietary acoustic treatment system",unit:"item"});
  assert.equal(unknown.recipeFamily,"needs_review");
  assert.equal(unknown.requiresAttention,true);
});

test("BOQ decoration counts clear and attention items without confirming anything", () => {
  const decorated=decorateBoqWithReview({sections:[{title:"Blockwork",items:[
    {id:"1",description:"225mm block wall",unit:"m²",quantity:20},
    {id:"2",description:"Unspecified proprietary work",unit:"item",quantity:1},
  ]}]});
  assert.equal(decorated.reviewSummary.totalItems,2);
  assert.equal(decorated.reviewSummary.clearItems,1);
  assert.equal(decorated.reviewSummary.attentionItems,1);
  assert.equal(decorated.boq.sections[0].items[0].reviewSuggestion?.costCode,"04");
});

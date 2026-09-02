import test from "node:test";
import assert from "node:assert/strict";
import { buildMaterialBreakdown, materializeBoq } from "../lib/estimate/material-recipe-engine.ts";
import { summarizeMaterials } from "../lib/estimate/sectioned-boq.ts";

const item=(overrides={})=>({id:"item-1",description:"225mm hollow block wall",unit:"m2",quantity:100,...overrides});

test("225mm blockwork produces traceable blocks, cement and sand",()=>{
  const breakdown=buildMaterialBreakdown({item:item(),decision:{recipeFamily:"blockwork_225",supplyResponsibility:"contractor",confirmed:true}});
  assert.equal(breakdown.status,"available");
  assert.equal(breakdown.materials[0].material,"225mm hollow blocks");
  assert.equal(breakdown.materials[0].baseQuantity,1000);
  assert.equal(breakdown.materials[0].totalQuantity,1050);
  assert.equal(breakdown.materials.some(m=>m.material==="Cement"),true);
  assert.equal(breakdown.materials.some(m=>m.material==="Sharp sand"),true);
});

test("unconfirmed recipe never calculates materials",()=>{
  const breakdown=buildMaterialBreakdown({item:item(),decision:{recipeFamily:"blockwork_225",supplyResponsibility:"contractor",confirmed:false}});
  assert.equal(breakdown.status,"needs_review");
  assert.equal(breakdown.materials.length,0);
});

test("client supplied and labour only lines are excluded from contractor materials",()=>{
  const client=buildMaterialBreakdown({item:item(),decision:{recipeFamily:"blockwork_225",supplyResponsibility:"client",confirmed:true}});
  const labour=buildMaterialBreakdown({item:item(),decision:{recipeFamily:"blockwork_225",supplyResponsibility:"labour_only",confirmed:true}});
  assert.equal(client.status,"not_applicable");
  assert.equal(labour.status,"not_applicable");
});

test("generic concrete does not invent a mix without parameters",()=>{
  const breakdown=buildMaterialBreakdown({item:item({description:"Grade 25 concrete",unit:"m3",quantity:20}),decision:{recipeFamily:"concrete",supplyResponsibility:"contractor",confirmed:true}});
  assert.equal(breakdown.status,"needs_review");
  assert.match(breakdown.assumptions[0],/specification parameters/i);
});

test("tiling V1 calculates finish area but does not invent adhesive/grout",()=>{
  const breakdown=buildMaterialBreakdown({item:item({description:"Porcelain floor tiles",quantity:200}),decision:{recipeFamily:"floor_tiling",supplyResponsibility:"contractor",confirmed:true}});
  assert.equal(breakdown.status,"available");
  assert.equal(breakdown.materials.length,1);
  assert.equal(breakdown.materials[0].material,"Floor tile finish");
  assert.equal(breakdown.materials[0].totalQuantity,210);
  assert.match(breakdown.assumptions.join(" "),/adhesive/i);
});

test("reinforcement converts tonnes to kg and adds binding wire",()=>{
  const breakdown=buildMaterialBreakdown({item:item({description:"Y12 reinforcement",unit:"tonnes",quantity:2}),decision:{recipeFamily:"reinforcement",supplyResponsibility:"contractor",confirmed:true}});
  assert.equal(breakdown.status,"available");
  const steel=breakdown.materials.find(m=>m.material==="Reinforcement steel");
  const wire=breakdown.materials.find(m=>m.material==="Binding wire");
  assert.equal(steel.baseQuantity,2000);
  assert.equal(steel.totalQuantity,2100);
  assert.equal(wire.baseQuantity,30);
});

test("material summary keeps reverse source-item traceability",()=>{
  const boq={id:"b1",name:"Test",currency:"NGN",sections:[{id:"s1",title:"Blockwork",items:[
    {...item({id:"a",quantity:100}),materialBreakdown:{status:"needs_review",materials:[]}},
    {...item({id:"b",quantity:50}),materialBreakdown:{status:"needs_review",materials:[]}},
  ]}]};
  const ready=materializeBoq(boq,{
    a:{recipeFamily:"blockwork_225",supplyResponsibility:"contractor",confirmed:true},
    b:{recipeFamily:"blockwork_225",supplyResponsibility:"contractor",confirmed:true},
  });
  const summary=summarizeMaterials(ready);
  const blocks=summary.find(row=>row.material==="225mm hollow blocks");
  assert.ok(blocks);
  assert.equal(blocks.quantity,1575);
  assert.equal(blocks.sourceItems.length,2);
  assert.deepEqual(blocks.sourceItems.map(s=>s.itemId).sort(),["a","b"]);
});

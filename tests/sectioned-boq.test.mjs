import assert from "node:assert/strict";
import test from "node:test";
import { findBoqItem, summarizeMaterials, validateSectionedBoq } from "../lib/estimate/sectioned-boq.ts";

const boq={
  id:"b1",name:"Test BOQ",currency:"NGN",sections:[{
    id:"s1",code:"04",title:"Blockwork & Masonry",items:[{
      id:"i1",itemNo:"4.1",description:"225mm blockwork",unit:"m²",quantity:100,rate:1000,amount:100000,
      materialBreakdown:{status:"available",recipeName:"225mm blockwork",materials:[
        {id:"m1",material:"225mm blocks",unit:"pcs",baseQuantity:1000,wastePercent:5,totalQuantity:1050,source:"recipe"},
        {id:"m2",material:"Cement",unit:"bags",baseQuantity:30,wastePercent:5,totalQuantity:31.5,source:"recipe"},
      ]}
    },{
      id:"i2",itemNo:"4.2",description:"Second blockwork item",unit:"m²",quantity:50,rate:1000,amount:50000,
      materialBreakdown:{status:"available",materials:[
        {id:"m3",material:"Cement",unit:"bags",baseQuantity:10,wastePercent:10,totalQuantity:11,source:"recipe"},
      ]}
    }]
  }]
};

test("sectioned BOQ validates quantity-rate arithmetic and material waste",()=>{
  assert.deepEqual(validateSectionedBoq(boq),[]);
});

test("BOQ item remains traceable to its section",()=>{
  const result=findBoqItem(boq,"i1");
  assert.equal(result?.section.id,"s1");
  assert.equal(result?.item.quantity,100);
  assert.equal(result?.item.materialBreakdown.materials[0].totalQuantity,1050);
});

test("material summary preserves contributing BOQ item references",()=>{
  const cement=summarizeMaterials(boq).find((row)=>row.material==="Cement");
  assert.ok(cement);
  assert.equal(cement.quantity,42.5);
  assert.equal(cement.sourceItems.length,2);
  assert.deepEqual(cement.sourceItems.map((row)=>row.itemId),["i1","i2"]);
});

test("available material breakdown cannot be empty",()=>{
  const invalid=structuredClone(boq);
  invalid.sections[0].items[0].materialBreakdown.materials=[];
  assert.ok(validateSectionedBoq(invalid).some((error)=>error.includes("has no material components")));
});

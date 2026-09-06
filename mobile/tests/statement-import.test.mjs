import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { analyseStatement, parseStandardStatement } from "../lib/statement-import.ts";

function asArrayBuffer(bytes){
  if(bytes instanceof ArrayBuffer)return bytes;
  if(ArrayBuffer.isView(bytes))return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  throw new TypeError("Expected workbook bytes");
}

function workbook(rows){
  const ws=XLSX.utils.aoa_to_sheet([["Date","Value Date","Description","Debit","Credit","Balance","Reference"],...rows]);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Statement");
  return asArrayBuffer(XLSX.write(wb,{type:"array",bookType:"xlsx"}));
}

const accounts=[
  {id:"uba",institution:"UBA",name:"Main Business Account",number:"1027072467"},
  {id:"opay",institution:"OPay",name:"Site OPay",number:"7066619598"},
  {id:"access",institution:"Access Bank",name:"Personal Access",number:"0724644272"},
];
const projects=[
  {id:"coco",name:"COCO Gwarimpa",code:"COCO",keywords:["gwarimpa"]},
  {id:"jahi",name:"Jahi Project",code:"JAHI",keywords:["jahi site"]},
];

test("standard statement requires one fixed set of columns",()=>{
  const bad=XLSX.utils.book_new();XLSX.utils.book_append_sheet(bad,XLSX.utils.aoa_to_sheet([["Date","Narration","Amount"]]),"Statement");
  const bytes=asArrayBuffer(XLSX.write(bad,{type:"array",bookType:"xlsx"}));
  assert.throws(()=>parseStandardStatement(bytes),/Charismak statement format/i);
});

test("project keyword plus construction wording becomes a strong project cost",()=>{
  const rows=parseStandardStatement(workbook([["22/04/2026","22/04/2026","Payment to Electrician COCO GWARIMPA",500000,"",2500000,"ABC"]]));
  const result=analyseStatement({rows,sourceAccount:accounts[1],accounts,projects});
  assert.equal(result.projectItems.length,1);
  assert.equal(result.projectItems[0].projectId,"coco");
  assert.equal(result.projectItems[0].kind,"project_expense");
  assert.equal(result.projectItems[0].category,"Electrical");
  assert.equal(result.decisions.length,0);
});

test("ordinary POS or personal spending is hidden when it has no construction or project link",()=>{
  const rows=parseStandardStatement(workbook([
    ["01/01/2026","01/01/2026","POS purchase Chicken Republic",8500,"",20000,"P1"],
    ["02/01/2026","02/01/2026","Airtime MTN",2000,"",18000,"P2"],
    ["03/01/2026","03/01/2026","Gift to family",5000,"",13000,"P3"],
  ]));
  const result=analyseStatement({rows,sourceAccount:accounts[1],accounts,projects});
  assert.equal(result.ignoredCount,3);
  assert.equal(result.projectItems.length,0);
  assert.equal(result.decisions.length,0);
});

test("site fund movement is never guessed as project expense",()=>{
  const rows=parseStandardStatement(workbook([["17/04/2026","17/04/2026","NIP FOR CONSTRUCTION SITE FUND",3000000,"",1000000,"FUND1"]]));
  const result=analyseStatement({rows,sourceAccount:accounts[0],accounts,projects});
  assert.equal(result.projectItems.length,0);
  assert.equal(result.waitingTransfers.length,1);
});

test("a later statement pairs equal and opposite account movements instead of double-counting cost",()=>{
  const rows=parseStandardStatement(workbook([["17/04/2026","17/04/2026","Transfer from CHARISMAK PROJECT NIGERIA LIMITED UBA construction site fund","",3000000,3000000,"FUND1"]]));
  const prior=[{id:"old:2",statementKey:"old",accountId:"uba",date:"2026-04-17",signedAmount:-3000000,description:"NIP FOR CONSTRUCTION SITE FUND",reference:"FUND1"}];
  const result=analyseStatement({rows,sourceAccount:accounts[1],accounts,projects,priorRows:prior});
  assert.equal(result.transferPairs.length,1);
  assert.equal(result.transferPairs[0].fromAccountId,"uba");
  assert.equal(result.transferPairs[0].toAccountId,"opay");
  assert.equal(result.projectItems.length,0);
});

test("commission and VAT belonging to a project payment are attached to one project cost",()=>{
  const rows=parseStandardStatement(workbook([
    ["08/06/2026","08/06/2026","MOBILE TRF TO ZIB Purchase of tiles gum JAHI ANDREW GEORGE",45000,"",100000,"TILE1"],
    ["08/06/2026","08/06/2026","COMMISSION MOBILE TRF TO ZIB Purchase of tiles gum JAHI ANDREW GEORGE",25,"",99975,"TILE1C"],
    ["08/06/2026","08/06/2026","VAT MOBILE TRF TO ZIB Purchase of tiles gum JAHI ANDREW GEORGE",1.88,"",99973.12,"TILE1V"],
  ]));
  const result=analyseStatement({rows,sourceAccount:accounts[2],accounts,projects});
  assert.equal(result.projectItems.length,1);
  assert.equal(result.projectItems[0].projectId,"jahi");
  assert.equal(result.projectItems[0].amount,45026.88);
  assert.equal(result.feeRowsAttached,2);
});

test("construction transaction with no clear project becomes one grouped decision, not an automatic posting",()=>{
  const rows=parseStandardStatement(workbook([
    ["01/06/2026","01/06/2026","Transfer to DANIEL ADECK OBADIAH painting materials plus transport",6400,"",50000,"D1"],
    ["02/06/2026","02/06/2026","Transfer to DANIEL ADECK OBADIAH painting labour",25000,"",25000,"D2"],
  ]));
  const result=analyseStatement({rows,sourceAccount:accounts[1],accounts,projects});
  assert.equal(result.projectItems.length,0);
  assert.equal(result.decisions.length,1);
  assert.equal(result.decisions[0].rows.length,2);
});

test("recipient alone does not make an unrelated transaction construction",()=>{
  const rows=parseStandardStatement(workbook([
    ["01/06/2026","01/06/2026","Transfer to ANDREW GEORGE dinner",5000,"",50000,"X1"],
    ["02/06/2026","02/06/2026","Transfer to ANDREW GEORGE tile gum JAHI",45000,"",5000,"X2"],
  ]));
  const result=analyseStatement({rows,sourceAccount:accounts[2],accounts,projects});
  assert.equal(result.projectItems.length,1);
  assert.equal(result.ignoredCount,1);
});

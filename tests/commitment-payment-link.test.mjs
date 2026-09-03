import assert from "node:assert/strict";
import test from "node:test";
import { buildCommitmentPaymentLinkRpcArgs, buildCommitmentPaymentReview } from "../lib/project-cost/commitment-payment-link.ts";

const commitments=[
  {id:"c1",description:"Supply and install roofing sheets",costCode:"06",committedAmount:900000,paidAmount:300000,status:"open"},
  {id:"c2",description:"Roof timber carcassing",costCode:"06",committedAmount:400000,paidAmount:0,status:"open"},
  {id:"c3",description:"Electrical wiring",costCode:"16",committedAmount:500000,paidAmount:0,status:"open"},
];

test("same cost code plus description/amount can suggest one commitment without auto linking",()=>{const [row]=buildCommitmentPaymentReview({transactions:[{transactionId:"t1",amount:600000,transactionDate:"2026-09-03",title:"Roofing sheets final payment",costCode:"06"}],commitments});assert.equal(row.availableAmount,600000);assert.equal(row.suggestedCommitmentId,"c1");assert.equal(row.candidates[0].suggestedAllocation,600000);});

test("confirmed cost-code mismatch is never offered as a commitment candidate",()=>{const [row]=buildCommitmentPaymentReview({transactions:[{transactionId:"t2",amount:200000,transactionDate:"2026-09-03",title:"Electrical cables",costCode:"16"}],commitments});assert.deepEqual(row.candidates.map(c=>c.commitmentId),["c3"]);});

test("existing allocations reduce only the available Money amount and support split payments",()=>{const [row]=buildCommitmentPaymentReview({transactions:[{transactionId:"t3",amount:1000000,transactionDate:"2026-09-03",title:"Roof works payment",costCode:"06"}],commitments,allocations:[{id:"l1",transactionId:"t3",commitmentId:"c1",allocatedAmount:600000,status:"active"}]});assert.equal(row.alreadyAllocated,600000);assert.equal(row.availableAmount,400000);assert.ok(row.candidates.some(c=>c.commitmentId==="c2"&&c.suggestedAllocation===400000));});

test("unclassified expense must be classified before commitment linking",()=>{const [row]=buildCommitmentPaymentReview({transactions:[{transactionId:"t4",amount:100000,transactionDate:"2026-09-03",title:"Roof payment",costCode:null}],commitments});assert.equal(row.candidates.length,0);assert.match(row.issues.join(" "),/Classify this expense/i);});

test("RPC args reject zero allocations",()=>{assert.throws(()=>buildCommitmentPaymentLinkRpcArgs({projectId:"p",transactionId:"t",commitmentId:"c",amount:0}),/greater than zero/);assert.deepEqual(buildCommitmentPaymentLinkRpcArgs({projectId:"p",transactionId:"t",commitmentId:"c",amount:250000}),{target_project_id:"p",target_transaction_id:"t",target_commitment_id:"c",allocation_amount:250000,link_note:null});});

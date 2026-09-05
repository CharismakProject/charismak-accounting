import { getCostCodeGroup, isValidCostCode, type CostCode } from "./cost-codes.ts";

export type CommitmentPaymentTransaction = {
  transactionId: string;
  amount: number;
  transactionDate: string;
  title: string;
  description?: string | null;
  costCode: CostCode | null;
};

export type CommitmentPaymentCommitment = {
  id: string;
  description: string;
  costCode: CostCode;
  committedAmount: number;
  paidAmount: number;
  status: "open" | "closed" | "cancelled";
};

export type CommitmentPaymentAllocation = {
  id: string;
  transactionId: string;
  commitmentId: string;
  allocatedAmount: number;
  status: "active" | "void";
};

export type CommitmentPaymentCandidate = {
  commitmentId: string;
  description: string;
  costCode: CostCode;
  costName: string;
  unpaidAmount: number;
  suggestedAllocation: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  score: number;
};

export type CommitmentPaymentReviewRow = CommitmentPaymentTransaction & {
  alreadyAllocated: number;
  availableAmount: number;
  candidates: CommitmentPaymentCandidate[];
  suggestedCommitmentId: string | null;
  issues: string[];
};

const round=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
const safeMoney=(value:number,label:string)=>{if(!Number.isFinite(value)||value<0)throw new Error(`${label} must be a non-negative finite amount.`);return round(value);};
const STOP=new Set(["payment","paid","part","balance","for","the","and","with","from","work","works","supply","labour","labor","project","site"]);
const tokens=(value:string)=>new Set(value.toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(token=>token.length>=4&&!STOP.has(token)));
const overlap=(a:Set<string>,b:Set<string>)=>[...a].filter(token=>b.has(token)).length;

/**
 * Review-first payment matching. Suggestions never create links automatically.
 * A transaction must already have a confirmed cost code before it can be linked.
 */
export function buildCommitmentPaymentReview(input:{
  transactions:CommitmentPaymentTransaction[];
  commitments:CommitmentPaymentCommitment[];
  allocations?:CommitmentPaymentAllocation[];
}):CommitmentPaymentReviewRow[]{
  const allocations=input.allocations??[];
  const allocatedByTransaction=new Map<string,number>();
  for(const link of allocations.filter(link=>link.status==="active")){
    const amount=safeMoney(link.allocatedAmount,`Allocation ${link.id}`);
    allocatedByTransaction.set(link.transactionId,round((allocatedByTransaction.get(link.transactionId)??0)+amount));
  }
  const activeCommitments=input.commitments.filter(row=>row.status==="open").map(row=>({
    ...row,
    committedAmount:safeMoney(row.committedAmount,`Commitment ${row.id}`),
    paidAmount:safeMoney(row.paidAmount,`Paid commitment ${row.id}`),
  })).filter(row=>row.committedAmount-row.paidAmount>0.005);

  return input.transactions.map(transaction=>{
    const amount=safeMoney(transaction.amount,`Transaction ${transaction.transactionId}`);
    const alreadyAllocated=round(allocatedByTransaction.get(transaction.transactionId)??0);
    const availableAmount=round(Math.max(amount-alreadyAllocated,0));
    const issues:string[]=[];
    if(alreadyAllocated>amount+0.005)issues.push("Confirmed allocations exceed the Money transaction amount.");
    if(!transaction.costCode||!isValidCostCode(transaction.costCode))issues.push("Classify this expense to a construction cost code before linking it to a commitment.");
    if(availableAmount<=0.005)issues.push("This Money transaction is fully allocated already.");
    const txTokens=tokens(`${transaction.title} ${transaction.description??""}`);
    const candidates:CommitmentPaymentCandidate[]=[];
    if(transaction.costCode&&isValidCostCode(transaction.costCode)&&availableAmount>0.005){
      for(const commitment of activeCommitments.filter(row=>row.costCode===transaction.costCode)){
        const unpaidAmount=round(Math.max(commitment.committedAmount-commitment.paidAmount,0));
        const wordOverlap=overlap(txTokens,tokens(commitment.description));
        const exactAmount=Math.abs(availableAmount-unpaidAmount)<=0.005;
        const fits=availableAmount<=unpaidAmount+0.005;
        const score=wordOverlap*10+(exactAmount?6:0)+(fits?2:0);
        const confidence:CommitmentPaymentCandidate["confidence"]=wordOverlap>=2||(wordOverlap>=1&&exactAmount)?"high":wordOverlap>=1||exactAmount?"medium":"low";
        const reasons=[`Same confirmed cost code ${transaction.costCode} · ${getCostCodeGroup(transaction.costCode)?.name??"Cost group"}.`];
        if(wordOverlap>0)reasons.push(`${wordOverlap} meaningful description word${wordOverlap===1?"":"s"} overlap.`);
        if(exactAmount)reasons.push("Available payment exactly matches the commitment unpaid balance.");
        else if(fits)reasons.push("Available payment fits within the commitment unpaid balance.");
        candidates.push({commitmentId:commitment.id,description:commitment.description,costCode:commitment.costCode,costName:getCostCodeGroup(commitment.costCode)?.name??"Cost group",unpaidAmount,suggestedAllocation:round(Math.min(availableAmount,unpaidAmount)),confidence,reasons,score});
      }
    }
    candidates.sort((a,b)=>b.score-a.score||a.description.localeCompare(b.description));
    const first=candidates[0],second=candidates[1];
    const suggestedCommitmentId=first&&first.confidence!=="low"&&(!second||first.score>second.score)?first.commitmentId:null;
    if(transaction.costCode&&candidates.length===0&&availableAmount>0.005)issues.push(`No open ${transaction.costCode} commitment has an unpaid balance.`);
    if(first&&second&&first.score===second.score&&first.score>0)issues.push("More than one commitment is an equally plausible match; choose manually.");
    return{...transaction,amount,alreadyAllocated,availableAmount,candidates,suggestedCommitmentId,issues:[...new Set(issues)]};
  });
}

export function buildCommitmentPaymentLinkRpcArgs(input:{projectId:string;transactionId:string;commitmentId:string;amount:number;note?:string|null}){
  const projectId=input.projectId.trim(),transactionId=input.transactionId.trim(),commitmentId=input.commitmentId.trim();
  if(!projectId||!transactionId||!commitmentId)throw new Error("Project, transaction and commitment are required.");
  const amount=safeMoney(input.amount,"Payment allocation");if(amount<=0)throw new Error("Payment allocation must be greater than zero.");
  return{target_project_id:projectId,target_transaction_id:transactionId,target_commitment_id:commitmentId,allocation_amount:amount,link_note:input.note?.trim()||null};
}

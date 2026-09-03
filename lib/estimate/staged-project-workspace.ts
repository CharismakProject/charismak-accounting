import { getCostCodeGroup, type CostCode } from "../project-cost/cost-codes.ts";
import type { ProjectCreationPreview } from "./project-creation-preview.ts";

export type StagedCostGroup = { costCode: CostCode; name: string; amount: number; lineCount: number };
export type StagedProjectWorkspace = {
  schemaVersion: 1;
  workspaceId: string;
  sourceEstimateId: string;
  sourceSystem: "charismak_app_estimate";
  status: "reviewed_draft";
  reviewed: true;
  stagedAt: string;
  project: ProjectCreationPreview["project"];
  commercialSnapshot: ProjectCreationPreview["commercialSnapshot"];
  internalDirectCost: number;
  clientSuppliedExcludedValue: number;
  budgetLines: ProjectCreationPreview["budgetLines"];
  budgetAllowances: ProjectCreationPreview["budgetAllowances"];
  materials: ProjectCreationPreview["materials"];
  costGroups: StagedCostGroup[];
  forecastProfit: number | null;
  budgetBaseline: { lineTotal: number; allowanceTotal: number; internalBudget: number; reconciliationDifference: number };
  moneyConnection: { status: "not_linked"; confirmedSpend: null; commitments: null; note: string };
};

const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export const stagedWorkspaceId=(sourceEstimateId:string)=>`estimate:${sourceEstimateId}`;

export function buildStagedProjectWorkspace(preview:ProjectCreationPreview,stagedAt=new Date().toISOString()):StagedProjectWorkspace{
  if(!preview.readyToStage||preview.project.internalCostBudget==null)throw new Error("Project review is not ready to stage.");
  const grouped=new Map<CostCode,{amount:number;lineCount:number}>();
  for(const line of preview.budgetLines){const current=grouped.get(line.costCode)??{amount:0,lineCount:0};current.amount=round(current.amount+line.amount);current.lineCount+=1;grouped.set(line.costCode,current);}
  const costGroups=[...grouped.entries()].map(([costCode,value])=>({costCode,name:getCostCodeGroup(costCode)?.name??`Cost group ${costCode}`,amount:value.amount,lineCount:value.lineCount})).sort((a,b)=>a.costCode.localeCompare(b.costCode));
  const lineTotal=round(preview.budgetLines.reduce((sum,line)=>sum+line.amount,0));
  const allowanceTotal=round(preview.budgetAllowances.reduce((sum,line)=>sum+line.amount,0));
  const internalBudget=preview.project.internalCostBudget;
  return{schemaVersion:1,workspaceId:stagedWorkspaceId(preview.sourceEstimateId),sourceEstimateId:preview.sourceEstimateId,sourceSystem:"charismak_app_estimate",status:"reviewed_draft",reviewed:true,stagedAt,project:preview.project,commercialSnapshot:preview.commercialSnapshot,internalDirectCost:preview.internalDirectCost,clientSuppliedExcludedValue:preview.clientSuppliedExcludedValue,budgetLines:preview.budgetLines,budgetAllowances:preview.budgetAllowances,materials:preview.materials,costGroups,forecastProfit:preview.forecastProfit,budgetBaseline:{lineTotal,allowanceTotal,internalBudget,reconciliationDifference:round(internalBudget-lineTotal-allowanceTotal)},moneyConnection:{status:"not_linked",confirmedSpend:null,commitments:null,note:"Money/Accounting becomes the authority for actual spend and commitments only after this reviewed draft is approved into a live project."}};
}

export function parseStagedProjectWorkspace(raw:string):StagedProjectWorkspace|null{try{const value=JSON.parse(raw) as StagedProjectWorkspace;if(value?.schemaVersion!==1||value?.status!=="reviewed_draft"||!value.workspaceId||!value.project?.name||!Array.isArray(value.costGroups))return null;return value;}catch{return null;}}
export function serializeStagedProjectWorkspace(value:StagedProjectWorkspace){return JSON.stringify(value,null,2);}

import { getCostCodeGroup, isValidCostCode, type CostCode } from "./cost-codes.ts";
import type { ProjectCostControl } from "./project-cost-control.ts";

export type ForecastTradeLine={costCode:CostCode;amount:number};
export type CommercialHealthStatus="not_ready"|"on_target"|"profit_eroding"|"forecast_loss";
export type ForecastTradeHealth={costCode:CostCode;name:string;budget:number;actual:number;forecastCostToComplete:number;forecastFinalCost:number;varianceToBudget:number;status:"within_budget"|"at_risk"|"over_budget"|"not_budgeted"};
export type ProjectHealthSummary={status:CommercialHealthStatus;forecastCostVariance:number|null;profitDrift:number|null;expectedMarginPercent:number|null;forecastMarginPercent:number|null;marginDriftPoints:number|null;tradeHealth:ForecastTradeHealth[];topRisks:ForecastTradeHealth[];dataIssues:string[];readyForCommercialDecision:boolean};

const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const money=(n:number,label:string)=>{if(!Number.isFinite(n)||n<0)throw new Error(`${label} must be a non-negative finite amount.`);return round(n)};
const pct=(value:number,base:number)=>base<=0?null:Math.round((value/base)*1000)/10;

export function buildProjectHealthSummary(input:{control:ProjectCostControl;contractValue:number|null;forecastLines:ForecastTradeLine[]|null}):ProjectHealthSummary{
  const dataIssues:string[]=[];const contract=input.contractValue==null?null:money(input.contractValue,"Contract value");
  if(contract==null)dataIssues.push("Contract value is required before forecast profit and margin can be relied on.");
  if(input.control.forecastFinalCost==null)dataIssues.push("A reviewed Cost-to-Complete is required before final cost and commercial health can be relied on.");
  if(input.control.commitmentsStatus!=="connected")dataIssues.push("Commitments are not connected, so future committed exposure is incomplete.");
  if(input.control.position.unclassifiedActual>0)dataIssues.push("Unclassified actual spend remains outside the trade-level forecast view.");
  if(input.control.warnings.some(w=>/below known unpaid commitments/i.test(w)))dataIssues.push("Reviewed Cost-to-Complete is below known unpaid commitments and must be corrected.");

  const forecastByCode=new Map<CostCode,number>();for(const line of input.forecastLines??[]){if(!isValidCostCode(line.costCode))continue;forecastByCode.set(line.costCode,round((forecastByCode.get(line.costCode)??0)+money(line.amount,`Forecast ${line.costCode}`)));}
  const tradeHealth=input.control.position.byCostCode.map(row=>{const costCode=row.costCode;const forecastCostToComplete=round(forecastByCode.get(costCode)??0);const forecastFinalCost=round(row.actual+forecastCostToComplete);const varianceToBudget=round(forecastFinalCost-row.budget);const status:ForecastTradeHealth["status"]=row.budget<=0?(forecastFinalCost>0.005?"not_budgeted":"within_budget"):forecastFinalCost>row.budget+0.005?"over_budget":forecastFinalCost/row.budget>=0.9?"at_risk":"within_budget";return{costCode,name:getCostCodeGroup(costCode)?.name??row.name,budget:row.budget,actual:row.actual,forecastCostToComplete,forecastFinalCost,varianceToBudget,status};});
  const topRisks=tradeHealth.filter(r=>r.status==="over_budget"||r.status==="not_budgeted"||r.status==="at_risk").sort((a,b)=>{const rank=(s:ForecastTradeHealth["status"])=>s==="over_budget"?3:s==="not_budgeted"?2:s==="at_risk"?1:0;return rank(b.status)-rank(a.status)||b.varianceToBudget-a.varianceToBudget;}).slice(0,6);
  const forecastCostVariance=input.control.forecastFinalCost==null?null:round(input.control.forecastFinalCost-input.control.position.internalCostBudget);
  const profitDrift=input.control.expectedProfitAtBudget==null||input.control.forecastProfit==null?null:round(input.control.forecastProfit-input.control.expectedProfitAtBudget);
  const expectedMarginPercent=contract==null||input.control.expectedProfitAtBudget==null?null:pct(input.control.expectedProfitAtBudget,contract);
  const forecastMarginPercent=contract==null||input.control.forecastProfit==null?null:pct(input.control.forecastProfit,contract);
  const marginDriftPoints=expectedMarginPercent==null||forecastMarginPercent==null?null:round(forecastMarginPercent-expectedMarginPercent);
  const status:CommercialHealthStatus=contract==null||input.control.forecastFinalCost==null?"not_ready":input.control.forecastProfit!=null&&input.control.forecastProfit< -0.005?"forecast_loss":profitDrift!=null&&profitDrift< -0.005?"profit_eroding":"on_target";
  const readyForCommercialDecision=status!=="not_ready"&&dataIssues.length===0;
  return{status,forecastCostVariance,profitDrift,expectedMarginPercent,forecastMarginPercent,marginDriftPoints,tradeHealth,topRisks,dataIssues:[...new Set(dataIssues)],readyForCommercialDecision};
}

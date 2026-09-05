import type { MobileEstimateBoq, MobilePreliminaryPricing, MobileWorkingRateSource } from "./estimate-types.ts";

export type MobileBoqWorkingLine={
  sectionId:string;
  sectionTitle:string;
  itemId:string;
  itemNo?:string;
  description:string;
  quantity:number;
  unit:string;
  kind:"measured"|"preliminary";
  workingRate:number|null;
  rateSource:MobileWorkingRateSource|null;
  sourceAmount:number|null;
  amount:number|null;
  sourceArithmeticMismatch:boolean;
  preliminary?:MobilePreliminaryPricing;
};

export type MobileBoqWorkingSummary={
  currency:string;
  lines:MobileBoqWorkingLine[];
  pricedTotal:number;
  workingTotal:number;
  unpricedItems:number;
  arithmeticMismatchItems:number;
  preliminaryItems:number;
  derivedPreliminaryTotals:number;
};

const round=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export const parseWorkingRate=(value:string)=>{const cleaned=value.replace(/[,₦$€£\s]/g,"");if(!cleaned.trim())return null;const n=Number(cleaned);return Number.isFinite(n)&&n>=0?n:null;};

export function buildBoqWorkingSummary(input:{boq:MobileEstimateBoq;rates:Record<string,string>;rateSources?:Record<string,MobileWorkingRateSource>;preliminariesPricing?:Record<string,MobilePreliminaryPricing>}):MobileBoqWorkingSummary{
  const lines:MobileBoqWorkingLine[]=[];
  for(const section of input.boq.sections){
    for(const item of section.items){
      const preliminary=input.preliminariesPricing?.[item.id];
      if(preliminary){
        lines.push({
          sectionId:section.id,sectionTitle:section.title,itemId:item.id,itemNo:item.itemNo,description:item.description,
          quantity:item.quantity,unit:item.unit,kind:"preliminary",workingRate:null,rateSource:null,
          sourceAmount:preliminary.sourceTotalCharges,amount:preliminary.planningTotal,sourceArithmeticMismatch:false,preliminary,
        });
        continue;
      }
      const raw=input.rates[item.id]??(item.rate==null?"":String(item.rate));
      const rate=parseWorkingRate(raw);
      const inferred:MobileWorkingRateSource=item.rate!=null&&raw===String(item.rate)?"imported":"manual";
      const rateSource=rate==null?null:(input.rateSources?.[item.id]??inferred);
      const amount=rate==null?null:round(item.quantity*rate);
      const sourceAmount=item.amount!=null&&Number.isFinite(item.amount)?round(item.amount):null;
      const mismatch=rateSource==="imported"&&amount!=null&&sourceAmount!=null&&Math.abs(amount-sourceAmount)>.05;
      lines.push({sectionId:section.id,sectionTitle:section.title,itemId:item.id,itemNo:item.itemNo,description:item.description,quantity:item.quantity,unit:item.unit,kind:"measured",workingRate:rate,rateSource,sourceAmount,amount,sourceArithmeticMismatch:mismatch});
    }
  }
  const pricedTotal=round(lines.reduce((sum,line)=>sum+(line.kind==="preliminary"?(line.preliminary?.planningTotal??0):(line.sourceAmount??0)),0));
  const workingTotal=round(lines.reduce((sum,line)=>sum+(line.amount??0),0));
  return{
    currency:input.boq.currency,
    lines,
    pricedTotal,
    workingTotal,
    unpricedItems:lines.filter(line=>line.amount==null).length,
    arithmeticMismatchItems:lines.filter(line=>line.sourceArithmeticMismatch).length,
    preliminaryItems:lines.filter(line=>line.kind==="preliminary").length,
    derivedPreliminaryTotals:lines.filter(line=>line.kind==="preliminary"&&line.preliminary?.planningTotalSource==="derived").length,
  };
}

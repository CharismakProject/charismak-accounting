import * as XLSX from "xlsx";
import type { MobileEstimateBoq, MobilePreliminaryPricing } from "./estimate-types.ts";
import { extractPreliminaryPricingFromSheets, type PreliminaryWorkbookSheet } from "./preliminaries-pricing.ts";

export function extractPreliminaryPricingFromWorkbook(buffer:ArrayBuffer,boq:MobileEstimateBoq):Record<string,MobilePreliminaryPricing>{
  const workbook=XLSX.read(buffer,{type:"array",cellFormula:true,cellNF:false,cellText:false});
  const sheets:PreliminaryWorkbookSheet[]=workbook.SheetNames.slice(0,24).map(name=>{
    const worksheet=workbook.Sheets[name];
    return{name,rows:worksheet?XLSX.utils.sheet_to_json(worksheet,{header:1,raw:true,defval:null}) as unknown[][]:[]};
  });
  return extractPreliminaryPricingFromSheets(sheets,boq);
}

import * as XLSX from "xlsx";
import type { MobileEstimateBoq } from "./estimate-types.ts";
import { extractPreliminaryPricingFromSheets, type MobilePreliminaryPricing, type PreliminaryWorkbookSheet } from "./preliminaries-pricing.ts";

export function extractPreliminaryPricingFromWorkbook(buffer:ArrayBuffer,boq:MobileEstimateBoq):Record<string,MobilePreliminaryPricing>{
  const workbook=XLSX.read(buffer,{type:"array",cellFormula:true,cellNF:false,cellText:false});
  const sheets:PreliminaryWorkbookSheet[]=workbook.SheetNames.slice(0,24).map(name=>({
    name,
    rows:XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,raw:true,defval:null}) as unknown[][],
  }));
  return extractPreliminaryPricingFromSheets(sheets,boq);
}

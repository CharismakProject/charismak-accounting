import type { MobileEstimateBoq } from "./estimate-types.ts";

export type MobilePreliminaryBehaviour="fixed"|"time_related"|"mixed"|"unpriced";
export type MobilePreliminaryTotalSource="source"|"derived"|"unpriced";

export type MobilePreliminaryPricing={
  fixedCharge:number|null;
  timeRelatedCharge:number|null;
  sourceTotalCharges:number|null;
  planningTotal:number|null;
  planningTotalSource:MobilePreliminaryTotalSource;
  behaviour:MobilePreliminaryBehaviour;
  componentDifference:number|null;
};

export type PreliminaryWorkbookSheet={name:string;rows:unknown[][]};

type PreliminaryColumns={serial:number;description:number;fixed:number;timeRelated:number;total:number|null};

const text=(value:unknown)=>String(value??"").replace(/\s+/g," ").trim();
const normal=(value:unknown)=>text(value).toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
const numeric=(value:unknown):number|null=>{
  if(typeof value==="number"&&Number.isFinite(value))return value;
  let raw=text(value);if(!raw||raw==="-"||raw==="--")return null;
  raw=raw.replace(/^=/,"").replace(/[₦$€£,]/g,"").replace(/[()\s]/g,"");
  if(!/^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(raw))return null;
  const n=Number(raw);return Number.isFinite(n)?n:null;
};
const itemKey=(itemNo:unknown,description:unknown)=>`${normal(itemNo)}|${normal(description)}`;
const summary=/^(collection|subtotal|sub total|total|page|summary|grand total|preliminaries and general clauses carried)/i;

function detectColumns(row:unknown[]):PreliminaryColumns|null{
  let serial=-1,description=-1,fixed=-1,timeRelated=-1,total=-1;
  row.forEach((value,index)=>{
    const header=normal(value);
    if(/^(s n|sn|serial|serial no|item|item no|no|ref|reference)$/.test(header))serial=index;
    else if(/^(description|description of work|item description|particulars|scope|scope of work)$/.test(header))description=index;
    else if(/^fixed charges?$/.test(header))fixed=index;
    else if(/^time related( charges?)?$/.test(header))timeRelated=index;
    else if(/^total charges?$/.test(header))total=index;
  });
  if(description<0||fixed<0||timeRelated<0)return null;
  return{serial:serial<0?0:serial,description,fixed,timeRelated,total:total<0?null:total};
}

export function extractPreliminaryPricingFromSheets(sheets:PreliminaryWorkbookSheet[],boq:MobileEstimateBoq):Record<string,MobilePreliminaryPricing>{
  const parsedItems=boq.sections.flatMap(section=>section.items);
  const byExactKey=new Map(parsedItems.map(item=>[itemKey(item.itemNo,item.description),item]));
  const byDescription=new Map<string,typeof parsedItems>();
  for(const item of parsedItems){const key=normal(item.description);byDescription.set(key,[...(byDescription.get(key)??[]),item]);}
  const result:Record<string,MobilePreliminaryPricing>={};

  for(const sheet of sheets){
    let columns:PreliminaryColumns|null=null;
    for(const row of sheet.rows){
      const header=detectColumns(row);if(header){columns=header;continue;}
      if(!columns)continue;
      const description=text(row[columns.description]);if(!description)continue;
      const serial=text(row[columns.serial]);
      if(!serial&&summary.test(description))continue;
      const fixedCharge=numeric(row[columns.fixed]);
      const timeRelatedCharge=numeric(row[columns.timeRelated]);
      const sourceTotalCharges=columns.total==null?null:numeric(row[columns.total]);
      if(!serial&&fixedCharge==null&&timeRelatedCharge==null&&sourceTotalCharges==null)continue;

      let item=byExactKey.get(itemKey(serial,description));
      if(!item){const matches=byDescription.get(normal(description))??[];if(matches.length===1)item=matches[0];}
      if(!item)continue;

      const componentTotal=fixedCharge==null&&timeRelatedCharge==null?null:(fixedCharge??0)+(timeRelatedCharge??0);
      const planningTotal=sourceTotalCharges??componentTotal;
      const behaviour:MobilePreliminaryBehaviour=fixedCharge!=null&&timeRelatedCharge!=null?"mixed":fixedCharge!=null?"fixed":timeRelatedCharge!=null?"time_related":"unpriced";
      const componentDifference=sourceTotalCharges!=null&&componentTotal!=null?Math.round((sourceTotalCharges-componentTotal)*100)/100:null;
      result[item.id]={
        fixedCharge,timeRelatedCharge,sourceTotalCharges,planningTotal,
        planningTotalSource:sourceTotalCharges!=null?"source":planningTotal!=null?"derived":"unpriced",
        behaviour,componentDifference,
      };
    }
  }
  return result;
}

export type MobileEstimateSupply="contractor"|"client"|"specialist"|"labour_only"|"unknown";
export type MobileWorkingRateSource="imported"|"manual";

export type MobileEstimateDecision={
  costCode:string;
  recipeFamily:string;
  supplyResponsibility:MobileEstimateSupply;
  confirmed:boolean;
  edited?:boolean;
};

export type MobileEstimateItem={
  id:string;
  itemNo?:string;
  description:string;
  unit:string;
  quantity:number;
  rate?:number|null;
  amount?:number|null;
  materialBreakdown?:{status:string;materials:any[];assumptions?:string[]};
};

export type MobileEstimateSection={id:string;code?:string;title:string;items:MobileEstimateItem[]};
export type MobileEstimateBoq={id:string;name:string;currency:string;sections:MobileEstimateSection[]};

export type MobileEstimateReviewSession={
  schemaVersion:1;
  savedAt:string;
  companyName:string;
  boq:MobileEstimateBoq;
  decisions:Record<string,MobileEstimateDecision>;
  rates:Record<string,string>;
  rateSources?:Record<string,MobileWorkingRateSource>;
};

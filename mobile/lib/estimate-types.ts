export type MobileEstimateSupply="contractor"|"client"|"specialist"|"labour_only"|"unknown";
export type MobileWorkingRateSource="imported"|"manual";
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
  context?:string[];
  materialBreakdown?:{status:string;materials:any[];assumptions?:string[]};
};

export type MobileEstimateSection={id:string;code?:string;title:string;context?:string[];items:MobileEstimateItem[]};
export type MobileEstimateBoq={id:string;name:string;currency:string;sections:MobileEstimateSection[]};

export type MobileEstimateReviewSession={
  schemaVersion:1;
  savedAt:string;
  companyName:string;
  projectId?:string;
  projectName?:string;
  boq:MobileEstimateBoq;
  decisions:Record<string,MobileEstimateDecision>;
  rates:Record<string,string>;
  rateSources?:Record<string,MobileWorkingRateSource>;
  preliminariesPricing?:Record<string,MobilePreliminaryPricing>;
};

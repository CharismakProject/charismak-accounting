import { COST_CODE_GROUPS, getCostCodeGroup, isValidCostCode, type CostCode } from "./cost-codes";

export type TransactionCostReviewInput = {
  transactionId: string;
  amount: number;
  transactionDate: string;
  title: string;
  description?: string | null;
  categoryName?: string | null;
};

export type TransactionCostSuggestion = {
  suggestedCostCode: CostCode | null;
  suggestedCostName: string | null;
  confidence: "high" | "medium" | "low";
  candidateCostCodes: CostCode[];
  reasons: string[];
  readyForBulkConfirm: boolean;
};

export type TransactionCostReviewRow = TransactionCostReviewInput & TransactionCostSuggestion;
export type TransactionCostClassification = { transactionId: string; costCode: CostCode; reason?: string | null };
export type TransactionCostClassificationRpcArgs = {
  target_project: string;
  classifications: Array<{ transaction_id: string; cost_code: CostCode; reason: string }>;
};

const RULES: ReadonlyArray<{code:CostCode;primary:readonly string[];secondary:readonly string[]}> = [
  {code:"01",primary:["preliminaries","prelims","site office"],secondary:["mobilization","mobilisation","site security"]},
  {code:"02",primary:["substructure","foundation works","foundation excavation"],secondary:["foundation","excavation","hardcore","blinding"]},
  {code:"03",primary:["reinforced concrete","reinforcement","rebar","formwork"],secondary:["concrete","iron rod","iron rods","chippings","granite"]},
  {code:"04",primary:["blockwork","masonry"],secondary:["block","blocks","walling"]},
  {code:"05",primary:["structural steel","steelwork","steel frame"],secondary:["h beam","h-beam","i beam","i-beam"]},
  {code:"06",primary:["roofing","roof sheet","roof sheets","longspan"],secondary:["zinc","stone coated","roof repair"]},
  {code:"07",primary:["doors","ironmongery"],secondary:["door","door frame","door handle"]},
  {code:"08",primary:["windows","glazing","aluminium window","aluminum window"],secondary:["window","glass window"]},
  {code:"09",primary:["plastering","screeding","rendering"],secondary:["plaster","screed","render"]},
  {code:"10",primary:["floor tiles","floor tiling","floor finish"],secondary:["flooring","tile floor"]},
  {code:"11",primary:["wall tiles","wall tiling","wall finish","cladding"],secondary:["wall tile"]},
  {code:"12",primary:["ceiling","gypsum ceiling","suspended ceiling"],secondary:["pop ceiling","pop work"]},
  {code:"13",primary:["painting","paint work","decoration"],secondary:["paint","emulsion","primer"]},
  {code:"14",primary:["joinery","cabinetry","kitchen cabinet"],secondary:["cabinet","wardrobe"]},
  {code:"15",primary:["plumbing","sanitary","water closet"],secondary:["wc","basin","shower","ppr","drainage pipe"]},
  {code:"16",primary:["electrical","wiring","electrical works"],secondary:["cable","cables","socket","sockets","switch","lighting","conduit"]},
  {code:"17",primary:["hvac","air conditioning","air conditioner"],secondary:["ac pipe","copper pipe","mechanical"]},
  {code:"18",primary:["external works","landscaping","fencing"],secondary:["fence","interlock","paving","soakaway","external drainage"]},
  {code:"19",primary:["specialist works","plant hire","equipment hire"],secondary:["generator","equipment","scaffolding","plant"]},
  {code:"20",primary:["professional fees","consultancy","statutory"],secondary:["consultant","permit","approval fee"]},
];

const normalize=(value:string)=>` ${value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim()} `;
const includesPhrase=(haystack:string,phrase:string)=>haystack.includes(normalize(phrase));
const unique=<T,>(values:T[])=>[...new Set(values)];

export function suggestTransactionCostCode(input: Pick<TransactionCostReviewInput,"title"|"description"|"categoryName">):TransactionCostSuggestion{
  const text=normalize([input.title,input.description,input.categoryName].filter(Boolean).join(" "));
  const matches=RULES.map(rule=>({
    code:rule.code,
    primary:rule.primary.filter(term=>includesPhrase(text,term)),
    secondary:rule.secondary.filter(term=>includesPhrase(text,term)),
  })).filter(row=>row.primary.length>0||row.secondary.length>0);

  if(matches.length===0)return{suggestedCostCode:null,suggestedCostName:null,confidence:"low",candidateCostCodes:[],reasons:["No construction cost-code phrase was strong enough to suggest a trade."],readyForBulkConfirm:false};
  if(matches.length>1){const codes=matches.map(row=>row.code);return{suggestedCostCode:null,suggestedCostName:null,confidence:"low",candidateCostCodes:codes,reasons:[`Description matches more than one cost group: ${codes.join(", ")}. User review is required.`],readyForBulkConfirm:false};}

  const match=matches[0];const group=getCostCodeGroup(match.code);const primary=match.primary.length>0;
  return{
    suggestedCostCode:match.code,
    suggestedCostName:group?.name??null,
    confidence:primary?"high":"medium",
    candidateCostCodes:[match.code],
    reasons:[`Matched ${primary?"strong trade phrase":"supporting phrase"}: ${unique(primary?match.primary:match.secondary).join(", ")}.`],
    readyForBulkConfirm:primary,
  };
}

export function buildTransactionCostReviewRows(rows:TransactionCostReviewInput[]):TransactionCostReviewRow[]{
  return rows.map(row=>({...row,...suggestTransactionCostCode(row)}));
}

export function buildTransactionCostClassificationRpcArgs(projectId:string,selections:TransactionCostClassification[]):TransactionCostClassificationRpcArgs{
  const target=projectId.trim();if(!target)throw new Error("Project ID is required.");
  if(selections.length===0)throw new Error("Select at least one expense to classify.");
  if(selections.length>200)throw new Error("Classify at most 200 expenses in one confirmation.");
  const seen=new Set<string>();
  const classifications=selections.map(selection=>{
    const transactionId=selection.transactionId.trim();if(!transactionId)throw new Error("Every classification needs a transaction ID.");
    if(seen.has(transactionId))throw new Error(`Duplicate transaction selection: ${transactionId}`);seen.add(transactionId);
    if(!isValidCostCode(selection.costCode))throw new Error(`Invalid construction cost code: ${selection.costCode}`);
    return{transaction_id:transactionId,cost_code:selection.costCode,reason:(selection.reason??"Reviewed project cost-code classification.").trim()||"Reviewed project cost-code classification."};
  });
  return{target_project:target,classifications};
}

export const TRANSACTION_COST_CODE_OPTIONS=COST_CODE_GROUPS.map(group=>({code:group.code,name:group.name}));

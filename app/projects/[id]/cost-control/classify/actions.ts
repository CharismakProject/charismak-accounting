"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../../../lib/supabase/server";
import { buildTransactionCostClassificationRpcArgs, type TransactionCostClassification } from "../../../../../lib/project-cost/transaction-cost-review";

export async function confirmTransactionCostClassificationsAction(input:{projectId:string;selections:TransactionCostClassification[]}){
  if(process.env.PROJECT_COST_BRIDGE_ENABLED!=="true")return{ok:false as const,message:"Project-cost bridge is not activated. No Money transaction was changed."};
  let args;try{args=buildTransactionCostClassificationRpcArgs(input.projectId,input.selections);}catch(error){return{ok:false as const,message:error instanceof Error?error.message:"Invalid cost-code classification review."};}
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return{ok:false as const,message:"Sign in again before confirming project costs."};
  const {data,error}=await supabase.rpc("classify_project_expense_costs_v1",args as any);
  if(error)return{ok:false as const,message:error.message||"Cost-code confirmation failed. No partial fallback was attempted."};
  revalidatePath(`/projects/${input.projectId}/cost-control`);revalidatePath(`/projects/${input.projectId}/cost-control/classify`);
  return{ok:true as const,result:data};
}

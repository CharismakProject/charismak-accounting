"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../../../../lib/supabase/server";
import { buildCommitmentPaymentLinkRpcArgs } from "../../../../../../lib/project-cost/commitment-payment-link";

const enabled=()=>process.env.PROJECT_COST_BRIDGE_ENABLED==="true"&&process.env.PROJECT_COST_FORECAST_ENABLED==="true"&&process.env.PROJECT_COST_PAYMENT_LINK_ENABLED==="true";

export async function linkCommitmentPaymentAction(input:{projectId:string;transactionId:string;commitmentId:string;amount:number;note?:string|null}){
  if(!enabled())return{ok:false as const,message:"Commitment payment linking is not enabled."};
  let args;try{args=buildCommitmentPaymentLinkRpcArgs(input);}catch(error){return{ok:false as const,message:error instanceof Error?error.message:"Check the payment allocation."};}
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return{ok:false as const,message:"Sign in again."};
  const {data,error}=await (supabase as any).rpc("link_project_cost_payment_v1",args);if(error)return{ok:false as const,message:error.message||"Could not link payment."};
  revalidatePath(`/projects/${input.projectId}/cost-control`);revalidatePath(`/projects/${input.projectId}/cost-control/forecast`);revalidatePath(`/projects/${input.projectId}/cost-control/forecast/payments`);
  return{ok:true as const,id:String(data)};
}

export async function voidCommitmentPaymentLinkAction(input:{projectId:string;linkId:string;reason:string}){
  if(!enabled())return{ok:false as const,message:"Commitment payment linking is not enabled."};
  if(!input.projectId.trim()||!input.linkId.trim()||!input.reason.trim())return{ok:false as const,message:"A reviewed void reason is required."};
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return{ok:false as const,message:"Sign in again."};
  const {error}=await (supabase as any).rpc("void_project_cost_payment_link_v1",{target_project_id:input.projectId,target_link_id:input.linkId,void_reason_value:input.reason.trim()});if(error)return{ok:false as const,message:error.message||"Could not void payment link."};
  revalidatePath(`/projects/${input.projectId}/cost-control`);revalidatePath(`/projects/${input.projectId}/cost-control/forecast`);revalidatePath(`/projects/${input.projectId}/cost-control/forecast/payments`);
  return{ok:true as const};
}

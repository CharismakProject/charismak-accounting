"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";

export async function approveProgressValuation(formData:FormData){
  const projectId=String(formData.get("project_id")||"");const valuationDate=String(formData.get("valuation_date")||"");const workSummary=String(formData.get("work_summary")||"").trim();const raw=String(formData.get("lines_json")||"");
  if(!projectId)throw new Error("Project is required.");if(!/^\d{4}-\d{2}-\d{2}$/.test(valuationDate))throw new Error("A valid valuation date is required.");if(workSummary.length>3000)throw new Error("Progress summary is too long.");
  if(process.env.PROJECT_COST_BRIDGE_ENABLED!=="true"||process.env.PROJECT_PROGRESS_VALUATION_ENABLED!=="true")throw new Error("Progress Valuation is not activated on this deployment.");
  let lines:unknown;try{lines=JSON.parse(raw)}catch{throw new Error("Progress lines are invalid.");}if(!Array.isArray(lines)||lines.length===0)throw new Error("Progress lines are required.");
  const normalized=lines.map((row:any)=>{const id=String(row?.budget_line_id||"");const p=Number(row?.progress_percent);const q=row?.completed_quantity==null||row.completed_quantity===""?null:Number(row.completed_quantity);if(!id)throw new Error("Every progress line needs a budget line id.");if(!Number.isFinite(p)||p<0||p>100)throw new Error("Progress must be between 0 and 100.");if(q!=null&&(!Number.isFinite(q)||q<0))throw new Error("Completed quantity must be non-negative.");return{budget_line_id:id,progress_percent:p,completed_quantity:q};});
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const {error}=await (supabase as any).rpc("approve_project_progress_valuation_v1",{target_project_id:projectId,valuation_date_value:valuationDate,valuation_lines:normalized,work_summary_value:workSummary||null});if(error)throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/progress`);revalidatePath(`/projects/${projectId}/cost-control`);revalidatePath(`/projects/${projectId}/overview`);redirect(`/projects/${projectId}/progress?saved=1`);
}

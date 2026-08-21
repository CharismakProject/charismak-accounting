"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

async function getContext(){const supabase=await createClient();const {data:authData,error:authError}=await supabase.auth.getUser();const user=authData.user;if(authError||!user)redirect("/welcome");const {data:membership,error}=await supabase.from("company_memberships").select("id,company_id,is_owner").eq("user_id",user.id).eq("status","active").limit(1).single();if(error||!membership)redirect("/welcome");return{supabase,userId:user.id,membership};}
const numberOrNull=(value:FormDataEntryValue|null)=>{if(value===null||value==="")return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const safeFileName=(name:string)=>name.replace(/[^a-zA-Z0-9._-]/g,"_");
const normalizedRelationshipName=(value:string)=>value.trim().toLowerCase().replace(/\s+/g," ");
const INTAKE_EXTENSIONS=new Set(["pdf","csv","xlsx","xls","docx","jpg","jpeg","png","webp"]);
async function uploadProjectImage(supabase:Awaited<ReturnType<typeof createClient>>,companyId:string,projectId:string,image:FormDataEntryValue|null){if(!(image instanceof File)||image.size===0)return null;if(image.size>10*1024*1024)throw new Error("Project image must be 10 MB or smaller.");if(!["image/jpeg","image/png","image/webp"].includes(image.type))throw new Error("Project image must be JPG, PNG or WEBP.");const path=`${companyId}/${projectId}/${Date.now()}-${safeFileName(image.name)}`;const bytes=new Uint8Array(await image.arrayBuffer());const {error}=await supabase.storage.from("project-media").upload(path,bytes,{contentType:image.type,upsert:false});if(error)throw new Error(`Project image upload failed: ${error.message}`);return path;}
async function ensureClientFundingRelationship(supabase:Awaited<ReturnType<typeof createClient>>,companyId:string,projectId:string,clientName:string,userId:string){const clean=clientName.trim();if(!clean)return;const normalized=normalizedRelationshipName(clean);const terms=Array.from(new Set([clean,normalized].map(v=>v.trim().toLowerCase()).filter(Boolean)));const {error}=await supabase.from("project_relationships").upsert({company_id:companyId,project_id:projectId,relationship_type:"client",display_name:clean,normalized_name:normalized,match_terms:terms,required_terms:[],excluded_terms:[],direction_rule:"credit",default_classification:"project_funding",default_category:null,confidence:96,source:"project_client_profile",is_active:true,created_by:userId,updated_at:new Date().toISOString()},{onConflict:"project_id,relationship_type,normalized_name"});if(error)throw new Error(`Project was created, but client funding recognition could not be configured: ${error.message}`);}

async function analyseStartingDocuments(params:{supabase:Awaited<ReturnType<typeof createClient>>;companyId:string;projectId:string;userId:string;files:FormDataEntryValue[];keywords:string[]}){
  const {supabase,companyId,projectId,userId,keywords}=params;
  const files=params.files.filter((v):v is File=>v instanceof File&&v.size>0).slice(0,5);
  if(!files.length)return;
  const total=files.reduce((n,f)=>n+f.size,0);if(total>100*1024*1024)throw new Error("Starting records must be 100 MB or less in total.");
  const {data:batch,error:batchError}=await supabase.from("intake_batches").insert({company_id:companyId,created_by:userId,total_files:files.length}).select("id").single();
  if(batchError||!batch)throw new Error(`Project was created, but the starting-record batch could not be created: ${batchError?.message||"Unknown error"}`);
  let processed=0,needsReview=0,failed=0;
  for(const file of files){
    const ext=(file.name.split(".").pop()||"").toLowerCase();
    if(file.size>20*1024*1024||!INTAKE_EXTENSIONS.has(ext)){failed++;continue;}
    const path=`${companyId}/intake/${new Date().getUTCFullYear()}/${Date.now()}-${crypto.randomUUID().slice(0,8)}-${safeFileName(file.name)}`;
    const {error:storageError}=await supabase.storage.from("universal-intake").upload(path,file,{contentType:file.type||undefined,upsert:false});
    if(storageError){failed++;continue;}
    const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());const fileHash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
    const {data:doc,error:docError}=await supabase.from("source_documents").insert({company_id:companyId,project_id:projectId,document_type:"other",file_name:file.name,storage_path:path,file_hash:fileHash,metadata:{bucket:"universal-intake",extension:ext,mime_type:file.type||null,original_size:file.size,intake_project_hint:projectId,intake_action:"analyse",intake_keywords:keywords,source:"project_creation"},uploaded_by:userId}).select("id").single();
    if(docError||!doc){await supabase.storage.from("universal-intake").remove([path]);failed++;continue;}
    const {data:item,error:itemError}=await supabase.from("intake_items").insert({batch_id:batch.id,company_id:companyId,document_id:doc.id,detected_project_id:projectId}).select("id").single();
    if(itemError||!item){failed++;continue;}
    const {data:analysed,error:analyseError}=await supabase.functions.invoke("analyse-intake-document-v3",{body:{documentId:doc.id,batchId:batch.id,documentTypeHint:"auto",action:"analyse",keywords}});
    if(analyseError){needsReview++;await supabase.from("intake_items").update({status:"needs_review",message:"The file is stored safely but needs manual review."}).eq("id",item.id);continue;}
    const importIds:string[]=Array.isArray((analysed as any)?.statementImportIds)?(analysed as any).statementImportIds.map(String):(analysed as any)?.statementImportId?[String((analysed as any).statementImportId)]:[];
    for(const importId of importIds){if(keywords.length)await supabase.rpc("discover_statement_projects_with_keywords",{target_import:importId,target_keywords:keywords});else await supabase.rpc("discover_statement_projects",{target_import:importId});}
    if((analysed as any)?.projectId&&(analysed as any)?.status==="ready")await supabase.functions.invoke("auto-apply-project-document",{body:{documentId:doc.id,projectId}});
    if((analysed as any)?.status==="needs_review")needsReview++;else processed++;
  }
  await supabase.from("intake_batches").update({processed_files:processed+needsReview,needs_review_count:needsReview,status:failed===files.length?"failed":needsReview?"needs_review":"completed",summary:{processed,needs_review:needsReview,failed,source:"project_creation"}}).eq("id",batch.id);
}

export async function createProject(formData:FormData){
  const {supabase,userId,membership}=await getContext(); const clientName=String(formData.get("client_name")||"").trim(); const candidateId=String(formData.get("candidate_id")||"").trim(); const importId=String(formData.get("import_id")||"").trim(); const onboarding=String(formData.get("onboarding_flow")||"")==="1"; let clientId:string|null=null;
  if(clientName){const {data:client,error:clientError}=await supabase.from("clients").upsert({company_id:membership.company_id,name:clientName},{onConflict:"company_id,name"}).select("id").single();if(clientError)throw new Error(`Could not save client: ${clientError.message}`);clientId=client.id;}
  const projectCode=String(formData.get("project_code")||"").trim().toUpperCase(),projectName=String(formData.get("name")||"").trim();if(!projectCode||!projectName)throw new Error("Project code and name are required.");
  const aliases=String(formData.get("aliases")||"").split(",").map(v=>v.trim()).filter(Boolean);const projectKeywords=Array.from(new Set([projectCode,projectName,clientName,...aliases].filter(Boolean))).slice(0,30);
  const internalBudget=numberOrNull(formData.get("internal_cost_budget")),contractValue=numberOrNull(formData.get("contract_value"));
  const {data:project,error}=await supabase.from("projects").insert({company_id:membership.company_id,client_id:clientId,project_code:projectCode,name:projectName,project_type:String(formData.get("project_type")||"").trim()||null,location:String(formData.get("location")||"").trim()||null,site_address:String(formData.get("site_address")||"").trim()||null,status:String(formData.get("status")||"active"),start_date:String(formData.get("start_date")||"")||null,end_date:String(formData.get("end_date")||"")||null,contract_value:contractValue,internal_cost_budget:internalBudget,progress_percent:numberOrNull(formData.get("progress_percent"))??0,external_reference:String(formData.get("external_reference")||"").trim()||null,description:String(formData.get("description")||"").trim()||null,aliases,notes:String(formData.get("notes")||"").trim()||null,created_by:userId,updated_by:userId}).select("id").single();if(error)throw new Error(`Could not create project: ${error.message}`);

  if(clientName)await ensureClientFundingRelationship(supabase,membership.company_id,project.id,clientName,userId);

  let imagePath:string|null=null;try{imagePath=await uploadProjectImage(supabase,membership.company_id,project.id,formData.get("project_image"));if(imagePath){const {error:imageUpdateError}=await supabase.from("projects").update({project_image_path:imagePath,image_alt:String(formData.get("image_alt")||projectName).trim()||projectName,updated_by:userId,updated_at:new Date().toISOString()}).eq("id",project.id);if(imageUpdateError)throw imageUpdateError;}}catch(imageError){if(imagePath)await supabase.storage.from("project-media").remove([imagePath]);throw imageError;}

  const expectedRevenue=numberOrNull(formData.get("expected_contract_revenue"))??contractValue??0,originalBudget=numberOrNull(formData.get("original_budget"))??internalBudget??0;
  const {error:summaryError}=await supabase.from("project_financial_summaries").insert({project_id:project.id,original_budget:originalBudget,revised_budget:originalBudget,expected_contract_revenue:expectedRevenue,forecast_final_cost:originalBudget,forecast_cost_to_complete:originalBudget,forecast_profit:expectedRevenue-originalBudget});if(summaryError)throw new Error(`Project created but financial summary failed: ${summaryError.message}`);

  let autoPosted=0;let reclassified=0;
  if(candidateId){const {data:linked,error:candidateError}=await supabase.rpc("link_statement_candidate",{candidate_id:candidateId,target_project:project.id});if(candidateError)throw new Error(`Project created, but statement candidate linking failed: ${candidateError.message}`);reclassified=Number((linked as any)?.reclassified_rows??0);if(importId){const {data:posting,error:postingError}=await supabase.rpc("auto_post_statement_matches",{target_import:importId,minimum_confidence:94});if(postingError)throw new Error(`Project created and rows linked, but automatic posting failed: ${postingError.message}`);autoPosted=Number((posting as any)?.autoPosted??0);}}

  try{await analyseStartingDocuments({supabase,companyId:membership.company_id,projectId:project.id,userId,files:formData.getAll("starting_documents"),keywords:projectKeywords});}catch(e){console.error("starting document analysis failed",e);}

  revalidatePath("/projects");revalidatePath("/");if(importId){revalidatePath(`/statements/${importId}`);revalidatePath(`/statements/${importId}/projects`);}
  if(onboarding)redirect("/onboarding/team");
  redirect(candidateId&&importId?`/statements/${importId}/projects?created=${encodeURIComponent(projectCode)}&reclassified=${reclassified}&autoposted=${autoPosted}${clientName?`&client=${encodeURIComponent(clientName)}`:""}`:`/projects/${project.id}`);
}

export async function updateProject(formData:FormData){
  const {supabase,userId,membership}=await getContext();const projectId=String(formData.get("project_id")||"");if(!projectId)throw new Error("Project ID is required.");
  const {data:ownedProject,error:ownedProjectError}=await supabase.from("projects").select("id,project_image_path").eq("id",projectId).eq("company_id",membership.company_id).single();if(ownedProjectError||!ownedProject)throw new Error("Project not found in your company workspace.");
  const newImagePath=await uploadProjectImage(supabase,membership.company_id,projectId,formData.get("project_image"));
  const patch:Record<string,unknown>={name:String(formData.get("name")||"").trim(),project_type:String(formData.get("project_type")||"").trim()||null,location:String(formData.get("location")||"").trim()||null,site_address:String(formData.get("site_address")||"").trim()||null,status:String(formData.get("status")||"active"),start_date:String(formData.get("start_date")||"")||null,end_date:String(formData.get("end_date")||"")||null,progress_percent:numberOrNull(formData.get("progress_percent"))??0,contract_value:numberOrNull(formData.get("contract_value")),internal_cost_budget:numberOrNull(formData.get("internal_cost_budget")),external_reference:String(formData.get("external_reference")||"").trim()||null,description:String(formData.get("description")||"").trim()||null,aliases:String(formData.get("aliases")||"").split(",").map(v=>v.trim()).filter(Boolean),notes:String(formData.get("notes")||"").trim()||null,updated_by:userId,updated_at:new Date().toISOString()};
  if(newImagePath){patch.project_image_path=newImagePath;patch.image_alt=String(formData.get("image_alt")||formData.get("name")||"Project image").trim();}
  const {error:projectError}=await supabase.from("projects").update(patch).eq("id",projectId).eq("company_id",membership.company_id);if(projectError){if(newImagePath)await supabase.storage.from("project-media").remove([newImagePath]);throw new Error(`Could not update project: ${projectError.message}`);}if(newImagePath&&ownedProject.project_image_path&&ownedProject.project_image_path!==newImagePath)await supabase.storage.from("project-media").remove([ownedProject.project_image_path]);

  const {data:current}=await supabase.from("project_financial_summaries").select("funding_received,confirmed_expenditure,outstanding_commitments").eq("project_id",projectId).maybeSingle();
  const originalBudget=numberOrNull(formData.get("original_budget"))??numberOrNull(formData.get("internal_cost_budget"))??0,revisedBudget=numberOrNull(formData.get("revised_budget"))??originalBudget,actual=Number(current?.confirmed_expenditure??0),forecastCtc=numberOrNull(formData.get("forecast_cost_to_complete"))??Math.max(revisedBudget-actual,0),forecastFinal=actual+forecastCtc,expectedRevenue=numberOrNull(formData.get("expected_contract_revenue"))??numberOrNull(formData.get("contract_value"))??0,overhead=numberOrNull(formData.get("overhead_allocated"))??0;
  const {error:summaryError2}=await supabase.from("project_financial_summaries").upsert({project_id:projectId,original_budget:originalBudget,revised_budget:revisedBudget,forecast_cost_to_complete:forecastCtc,forecast_final_cost:forecastFinal,expected_contract_revenue:expectedRevenue,work_certified:numberOrNull(formData.get("work_certified"))??0,invoiced_amount:numberOrNull(formData.get("invoiced_amount"))??0,paid_revenue:numberOrNull(formData.get("paid_revenue"))??0,retention_held:numberOrNull(formData.get("retention_held"))??0,overhead_allocated:overhead,forecast_profit:expectedRevenue-forecastFinal-overhead,updated_at:new Date().toISOString()});if(summaryError2)throw new Error(`Project details saved but commercial forecast failed: ${summaryError2.message}`);
  const {error:refreshError}=await supabase.rpc("refresh_project_financial_summary",{target_project:projectId});if(refreshError)throw new Error(`Project saved but ledger totals could not refresh: ${refreshError.message}`);
  revalidatePath(`/projects/${projectId}`);revalidatePath("/projects");revalidatePath("/");redirect(`/projects/${projectId}?saved=1`);
}

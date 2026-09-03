export type FieldProgressWorkItem={budgetLineId:string;sourceLineId:string;costCode:string;description:string;unit:string|null;approvedQuantity:number|null;priorProgressPercent:number;priorCompletedQuantity:number|null};
export type FieldProgressEntry={budgetLineId:string;reportedProgressPercent:number;reportedCompletedQuantity:number|null;lineNote?:string|null};
export type PreparedFieldProgressLine=FieldProgressEntry&{sourceLineId:string;costCode:string;description:string;unit:string|null;approvedQuantity:number|null;effectiveProgressPercent:number};
export type FieldEvidenceMeta={name:string;mimeType:string|null;size:number};
export type EvidenceAssessment={status:"missing"|"supported";count:number;warnings:string[]};

const round4=(n:number)=>Math.round((n+Number.EPSILON)*10000)/10000;
const finite=(n:number)=>Number.isFinite(n);

export function prepareFieldProgressLines(workItems:FieldProgressWorkItem[],entries:FieldProgressEntry[]):PreparedFieldProgressLine[]{
  if(!workItems.length)throw new Error("Approved progress work items are required.");
  const itemIds=new Set(workItems.map(x=>x.budgetLineId));
  if(itemIds.size!==workItems.length)throw new Error("Approved progress work items contain duplicate IDs.");
  const entryIds=new Set(entries.map(x=>x.budgetLineId));
  if(entryIds.size!==entries.length)throw new Error("Duplicate field progress lines are not allowed.");
  if(entries.length!==workItems.length||entries.some(x=>!itemIds.has(x.budgetLineId)))throw new Error("A PM field report must contain every approved work item.");
  const byId=new Map(entries.map(x=>[x.budgetLineId,x]));
  return workItems.map(item=>{
    const entry=byId.get(item.budgetLineId)!;
    let progress=entry.reportedProgressPercent;
    const completed=entry.reportedCompletedQuantity;
    if(completed!==null){
      if(!finite(completed)||completed<0)throw new Error(`Invalid completed quantity for ${item.description}.`);
      if(item.approvedQuantity===null||item.approvedQuantity<=0)throw new Error(`Completed quantity cannot be used for ${item.description} because the approved quantity is unavailable.`);
      if(completed>item.approvedQuantity+0.000001)throw new Error(`Completed quantity exceeds the approved quantity for ${item.description}.`);
      progress=round4(completed/item.approvedQuantity*100);
    }
    if(!finite(progress)||progress<0||progress>100)throw new Error(`Progress must be between 0 and 100 for ${item.description}.`);
    if(progress+0.0001<item.priorProgressPercent)throw new Error(`Reported progress cannot reduce below the last approved progress for ${item.description}.`);
    const note=entry.lineNote?.trim()||null;
    if(note&&note.length>1000)throw new Error(`Line note is too long for ${item.description}.`);
    return{...entry,lineNote:note,sourceLineId:item.sourceLineId,costCode:item.costCode,description:item.description,unit:item.unit,approvedQuantity:item.approvedQuantity,effectiveProgressPercent:progress};
  });
}

export function assessFieldEvidence(files:FieldEvidenceMeta[]):EvidenceAssessment{
  const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
  const warnings:string[]=[];
  if(files.length>8)warnings.push("Attach no more than 8 site evidence files to one field report.");
  for(const file of files){
    if(file.size<=0||file.size>10*1024*1024)warnings.push(`${file.name} must be between 1 byte and 10 MB.`);
    if(!file.mimeType||!allowed.has(file.mimeType))warnings.push(`${file.name} must be JPG, PNG, WebP or PDF evidence.`);
  }
  if(!files.length)warnings.push("At least one site photo or PDF evidence is required before a PM field report is submitted for MD review.");
  return{status:files.length&&warnings.length===0?"supported":"missing",count:files.length,warnings};
}

export function safeWorkItemForPm(item:FieldProgressWorkItem){
  return{budgetLineId:item.budgetLineId,sourceLineId:item.sourceLineId,costCode:item.costCode,description:item.description,unit:item.unit,approvedQuantity:item.approvedQuantity,priorProgressPercent:item.priorProgressPercent,priorCompletedQuantity:item.priorCompletedQuantity};
}

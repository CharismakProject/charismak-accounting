export type MobileFieldProgressWorkItem={budgetLineId:string;sourceLineId:string;costCode:string;description:string;unit:string|null;approvedQuantity:number|null;priorProgressPercent:number;priorCompletedQuantity:number|null};
export type MobileFieldProgressEntry={budgetLineId:string;reportedProgressPercent:number;reportedCompletedQuantity:number|null;lineNote?:string|null};
export type MobilePreparedFieldProgressLine=MobileFieldProgressEntry&{effectiveProgressPercent:number};
export type MobileFieldEvidenceMeta={name:string;mimeType:string|null;size:number};

const round4=(n:number)=>Math.round((n+Number.EPSILON)*10000)/10000;

export function prepareMobileFieldProgressLines(workItems:MobileFieldProgressWorkItem[],entries:MobileFieldProgressEntry[]):MobilePreparedFieldProgressLine[]{
  if(!workItems.length)throw new Error("Approved progress work items are required.");
  const ids=new Set(workItems.map(item=>item.budgetLineId));
  if(ids.size!==workItems.length)throw new Error("Approved progress work items contain duplicate IDs.");
  const entryIds=new Set(entries.map(entry=>entry.budgetLineId));
  if(entryIds.size!==entries.length)throw new Error("Duplicate field progress lines are not allowed.");
  if(entries.length!==workItems.length||entries.some(entry=>!ids.has(entry.budgetLineId)))throw new Error("A PM field report must contain every approved work item.");
  const byId=new Map(entries.map(entry=>[entry.budgetLineId,entry]));
  return workItems.map(item=>{
    const entry=byId.get(item.budgetLineId)!;
    let progress=entry.reportedProgressPercent;
    const completed=entry.reportedCompletedQuantity;
    if(completed!==null){
      if(!Number.isFinite(completed)||completed<0)throw new Error(`Invalid completed quantity for ${item.description}.`);
      if(item.approvedQuantity===null||item.approvedQuantity<=0)throw new Error(`Completed quantity cannot be used for ${item.description} because the approved quantity is unavailable.`);
      if(completed>item.approvedQuantity+0.000001)throw new Error(`Completed quantity exceeds the approved quantity for ${item.description}.`);
      progress=round4(completed/item.approvedQuantity*100);
    }
    if(!Number.isFinite(progress)||progress<0||progress>100)throw new Error(`Progress must be between 0 and 100 for ${item.description}.`);
    if(progress+0.0001<item.priorProgressPercent)throw new Error(`Reported progress cannot reduce below the last approved progress for ${item.description}.`);
    const note=entry.lineNote?.trim()||null;
    if(note&&note.length>1000)throw new Error(`Line note is too long for ${item.description}.`);
    return{...entry,lineNote:note,effectiveProgressPercent:progress};
  });
}

export function assessMobileFieldEvidence(files:MobileFieldEvidenceMeta[]){
  const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
  const warnings:string[]=[];
  if(files.length>8)warnings.push("Attach no more than 8 site evidence files to one field report.");
  for(const file of files){
    if(file.size<=0||file.size>10*1024*1024)warnings.push(`${file.name} must be between 1 byte and 10 MB.`);
    if(!file.mimeType||!allowed.has(file.mimeType))warnings.push(`${file.name} must be JPG, PNG, WebP or PDF evidence.`);
  }
  if(!files.length)warnings.push("At least one site photo or PDF evidence is required before a PM field report is submitted for MD review.");
  return{status:files.length&&warnings.length===0?"supported" as const:"missing" as const,count:files.length,warnings};
}

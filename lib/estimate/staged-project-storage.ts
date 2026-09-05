import { parseStagedProjectWorkspace, type StagedProjectWorkspace } from "./staged-project-workspace";

const KEY="charismak:staged-project-workspaces:v1";

export function loadStagedProjectWorkspaces():StagedProjectWorkspace[]{
  if(typeof window==="undefined")return[];
  try{const raw=window.localStorage.getItem(KEY);if(!raw)return[];const parsed=JSON.parse(raw);if(!Array.isArray(parsed))return[];return parsed.map(value=>parseStagedProjectWorkspace(JSON.stringify(value))).filter((value):value is StagedProjectWorkspace=>Boolean(value)).sort((a,b)=>b.stagedAt.localeCompare(a.stagedAt));}catch{return[];}
}

export function saveStagedProjectWorkspace(workspace:StagedProjectWorkspace){
  if(typeof window==="undefined")throw new Error("Project draft storage is available only in the browser.");
  const current=loadStagedProjectWorkspaces().filter(item=>item.workspaceId!==workspace.workspaceId);
  window.localStorage.setItem(KEY,JSON.stringify([workspace,...current].slice(0,25)));
}

export function getStagedProjectWorkspace(workspaceId:string){return loadStagedProjectWorkspaces().find(item=>item.workspaceId===workspaceId)??null;}

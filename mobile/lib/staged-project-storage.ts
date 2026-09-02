import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MobileStagedProjectWorkspace } from "./estimate-summary";

const KEY="charismak:staged-project-workspaces:v1";
const valid=(value:any):value is MobileStagedProjectWorkspace=>value?.schemaVersion===1&&value?.status==="reviewed_draft"&&typeof value?.workspaceId==="string"&&typeof value?.project?.name==="string"&&Array.isArray(value?.costGroups);

export async function loadMobileStagedProjectWorkspaces():Promise<MobileStagedProjectWorkspace[]>{const raw=await AsyncStorage.getItem(KEY);if(!raw)return[];try{const parsed=JSON.parse(raw);if(!Array.isArray(parsed))return[];return parsed.filter(valid).sort((a,b)=>b.stagedAt.localeCompare(a.stagedAt));}catch{return[];}}
export async function saveMobileStagedProjectWorkspace(workspace:MobileStagedProjectWorkspace){const current=(await loadMobileStagedProjectWorkspaces()).filter(item=>item.workspaceId!==workspace.workspaceId);await AsyncStorage.setItem(KEY,JSON.stringify([workspace,...current].slice(0,25)));}
export async function getMobileStagedProjectWorkspace(workspaceId:string){return (await loadMobileStagedProjectWorkspaces()).find(item=>item.workspaceId===workspaceId)??null;}

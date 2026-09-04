import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MobileStagedProjectWorkspace } from "./estimate-summary";

const KEY="charismak:staged-project-workspaces:v2";
const LEGACY=["charismak:staged-project-workspaces:v1"];
let legacyCleared=false;
const valid=(value:any):value is MobileStagedProjectWorkspace=>value?.schemaVersion===1&&value?.status==="reviewed_draft"&&typeof value?.workspaceId==="string"&&typeof value?.project?.name==="string"&&Array.isArray(value?.costGroups);
async function cleanLegacy(){if(legacyCleared)return;legacyCleared=true;await AsyncStorage.multiRemove(LEGACY);}

export async function loadMobileStagedProjectWorkspaces():Promise<MobileStagedProjectWorkspace[]>{await cleanLegacy();const raw=await AsyncStorage.getItem(KEY);if(!raw)return[];try{const parsed=JSON.parse(raw);if(!Array.isArray(parsed))return[];return parsed.filter(valid).sort((a,b)=>b.stagedAt.localeCompare(a.stagedAt));}catch{return[];}}
export async function saveMobileStagedProjectWorkspace(workspace:MobileStagedProjectWorkspace){await cleanLegacy();const current=(await loadMobileStagedProjectWorkspaces()).filter(item=>item.workspaceId!==workspace.workspaceId);await AsyncStorage.setItem(KEY,JSON.stringify([workspace,...current].slice(0,25)));}
export async function getMobileStagedProjectWorkspace(workspaceId:string){return (await loadMobileStagedProjectWorkspaces()).find(item=>item.workspaceId===workspaceId)??null;}
export async function clearMobileStagedProjectWorkspaces(){await AsyncStorage.multiRemove([KEY,...LEGACY]);}

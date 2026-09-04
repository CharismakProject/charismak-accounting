import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MobileEstimateReviewSession } from "./estimate-types";

const KEY="charismak:reviewed-estimate-session:v2";
const LEGACY=["charismak:reviewed-estimate-session:v1"];
let legacyCleared=false;
async function cleanLegacy(){if(legacyCleared)return;legacyCleared=true;await AsyncStorage.multiRemove(LEGACY);}

export async function saveEstimateReviewSession(session:MobileEstimateReviewSession){await cleanLegacy();await AsyncStorage.setItem(KEY,JSON.stringify(session));}
export async function loadEstimateReviewSession():Promise<MobileEstimateReviewSession|null>{await cleanLegacy();const raw=await AsyncStorage.getItem(KEY);if(!raw)return null;try{const parsed=JSON.parse(raw) as MobileEstimateReviewSession;if(parsed?.schemaVersion!==1||!parsed.boq?.id||!Array.isArray(parsed.boq.sections))return null;return parsed;}catch{return null;}}
export async function clearEstimateReviewSession(){await AsyncStorage.multiRemove([KEY,...LEGACY]);}

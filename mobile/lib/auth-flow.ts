import { router } from "expo-router";
import { supabase } from "./supabase";
import { hasActiveWorkspace } from "./workspace";

export const AUTH_CALLBACK_URL="charismak://auth-callback";

export const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export const validPassword=(value:string)=>value.length>=8;

export function friendlyAuthError(message?:string){
  const text=(message||"").toLowerCase();
  if(text.includes("invalid login credentials"))return "The email or password is incorrect.";
  if(text.includes("email not confirmed"))return "Please confirm your email before signing in.";
  if(text.includes("user already registered"))return "An account already exists for this email. Sign in instead.";
  if(text.includes("password"))return message||"Please check the password and try again.";
  if(text.includes("rate limit")||text.includes("too many"))return "Too many attempts. Please wait a little and try again.";
  return message||"Something went wrong. Please try again.";
}

export async function routeAfterAuthentication(){
  const {data}=await supabase.auth.getSession();
  if(!data.session){router.replace("/login");return;}
  try{
    router.replace((await hasActiveWorkspace())?"/(tabs)":"/onboarding");
  }catch{
    router.replace("/onboarding");
  }
}

export function authParamsFromUrl(url:string){
  const combined=url.includes("#")?url.split("#")[1]:url.split("?")[1]||"";
  const params=new URLSearchParams(combined);
  return{
    accessToken:params.get("access_token"),
    refreshToken:params.get("refresh_token"),
    type:params.get("type"),
    errorDescription:params.get("error_description")||params.get("error"),
  };
}

export function readableError(error:unknown,fallback="Something went wrong."){
  const e=error as any;
  const code=String(e?.code||"");
  const raw=String(e?.message||e?.details||"").trim();
  if(code==="42501"||/row-level security|permission denied/i.test(raw))return "Your account does not have permission to do this. Sign out and back in; if it persists, the workspace permissions need repair.";
  if(code==="23505"||/duplicate key/i.test(raw))return "This looks like a duplicate record. Check the existing records before trying again.";
  if(code==="23503"||/foreign key/i.test(raw))return "A required linked record is missing. Refresh the app and try again.";
  if(code==="PGRST204"||/schema cache|column .* not found/i.test(raw))return "The app and accounting database are out of sync. This action was stopped rather than saving partial data.";
  if(/network|fetch|offline/i.test(raw))return "Could not reach the accounting service. Check your internet connection and try again.";
  return raw||fallback;
}

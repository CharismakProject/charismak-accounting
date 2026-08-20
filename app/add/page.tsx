import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import UniversalAddClient from "./UniversalAddClient";

export default async function AddPage(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:membership}=await supabase.from("company_memberships").select("company_id").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(!membership)redirect("/login?message=No+active+company+membership");
  const {data:projects}=await supabase.from("projects").select("id,project_code,name").eq("company_id",membership.company_id).neq("status","archived").order("name");
  return <main className="simple-shell"><div className="simple-wrap"><div className="simple-top"><Link href="/">← Home</Link><Link href="/projects">Projects</Link></div><UniversalAddClient companyId={membership.company_id} projects={projects??[]} /></div></main>;
}

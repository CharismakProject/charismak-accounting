import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

export default async function ProjectWorkspaceLayout({children,params}:{children:React.ReactNode;params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const {data:project}=await supabase.from("projects").select("id,project_code,name").eq("id",id).maybeSingle();
  return <><div className="project-workspace-nav"><div><small>{project?.project_code||"PROJECT"}</small><b>{project?.name||"Project workspace"}</b></div><nav><Link href={`/projects/${id}`}>Overview</Link><Link href={`/projects/${id}/documents`}>Documents</Link><Link href={`/projects/${id}/progress`}>Progress</Link><Link href="/projects">All projects</Link></nav></div>{children}</>;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import ControlRoomClient from "./ControlRoomClient";
import { type RoleFamily } from "./DashboardClient";

const allFamilies: RoleFamily[] = ["md_owner", "accountant_cfo", "project_director", "project_manager"];

export default async function Home() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/welcome");

  const { data: membership } = await supabase
    .from("company_memberships")
    .select("id,company_id,is_owner,status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/welcome");

  const [{ data: company }, { data: positionRows }, { data: preference }, { data: assignments }] = await Promise.all([
    supabase.from("companies").select("name,onboarding_completed").eq("id", membership.company_id).maybeSingle(),
    supabase.from("membership_positions").select("is_primary,position:positions(code,name,interface_family)").eq("membership_id", membership.id),
    supabase.from("user_interface_preferences").select("active_interface").eq("company_id", membership.company_id).eq("user_id", user.id).maybeSingle(),
    supabase.from("project_assignments").select("project_id,assignment_role,can_view_cost,can_request,can_approve").eq("membership_id", membership.id),
  ]);

  if (membership.is_owner && !company?.onboarding_completed) redirect("/onboarding/start");

  const assignedFamilies = Array.from(new Set((positionRows ?? []).map((row: any) => row.position?.interface_family).filter(Boolean))) as RoleFamily[];
  const availableRoles = membership.is_owner ? allFamilies : assignedFamilies.length ? assignedFamilies : (["project_manager"] as RoleFamily[]);
  const preferred = preference?.active_interface as RoleFamily | undefined;
  const initialRole: RoleFamily = preferred && availableRoles.includes(preferred) ? preferred : membership.is_owner ? "md_owner" : availableRoles[0];
  const primaryRow: any = (positionRows ?? []).find((row: any) => row.is_primary) ?? (positionRows ?? [])[0];
  const signedInRole = membership.is_owner ? "MD / Owner" : primaryRow?.position?.name ?? "Company member";
  const assignedProjectIds = Array.from(new Set((assignments ?? []).map((row: any) => row.project_id).filter(Boolean))) as string[];
  const projectScopedMember = !membership.is_owner && !assignedFamilies.includes("accountant_cfo");

  let projectQuery = supabase
    .from("projects")
    .select("id,project_code,name,location,status,progress_percent,contract_value,internal_cost_budget,project_image_path,created_at,summary:project_financial_summaries(funding_received,company_funding,other_financing,confirmed_expenditure,cash_balance,outstanding_commitments,funding_surplus_shortfall,revised_budget,forecast_cost_to_complete,forecast_final_cost,expected_contract_revenue,forecast_profit,reporting_period_start,reporting_period_end)")
    .eq("company_id", membership.company_id)
    .neq("status", "archived");

  if (projectScopedMember) {
    projectQuery = assignedProjectIds.length
      ? projectQuery.in("id", assignedProjectIds)
      : projectQuery.in("id", ["00000000-0000-0000-0000-000000000000"]);
  }

  const [projectResult, accountResult, approvalResult, statementResult, transactionResult, auditResult, companyFinanceResult] = await Promise.all([
    projectQuery,
    supabase.from("financial_accounts").select("id,institution_name,account_name,account_type,current_balance,balance_as_of,last_statement_at").eq("company_id", membership.company_id).eq("is_active", true).order("institution_name"),
    supabase.from("approval_requests").select("id,project_id,request_type,description,amount,status,urgency,requested_at").eq("company_id", membership.company_id).order("requested_at", { ascending: false }).limit(100),
    supabase.from("statement_imports").select("id,detected_institution_name,detected_account_name,status,rows_total,rows_new,rows_already_known,rows_need_review,rows_auto_posted,rows_pending_review,created_at").eq("company_id", membership.company_id).order("created_at", { ascending: false }).limit(30),
    supabase.from("canonical_transactions").select("id,project_id,signed_amount,classification,status,transaction_date,narration,category_name,is_internal_transfer,is_personal_non_business").eq("company_id", membership.company_id).order("transaction_date", { ascending: false }).limit(5000),
    membership.is_owner ? supabase.from("audit_log").select("id,actor_email,acting_interface,action,entity_type,created_at").eq("company_id", membership.company_id).order("created_at", { ascending: false }).limit(12) : Promise.resolve({ data: [] } as any),
    supabase.rpc("company_control_summary", { target_company: membership.company_id }),
  ]);

  const statusRank: Record<string, number> = { active: 0, on_hold: 1, draft: 2, completed: 3 };
  const projects = (projectResult.data ?? [])
    .map((project: any) => ({ ...project, summary: Array.isArray(project.summary) ? project.summary[0] : project.summary }))
    .sort((a: any, b: any) => {
      const rank = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
      if (rank !== 0) return rank;
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });
  const dashboardAccounts = (accountResult.data ?? []).map((account: any) => ({
    ...account,
    institution_name: account.account_name || account.institution_name,
  }));
  const statementRows:any[] = statementResult.data ?? [];
  const projectStatement = statementRows.find((row:any)=>Number(row.rows_total??0)>0);

  const projectIds = projects.map((p: any) => p.id);
  const visibleApprovals = projectScopedMember
    ? (approvalResult.data ?? []).filter((row: any) => row.project_id && projectIds.includes(row.project_id))
    : (approvalResult.data ?? []);
  const visibleTransactions = projectScopedMember
    ? (transactionResult.data ?? []).filter((row: any) => row.project_id && projectIds.includes(row.project_id))
    : (transactionResult.data ?? []);

  const [{ data: imprests }, { data: costCategories }] = projectIds.length
    ? await Promise.all([
        supabase.from("imprest_accounts").select("id,project_id,name,approved_limit,current_balance,status").in("project_id", projectIds).eq("status", "active"),
        supabase.from("project_cost_categories").select("project_id,category_name,amount,sort_order").in("project_id", projectIds).order("sort_order"),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];

  return <>
    {projects.length===0&&<section style={{margin:"12px auto 0",width:"min(1180px,calc(100% - 24px))",border:"1px solid #cfe0e8",borderRadius:16,background:"linear-gradient(135deg,#f8fcff,#eef8f5)",padding:"16px 17px",display:"grid",gap:10}}>
      <div><small style={{fontSize:9,fontWeight:900,letterSpacing:".13em",color:"#16745e"}}>START WITH WHAT YOU ALREADY HAVE</small><h2 style={{margin:"5px 0 4px",fontSize:20,color:"#14354d"}}>{projectStatement?"Your records are in. Turn their signals into your first projects.":"Do not rebuild your accounting from scratch."}</h2><p style={{margin:0,maxWidth:760,fontSize:12,lineHeight:1.55,color:"#63788a"}}>{projectStatement?"Review the names, site tags and keywords found in the statement, or search it with your own keywords, then create or link the real projects.":"Upload financial statements, BOQs, quotations, invoices, bills and receipts you already use. Tell Charismak what each file is and what you want done; it will organise the records and ask only for decisions that matter."}</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{projectStatement&&<Link href={`/statements/${projectStatement.id}/projects`} className="primary-link-button">Review statement project signals</Link>}<Link href="/add" className={projectStatement?"secondary-button":"primary-link-button"}>{projectStatement?"Add another record":"Upload existing records"}</Link><Link href="/projects/new" className="secondary-button">Create a project manually</Link></div>
    </section>}
    <ControlRoomClient
      companyId={membership.company_id}
      companyName={company?.name ?? "Company"}
      userEmail={user.email ?? ""}
      signedInRole={signedInRole}
      isOwner={Boolean(membership.is_owner)}
      initialRole={initialRole}
      availableRoles={availableRoles}
      managerProjectIds={assignedProjectIds}
      projects={projects}
      accounts={dashboardAccounts}
      approvals={visibleApprovals}
      statements={statementRows}
      transactions={visibleTransactions}
      auditRows={auditResult.data ?? []}
      imprests={imprests ?? []}
      costCategories={costCategories ?? []}
      companyFinance={companyFinanceResult.data ?? null}
    />
  </>;
}

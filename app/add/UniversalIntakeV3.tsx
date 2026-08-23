"use client";

// Compatibility wrapper. Older project/document pages may still import V3,
// but all upload surfaces now execute the same hardened V6 intake pipeline.
import UniversalIntakeV6 from "./UniversalIntakeV6";

type Project={id:string;project_code:string;name:string};

export default function UniversalIntakeV3({companyId,projects,defaultProjectId="",embedded=false,onboarding=false}:{companyId:string;projects:Project[];defaultProjectId?:string;embedded?:boolean;onboarding?:boolean;[key:string]:unknown}){
  return <UniversalIntakeV6 companyId={companyId} projects={projects} defaultProjectId={defaultProjectId} embedded={embedded} onboarding={onboarding}/>;
}

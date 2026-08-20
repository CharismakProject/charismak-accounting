"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function GlobalAddButton(){
  const pathname=usePathname();
  if(pathname.startsWith("/login")||pathname.startsWith("/auth")||pathname==="/add")return null;
  return <Link href="/add" className="global-add-button" aria-label="Add records to Charismak Accounting"><span>＋</span><b>Add</b></Link>;
}

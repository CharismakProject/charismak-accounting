"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function refresh() {
      const { data: auth } = await supabase.auth.getUser();
      if (!active) return;
      if (!auth.user) {
        setSignedIn(false);
        setCount(0);
        return;
      }
      setSignedIn(true);
      const { count: unread } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", auth.user.id)
        .is("read_at", null);
      if (active) setCount(Number(unread || 0));
    }

    refresh();
    const timer = window.setInterval(refresh, 30000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  if (!signedIn) return null;
  return (
    <Link href="/notifications" className="notification-bell" aria-label={`${count} unread notifications`} title="Notifications">
      <span aria-hidden="true">🔔</span>
      {count > 0 && <b>{count > 99 ? "99+" : count}</b>}
    </Link>
  );
}

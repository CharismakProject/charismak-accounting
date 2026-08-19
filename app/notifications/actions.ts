"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";

export async function markNotificationRead(formData: FormData) {
  const id = String(formData.get("notification_id") || "");
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", { target_notification: id });
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

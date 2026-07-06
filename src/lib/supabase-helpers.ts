import { supabase } from "@/integrations/supabase/client";

export const db = supabase as any;

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getIsAdmin(userId?: string) {
  const user = userId ? { id: userId } : await getCurrentUser();
  if (!user) return false;
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  return data?.role === "admin";
}

export async function getKycStatus(userId: string) {
  const { data } = await db
    .from("kyc_submissions")
    .select("status, admin_notes, submitted_at, reviewed_at")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { status?: string; admin_notes?: string | null; submitted_at?: string; reviewed_at?: string | null } | null;
}

export async function uploadPrivateFile(bucket: string, userId: string, file?: File | null) {
  if (!file) return null;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const uniqueId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/${uniqueId}-${safeName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

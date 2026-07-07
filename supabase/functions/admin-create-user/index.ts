import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");

    if (!jwt) throw new Error("Missing administrator session");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: caller, error: callerError } = await admin.auth.getUser(jwt);
    if (callerError || !caller.user) throw new Error("Invalid administrator session");

    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (role?.role !== "admin") throw new Error("Admin privileges required");

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.full_name ?? body.fullName ?? email).trim();

    if (!email || !password) throw new Error("Email and temporary password are required");
    if (password.length < 8) throw new Error("Temporary password must be at least 8 characters");

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        must_change_password: true,
      },
    });

    if (error) throw error;

    if (data.user) {
      await admin.from("profiles").upsert({
        id: data.user.id,
        full_name: fullName,
        email,
        must_change_password: true,
        status: "active",
      }, { onConflict: "id" });

      await admin.from("balances").upsert({ user_id: data.user.id }, { onConflict: "user_id" });
      await admin.from("user_roles").upsert({ user_id: data.user.id, role: "user" }, { onConflict: "user_id,role" });
      await admin.from("account_limits").upsert({ user_id: data.user.id }, { onConflict: "user_id" });
      await admin.from("user_preferences").upsert({ user_id: data.user.id }, { onConflict: "user_id" });
      const { data: existingWelcome } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", data.user.id)
        .eq("title", "Welcome to fivberfinancial")
        .limit(1)
        .maybeSingle();

      if (!existingWelcome) {
        await admin.from("notifications").insert({
          user_id: data.user.id,
          type: "system",
          title: "Welcome to fivberfinancial",
          body: "Your account has been created. Please sign in and change your temporary password.",
        });
      }
    }

    return new Response(JSON.stringify({ user_id: data.user?.id, email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp, Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

type Mode = "signin" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);

    // Log login history (best-effort)
    if (data.user) {
      supabase.from("login_history").insert({
        user_id: data.user.id,
        user_agent: navigator.userAgent,
        device: navigator.platform,
      });
    }

    // Check must_change_password
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", data.user!.id)
      .maybeSingle();

    toast.success("Welcome back");
    if (profile?.must_change_password) navigate({ to: "/change-password" });
    else navigate({ to: "/dashboard" });
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent");
    setMode("signin");
  };

  return (
    <div className="flex min-h-screen bg-gradient-hero">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-primary p-12 text-primary-foreground lg:flex">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
            <TrendingUp className="h-4 w-4" />
          </span>
          {BRAND_NAME}
        </Link>
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-4xl font-bold leading-tight">
            Secure access,
            <br />
            premium investing.
          </h2>
          <p className="mt-4 text-primary-foreground/80">
            Sign in to access your portfolio, complete KYC, review daily earnings, and manage deposits and withdrawals from one secure dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-primary-foreground/70">
          <ShieldCheck className="h-4 w-4" /> Accounts are created by administrators only. Contact your account manager for access.
        </div>
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary-glow/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-accent/30 blur-3xl" />
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:hidden">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>

          <div className="rounded-3xl border border-border/60 bg-card p-8 shadow-elegant">
            <h1 className="font-display text-2xl font-bold">
              {mode === "signin" ? "Sign in to your account" : "Reset your password"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Use the credentials provided by your administrator."
                : "We'll email you a secure reset link."}
            </p>

            <form onSubmit={mode === "signin" ? handleSignIn : handleForgot} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="h-11 rounded-xl"
                />
              </div>
              {mode === "signin" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-primary-glow hover:underline"
                    >
                      Forgot?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-xl bg-gradient-primary text-primary-foreground shadow-soft"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Send reset link"}
              </Button>

              {mode === "forgot" && (
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to sign in
                </button>
              )}
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Protected by secure authentication, KYC checks, and audited financial workflows
          </p>
        </div>
      </div>
    </div>
  );
}

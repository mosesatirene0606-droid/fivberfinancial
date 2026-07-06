import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase auto-handles the recovery link hash and creates a session
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) toast.error("Reset link is invalid or expired");
      setReady(true);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords do not match");
    if (password.length < 8) return toast.error("Use at least 8 characters");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", (await supabase.auth.getUser()).data.user!.id);
    }
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  };

  if (!ready) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-6">
      <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card p-8 shadow-elegant">
        <h1 className="font-display text-2xl font-bold">Set a new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Choose a strong password you don't use elsewhere.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>New password</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Confirm password</Label>
            <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-gradient-primary text-primary-foreground">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update password
          </Button>
        </form>
      </div>
    </div>
  );
}

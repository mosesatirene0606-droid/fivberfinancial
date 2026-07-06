import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Loader2, Lock, CalendarClock, Percent, BadgeDollarSign, Rocket, Shield, Crown, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db, getKycStatus } from "@/lib/supabase-helpers";
import { formatCurrency, formatPercent, statusClass } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/invest")({ component: InvestPage });

type Plan = { id: string; name: string; description: string | null; min_amount: number; max_amount: number | null; daily_roi_percent: number; duration_days: number; active: boolean };
type Investment = { id: string; amount: number; accrued_profit: number; status: string; maturity_date: string; start_date?: string; investment_plans?: { name?: string; duration_days?: number } | null };

const fallbackPlans: Plan[] = [
  { id: "starter", name: "Starter", description: "Entry plan for verified investors.", min_amount: 100, max_amount: 1000, daily_roi_percent: 1.2, duration_days: 30, active: true },
  { id: "growth", name: "Growth", description: "Balanced growth plan with medium risk and structured duration.", min_amount: 500, max_amount: 5000, daily_roi_percent: 1.6, duration_days: 90, active: true },
  { id: "silver", name: "Silver", description: "Balanced plan for steady portfolio growth.", min_amount: 1000, max_amount: 5000, daily_roi_percent: 1.8, duration_days: 45, active: true },
  { id: "premium", name: "Premium", description: "Premium higher-limit plan for experienced investors.", min_amount: 1000, max_amount: 20000, daily_roi_percent: 2.1, duration_days: 180, active: true },
];

function InvestPage() {
  const [plans, setPlans] = useState<Plan[]>(fallbackPlans);
  const [selected, setSelected] = useState<Plan | null>(fallbackPlans[0]);
  const [amount, setAmount] = useState("5000");
  const [balance, setBalance] = useState(0);
  const [kyc, setKyc] = useState("pending");
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const [planResult, balanceResult, kycData, invResult] = await Promise.all([
        db.from("investment_plans").select("id,name,description,min_amount,max_amount,daily_roi_percent,duration_days,active").eq("active", true).order("min_amount"),
        supabase.from("balances").select("available").eq("user_id", userData.user.id).maybeSingle(),
        getKycStatus(userData.user.id),
        db.from("user_investments").select("id,amount,accrued_profit,status,start_date,maturity_date,investment_plans(name,duration_days)").eq("user_id", userData.user.id).order("created_at", { ascending: false }).limit(6),
      ]);
      if (planResult.data?.length) {
        setPlans(planResult.data as Plan[]);
        setSelected((planResult.data as Plan[])[0]);
      }
      setBalance(Number(balanceResult.data?.available ?? 0));
      setKyc(kycData?.status ?? "pending");
      setInvestments((invResult.data ?? []) as Investment[]);
    })();
  }, []);

  const createInvestment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    if (kyc !== "approved") return toast.error("KYC must be approved before investing");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter a valid investment amount");
    if (value < Number(selected.min_amount)) return toast.error(`Minimum for ${selected.name} is ${formatCurrency(selected.min_amount)}`);
    if (selected.max_amount && value > Number(selected.max_amount)) return toast.error(`Maximum for ${selected.name} is ${formatCurrency(selected.max_amount)}`);
    if (value > balance) return toast.error("Insufficient available balance");
    setLoading(true);
    try {
      const { data, error } = await db.rpc("create_investment", { _plan_id: selected.id, _amount: value });
      if (error) throw error;
      toast.success("Investment activated successfully");
      setAmount("");
      setBalance((b) => b - value);
      setInvestments((rows) => [{ id: String(data ?? Date.now()), amount: value, accrued_profit: 0, status: "active", start_date: new Date().toISOString(), maturity_date: new Date(Date.now() + selected.duration_days * 86400000).toISOString(), investment_plans: { name: selected.name, duration_days: selected.duration_days } }, ...rows]);
    } catch (error: any) {
      toast.error(error.message ?? "Unable to activate investment");
    } finally {
      setLoading(false);
    }
  };

  const expectedDaily = useMemo(() => selected && Number(amount) > 0 ? (Number(amount) * Number(selected.daily_roi_percent)) / 100 : 0, [amount, selected]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Investment plans</h1>
          <p className="mt-2 text-base text-muted-foreground">Choose a plan, enter an amount, and allow the server to calculate daily ROI and maturity.</p>
        </div>
        <Badge variant="outline" className={`rounded-full px-4 py-2 text-sm ${statusClass(kyc)}`}>KYC: {kyc.replace("_", " ")}</Badge>
      </div>

      {kyc !== "approved" && (
        <Card className="min-w-0 rounded-[1.5rem] border-blue-200 bg-blue-50/70 p-5 text-blue-800 shadow-soft dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4"><Lock className="mt-1 h-6 w-6" /><div><div className="text-lg font-bold">Verification required</div><p className="text-sm">You must complete and receive KYC approval before investment activation.</p></div></div>
            <Link to="/kyc"><Button variant="outline" className="rounded-xl bg-white/70 px-7 dark:bg-background/40">Complete KYC</Button></Link>
          </div>
        </Card>
      )}

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.65fr]">
        <div className="grid gap-6 md:grid-cols-2">
          {plans.map((plan, index) => {
            const active = selected?.id === plan.id;
            const Icon = planIcon(plan.name, index);
            const tone = planTone(plan.name, index);
            return (
              <button key={plan.id} type="button" onClick={() => setSelected(plan)} className={`rounded-[1.75rem] border bg-card p-7 text-left shadow-soft transition-all hover:-translate-y-1 hover:shadow-elegant ${active ? "border-primary ring-2 ring-primary/15" : "border-border/70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`inline-flex h-16 w-16 items-center justify-center rounded-full ${tone}`}><Icon className="h-8 w-8" /></span>
                  {active && <Badge className="rounded-full bg-blue-50 text-primary ring-1 ring-primary/20 dark:bg-blue-400/10">Selected</Badge>}
                </div>
                <h2 className="mt-5 font-display text-2xl font-bold">{plan.name}</h2>
                <p className="mt-2 min-h-10 text-sm leading-6 text-muted-foreground">{plan.description ?? "Configurable investment plan."}</p>
                <div className="mt-7 grid grid-cols-2 gap-5 border-b border-border/70 pb-5">
                  <InfoStat label="Daily ROI" value={formatPercent(plan.daily_roi_percent)} tone={toneText(tone)} />
                  <InfoStat label="Duration" value={`${plan.duration_days} days`} tone={toneText(tone)} />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-5">
                  <InfoStat label="Minimum" value={formatCurrency(plan.min_amount)} />
                  <InfoStat label="Maximum" value={plan.max_amount ? formatCurrency(plan.max_amount) : "Unlimited"} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-7">
          <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-8 shadow-soft">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-primary dark:bg-blue-400/10"><TrendingUp className="h-8 w-8" /></span>
            <h2 className="mt-6 font-display text-2xl font-bold">Activate investment</h2>
            <p className="mt-4 text-base text-muted-foreground">Available balance: <span className="font-bold text-primary">{formatCurrency(balance)}</span></p>
            <form onSubmit={createInvestment} className="mt-7 space-y-6">
              <div className="space-y-2">
                <Label>Selected plan</Label>
                <Select value={selected?.id ?? ""} onValueChange={(value) => setSelected(plans.find((p) => p.id === value) ?? selected)}>
                  <SelectTrigger className="h-14 rounded-2xl text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Investment amount</Label>
                <div className="relative">
                  <Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" className="h-14 rounded-2xl pr-20 text-base" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground">USD</span>
                </div>
              </div>
              {selected && Number(amount) > 0 && (
                <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5 text-sm dark:border-blue-400/20 dark:bg-blue-400/10">
                  <div className="flex items-center gap-2 font-bold"><Percent className="h-4 w-4 text-emerald-600" /> Expected daily earning</div>
                  <div className="mt-2 font-display text-3xl font-extrabold">{formatCurrency(expectedDaily)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Maturity: {selected.duration_days} days · server calculated</div>
                </div>
              )}
              <Button disabled={loading || kyc !== "approved"} className="h-14 w-full rounded-2xl bg-gradient-primary text-base text-primary-foreground shadow-soft">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Activate investment <ArrowRight className="ml-auto h-5 w-5" />
              </Button>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Shield className="h-4 w-4" /> Your investment is secured and encrypted</div>
            </form>
          </Card>

          <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft">
            <h2 className="font-display text-xl font-bold">Active investments</h2>
            <div className="mt-4 space-y-4">
              {investments.length ? investments.map((i) => {
                const duration = i.investment_plans?.duration_days ?? 30;
                const maturity = new Date(i.maturity_date).getTime();
                const start = i.start_date ? new Date(i.start_date).getTime() : maturity - duration * 86400000;
                const progress = Math.min(100, Math.max(0, ((Date.now() - start) / (maturity - start || 1)) * 100));
                return (
                  <div key={i.id} className="rounded-3xl border border-border/70 bg-secondary/30 p-5">
                    <div className="flex items-start justify-between gap-3"><div><div className="font-bold">{i.investment_plans?.name ?? "Investment"}</div><div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Matures {new Date(i.maturity_date).toLocaleDateString()}</div></div><Badge variant="outline" className={statusClass(i.status)}>{i.status}</Badge></div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><span className="text-muted-foreground">Amount</span><div className="font-bold">{formatCurrency(i.amount)}</div></div><div><span className="text-muted-foreground">Accrued profit</span><div className="font-bold text-emerald-600">{formatCurrency(i.accrued_profit)}</div></div></div>
                    <Progress value={progress} className="mt-4" />
                  </div>
                );
              }) : <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-primary" />No investments yet. Choose a plan to begin.</div>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div><div className="text-sm text-muted-foreground">{label}</div><div className={`mt-1 font-display text-2xl font-extrabold ${tone ?? "text-foreground"}`}>{value}</div></div>;
}
function planIcon(name: string, index: number) { const lower = name.toLowerCase(); if (lower.includes("premium")) return Crown; if (lower.includes("silver")) return Shield; if (lower.includes("growth")) return TrendingUp; if (lower.includes("starter")) return Rocket; return [Rocket, TrendingUp, Shield, Crown][index % 4]; }
function planTone(name: string, index: number) { const lower = name.toLowerCase(); if (lower.includes("premium")) return "bg-orange-50 text-orange-600 dark:bg-orange-400/10"; if (lower.includes("silver")) return "bg-purple-50 text-purple-600 dark:bg-purple-400/10"; if (lower.includes("growth")) return "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10"; if (lower.includes("starter")) return "bg-blue-50 text-primary dark:bg-blue-400/10"; return ["bg-blue-50 text-primary dark:bg-blue-400/10", "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10", "bg-purple-50 text-purple-600 dark:bg-purple-400/10", "bg-orange-50 text-orange-600 dark:bg-orange-400/10"][index % 4]; }
function toneText(tone: string) { if (tone.includes("emerald")) return "text-emerald-600"; if (tone.includes("purple")) return "text-purple-600"; if (tone.includes("orange")) return "text-orange-600"; return "text-primary"; }

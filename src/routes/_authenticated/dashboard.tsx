import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db, getKycStatus } from "@/lib/supabase-helpers";
import { formatCurrency, formatPercent, statusClass } from "@/lib/brand";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coins,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileText,
  Gift,
  Headphones,
  HelpCircle,
  Landmark,
  LifeBuoy,
  LockKeyhole,
  MessageCircle,
  MonitorSmartphone,
  Moon,
  Phone,
  Plus,
  RefreshCw,
  Rocket,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  TimerReset,
  TrendingUp,
  UserCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

type Balance = { available: number; invested: number; total_profit: number };
type Profile = { full_name: string | null; phone: string | null; phone_verified: boolean | null; email?: string | null };
type Transaction = { id: string; transaction_id?: string | null; type: string; amount: number; status: string; reference?: string | null; description: string | null; created_at: string };
type Investment = {
  id: string;
  amount: number;
  accrued_profit: number;
  total_expected_profit?: number | null;
  status: string;
  start_date: string;
  maturity_date: string;
  daily_roi_percent?: number | null;
  duration_days?: number | null;
  investment_plans?: { name?: string | null; daily_roi_percent?: number | null; duration_days?: number | null } | null;
};
type Plan = { id: string; name: string; min_amount: number; max_amount: number | null; daily_roi_percent: number; duration_days: number; active: boolean; description?: string | null };
type PaymentMethod = { id: string; name: string; type: string; instructions?: string | null; active: boolean };
type WithdrawalAccount = { id: string; method: string; bank_name: string | null; account_number: string | null; account_name: string | null; status: string; updated_at?: string | null };
type LoginHistory = { id: string; created_at: string; device: string | null; user_agent: string | null; ip: string | null };
type AccountLimits = { kyc_level: string | null; daily_deposit_limit: number | null; daily_withdrawal_limit: number | null; max_active_investments: number | null };
type ReferralRow = { id: string; status: string | null; bonus_amount: number | null; paid_at: string | null };

type ChartPoint = { label: string; value: number; earnings: number };

type MiniCardProps = { title: string; value: string; sub?: string; icon: any; tint?: string; action?: ReactNode };

const emptyCurve = Array.from({ length: 24 }, () => 0);
const emptyBars = Array.from({ length: 24 }, () => 0);

const fallbackPlans: Plan[] = [
  { id: "starter", name: "Starter Plan", min_amount: 100, max_amount: 1000, daily_roi_percent: 1.2, duration_days: 30, active: true, description: "Basic features" },
  { id: "growth", name: "Growth Plan", min_amount: 500, max_amount: 5000, daily_roi_percent: 1.6, duration_days: 90, active: true, description: "Most popular" },
  { id: "premium", name: "Premium Plan", min_amount: 1000, max_amount: 20000, daily_roi_percent: 2.1, duration_days: 180, active: true, description: "All features" },
];

const fallbackMethods: PaymentMethod[] = [
  { id: "bank", name: "Bank Transfer", type: "bank", active: true },
  { id: "card", name: "Card Payment", type: "card", active: true },
  { id: "crypto", name: "Crypto Wallet", type: "crypto", active: true },
  { id: "manual", name: "Manual Review", type: "manual", active: true },
];

const sampleTransactions: Transaction[] = [];

const fmtDate = (date?: string | Date | null, options?: Intl.DateTimeFormatOptions) => {
  if (!date) return "Not available";
  return new Date(date).toLocaleDateString(undefined, options ?? { month: "short", day: "numeric", year: "numeric" });
};
const mask = (visible: boolean, value: string) => (visible ? value : "••••••••");
const daysBetween = (a: Date, b: Date) => Math.ceil((b.getTime() - a.getTime()) / 86400000);
const riskForPlan = (plan: Plan) => Number(plan.daily_roi_percent) >= 2 || Number(plan.duration_days) >= 120 ? "High" : Number(plan.daily_roi_percent) >= 1.5 || Number(plan.duration_days) >= 60 ? "Medium" : "Low";
const returnRange = (plan: Plan) => `${Math.round(Number(plan.daily_roi_percent) * Number(plan.duration_days) * 0.14)}% - ${Math.round(Number(plan.daily_roi_percent) * Number(plan.duration_days) * 0.18)}%`;

function Dashboard() {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("Investor");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [kyc, setKyc] = useState("pending");
  const [bal, setBal] = useState<Balance>({ available: 0, invested: 0, total_profit: 0 });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [plans, setPlans] = useState<Plan[]>(fallbackPlans);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(fallbackMethods);
  const [withdrawalAccount, setWithdrawalAccount] = useState<WithdrawalAccount | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistory | null>(null);
  const [accountLimits, setAccountLimits] = useState<AccountLimits | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [withdrawalStats, setWithdrawalStats] = useState({ pending: 0, completed: 0 });
  const [depositCount, setDepositCount] = useState(0);
  const [depositTotal, setDepositTotal] = useState(0);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [dark, setDark] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountForm, setAccountForm] = useState({ bank_name: "", account_number: "", account_name: "" });

  const load = useCallback(async () => {
    setRefreshing(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setRefreshing(false);
      return;
    }
    const uid = userData.user.id;
    setUserId(uid);

    const [profileRows, balanceRows, kycData, tx, inv, withdrawals, deposits, planRows, methodRows, accountRows, loginRows, limitRows, referralRows] = await Promise.all([
      supabase.from("profiles").select("full_name,phone,phone_verified,email").eq("id", uid).maybeSingle(),
      supabase.from("balances").select("available, invested, total_profit").eq("user_id", uid).maybeSingle(),
      getKycStatus(uid),
      db.from("transactions").select("id,transaction_id,type,amount,status,reference,description,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(60),
      db.from("user_investments").select("id,amount,accrued_profit,total_expected_profit,status,start_date,maturity_date,daily_roi_percent,duration_days,investment_plans(name,daily_roi_percent,duration_days)").eq("user_id", uid).order("created_at", { ascending: false }).limit(12),
      db.from("withdrawal_requests").select("status,amount").eq("user_id", uid),
      db.from("deposit_requests").select("id,amount,status").eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
      db.from("investment_plans").select("id,name,min_amount,max_amount,daily_roi_percent,duration_days,active,description").eq("active", true).order("min_amount"),
      db.from("payment_methods").select("id,name,type,instructions,active").eq("active", true).order("created_at"),
      db.from("withdrawal_accounts").select("id,method,bank_name,account_number,account_name,status,updated_at").eq("user_id", uid).maybeSingle(),
      db.from("login_history").select("id,created_at,device,user_agent,ip").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("account_limits").select("kyc_level,daily_deposit_limit,daily_withdrawal_limit,max_active_investments").eq("user_id", uid).maybeSingle(),
      db.from("referrals").select("id,status,bonus_amount,paid_at").eq("referrer_id", uid).order("created_at", { ascending: false }).limit(100),
    ]);

    const displayName = profileRows.data?.full_name?.split(" ")[0] ?? userData.user.email?.split("@")[0] ?? "Investor";
    setName(displayName);
    setProfile((profileRows.data ?? null) as Profile | null);
    if (balanceRows.data) {
      setBal({ available: Number(balanceRows.data.available), invested: Number(balanceRows.data.invested), total_profit: Number(balanceRows.data.total_profit) });
    }
    setKyc(kycData?.status ?? "pending");
    setTransactions((tx.data ?? []) as Transaction[]);
    setInvestments((inv.data ?? []) as Investment[]);
    setPlans(((planRows.data?.length ? planRows.data : fallbackPlans) ?? fallbackPlans) as Plan[]);
    setPaymentMethods(((methodRows.data?.length ? methodRows.data : fallbackMethods) ?? fallbackMethods) as PaymentMethod[]);
    setWithdrawalAccount((accountRows.data ?? null) as WithdrawalAccount | null);
    if (accountRows.data) setAccountForm({ bank_name: accountRows.data.bank_name ?? "", account_number: accountRows.data.account_number ?? "", account_name: accountRows.data.account_name ?? "" });
    setLoginHistory((loginRows.data ?? null) as LoginHistory | null);
    setAccountLimits((limitRows.data ?? null) as AccountLimits | null);
    setReferrals((referralRows.data ?? []) as ReferralRow[]);

    const wRows = (withdrawals.data ?? []) as { status: string; amount: number }[];
    setWithdrawalStats({
      pending: wRows.filter((w) => ["pending", "processing"].includes(w.status)).reduce((s, w) => s + Number(w.amount), 0),
      completed: wRows.filter((w) => ["approved", "paid"].includes(w.status)).reduce((s, w) => s + Number(w.amount), 0),
    });
    const depositRows = (deposits.data ?? []) as { id: string; amount: number; status: string }[];
    setDepositCount(depositRows.length);
    setDepositTotal(depositRows.filter((d) => d.status === "approved").reduce((s, d) => s + Number(d.amount), 0));
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const savedPrivacy = localStorage.getItem("fivberfinancial.balanceVisible");
    if (savedPrivacy === "false") setBalanceVisible(false);
    const savedTheme = localStorage.getItem("fivberfinancial.theme");
    setDark(savedTheme === "dark" || document.documentElement.classList.contains("dark"));
    load();
  }, [load]);

  const total = bal.available + bal.invested + bal.total_profit;
  const displayBalance = bal;
  const displayTotal = displayBalance.available + displayBalance.invested + displayBalance.total_profit;
  const activeInvestments = investments.filter((i) => i.status === "active");
  const displayTransactions = transactions.length ? transactions : sampleTransactions;
  const dailyProfit = displayTransactions.filter((t) => t.type === "daily_profit").slice(0, 1).reduce((s, t) => s + Number(t.amount), 0);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (transactions.length) {
      const rows = [...transactions].reverse().slice(-24);
      let running = Math.max(total - rows.reduce((s, t) => s + Number(t.amount), 0), 0);
      return rows.map((t) => {
        const amount = Number(t.amount);
        running += ["deposit", "daily_profit", "bonus", "adjustment"].includes(t.type) ? amount : -amount;
        return { label: new Date(t.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: Math.max(running, 0), earnings: t.type === "daily_profit" ? amount : Math.max(12, Math.round(amount * 0.08)) };
      });
    }
    return emptyCurve.map((value, i) => ({ label: `Day ${i + 1}`, value, earnings: emptyBars[i] ?? 0 }));
  }, [transactions, total]);

  const firstActiveInvestment = activeInvestments[0] ?? null;
  const maturity = useMemo(() => {
    const start = firstActiveInvestment ? new Date(firstActiveInvestment.start_date) : new Date();
    const end = firstActiveInvestment ? new Date(firstActiveInvestment.maturity_date) : new Date();
    const totalDays = Math.max(daysBetween(start, end), Number(firstActiveInvestment?.duration_days ?? 1), 1);
    const remaining = Math.max(daysBetween(new Date(), end), 0);
    const complete = Math.min(100, Math.max(0, Math.round(((totalDays - remaining) / totalDays) * 100)));
    return { start, end, totalDays, remaining, complete };
  }, [firstActiveInvestment]);

  const profileItems = [
    { label: "Verify identity", done: kyc === "approved" },
    { label: "Complete profile", done: Boolean(profile?.phone) },
    { label: "Add withdrawal account", done: Boolean(withdrawalAccount) },
  ];
  const onboardingItems = [
    { label: "Verify email", done: true },
    { label: "Complete KYC", done: kyc === "approved" },
    { label: "Add bank account", done: Boolean(withdrawalAccount) },
    { label: "Make first deposit", done: depositCount > 0 },
    { label: "Choose plan", done: investments.length > 0 },
  ];
  const profileCompletion = Math.round((onboardingItems.filter((i) => i.done).length / onboardingItems.length) * 100);
  const kycProgress = kyc === "approved" ? 100 : kyc === "under_review" ? 75 : kyc === "rejected" ? 35 : 25;
  const kycApproved = kyc === "approved";
  const kycLabel = kycApproved ? "Verified" : kyc.replaceAll("_", " ");
  const kycDescription = kycApproved
    ? "Your identity has been approved. Withdrawals are now enabled."
    : "Complete verification to unlock withdrawal access.";
  const kycButtonLabel = kycApproved ? "View details" : "Continue verification";
  const profileReady = profileCompletion >= 80;
  const profileTitle = profileReady ? "Profile secure" : "Almost there";
  const profileDescription = profileReady
    ? "Your account profile is ready for the account flow."
    : "Add your remaining details to improve account readiness.";
  const profileButtonLabel = profileReady ? "Review profile" : "Complete profile";

  const nextAction = useMemo(() => {
    if (kyc !== "approved") return { title: "Complete your KYC", body: "Unlock withdrawals and higher investment limits.", to: "/kyc", label: "Continue verification", icon: Rocket };
    if (!withdrawalAccount) return { title: "Add withdrawal account", body: "Set up withdrawals faster.", to: "/withdraw", label: "Add account", icon: Landmark };
    if (!activeInvestments.length) return { title: "Start your first investment", body: "Choose a plan and begin tracking your returns.", to: "/invest", label: "Start investing", icon: Rocket };
    return { title: "You are all set", body: "Track your maturity date and download a statement.", to: "/transactions", label: "Download statement", icon: Sparkles };
  }, [kyc, withdrawalAccount, activeInvestments.length]);
  const NextActionIcon = nextAction.icon;

  const referralStats = {
    total: referrals.length,
    pending: referrals.filter((r) => !r.paid_at).reduce((s, r) => s + Number(r.bonus_amount ?? 0), 0),
    paid: referrals.filter((r) => Boolean(r.paid_at)).reduce((s, r) => s + Number(r.bonus_amount ?? 0), 0),
  };
  const referralLink = userId && typeof window !== "undefined" ? `${window.location.origin}/auth?ref=${userId.slice(0, 8)}` : "https://fivber.com/ref/FTMOM4324";

  const limitDefaults = {
    kycLevel: accountLimits?.kyc_level ?? (kyc === "approved" ? "KYC Level 2" : "KYC Level 1"),
    depositLimit: Number(accountLimits?.daily_deposit_limit ?? (kyc === "approved" ? 10000 : 1000)),
    withdrawalLimit: Number(accountLimits?.daily_withdrawal_limit ?? (kyc === "approved" ? 5000 : 500)),
    maxActive: Number(accountLimits?.max_active_investments ?? (kyc === "approved" ? 5 : 1)),
  };

  const setPrivacy = (visible: boolean) => {
    setBalanceVisible(visible);
    localStorage.setItem("fivberfinancial.balanceVisible", String(visible));
  };

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("fivberfinancial.theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  };

  const exportCsv = () => {
    const rows = [["Date", "Type", "Amount", "Status", "Reference", "Description"], ...displayTransactions.map((t) => [new Date(t.created_at).toLocaleString(), t.type, String(t.amount), t.status, t.transaction_id ?? t.reference ?? "", t.description ?? ""])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fivberfinancial-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyReferral = async () => {
    await navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied");
  };

  const saveWithdrawalAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!accountForm.bank_name || !accountForm.account_number || !accountForm.account_name) return toast.error("Enter bank name, account number, and account name");
    setAccountSaving(true);
    try {
      const { data, error } = await db.rpc("upsert_withdrawal_account", {
        _method: "Bank Transfer",
        _bank_name: accountForm.bank_name,
        _account_number: accountForm.account_number,
        _account_name: accountForm.account_name,
        _crypto_wallet: null,
        _mobile_money_number: null,
      });
      if (error) throw error;
      setWithdrawalAccount({ id: String(data ?? "account"), method: "Bank Transfer", bank_name: accountForm.bank_name, account_number: accountForm.account_number, account_name: accountForm.account_name, status: "not_verified" });
      toast.success("Withdrawal account saved");
      setAccountOpen(false);
    } catch (error: any) {
      toast.error(error.message ?? "Unable to save withdrawal account");
    } finally {
      setAccountSaving(false);
    }
  };

  const typedTabs = ["All", "Deposits", "Investments", "Profits", "Withdrawals", "Bonuses"];
  const recentActivity = displayTransactions.slice(0, 4);
  const monthlyGrowth = transactions.length ? "+8.24%" : "+0.00%";
  const profitGrowth = transactions.some((t) => t.type === "daily_profit") ? "+14.33%" : "+0.00%";

  return (
    <div className="mx-auto w-full max-w-[1720px] overflow-x-hidden space-y-5 pb-24 md:pb-0">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Welcome back, {name} 👋</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s your portfolio overview and account summary.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl" onClick={load} disabled={refreshing}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh</Button>
          <Link to="/deposit"><Button className="rounded-xl bg-gradient-primary text-primary-foreground"><Plus className="mr-2 h-4 w-4" />Deposit</Button></Link>
          <Link to="/invest"><Button className="rounded-xl bg-gradient-accent text-accent-foreground"><Wallet className="mr-2 h-4 w-4" />Start investing</Button></Link>
          <Link to="/withdraw"><Button variant="outline" className="rounded-xl"><ArrowDownToLine className="mr-2 h-4 w-4" />Withdraw</Button></Link>
          <Button variant="outline" className="rounded-xl" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Statement</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.55fr)]">
        <Card className="relative min-w-0 overflow-hidden rounded-[1.75rem] border-0 bg-gradient-to-br from-[#0c63ff] via-[#0956d6] to-[#063b9c] p-6 text-white shadow-[0_24px_60px_-25px_rgba(12,99,255,.65)]">
          <div className="absolute right-4 top-6 h-28 w-44 opacity-60"><SparkLine data={chartData.slice(-14).map((d) => d.value)} stroke="rgba(255,255,255,.92)" fill="rgba(255,255,255,.14)" /></div>
          <div className="relative flex items-center gap-2 text-sm text-white/85">Total Portfolio Value <button onClick={() => setPrivacy(!balanceVisible)} className="rounded-full p-1 transition hover:bg-white/10" aria-label="Toggle balance visibility">{balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button></div>
          <div className="relative mt-2 font-display text-4xl font-extrabold md:text-5xl">{mask(balanceVisible, formatCurrency(displayTotal))}</div>
          <div className="relative mt-3 flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-400 px-3 py-1 text-xs font-bold text-white"><ArrowUpRight className="h-3.5 w-3.5" />{monthlyGrowth}</span><span className="text-sm text-white/80">vs last 30 days</span></div>
          <div className="relative mt-8 grid grid-cols-2 gap-4 border-t border-white/15 pt-5 sm:grid-cols-4 sm:gap-0">
            <HeroMetric label="Available Bal." value={mask(balanceVisible, formatCurrency(displayBalance.available))} />
            <HeroMetric label="Invested Amou..." value={mask(balanceVisible, formatCurrency(displayBalance.invested))} />
            <HeroMetric label="Total Profit" value={mask(balanceVisible, formatCurrency(displayBalance.total_profit))} sub={profitGrowth} />
            <HeroMetric label="Monthly Gro..." value={monthlyGrowth} />
          </div>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-muted-foreground">Next Action</p><h3 className="mt-2 font-display text-lg font-bold">{nextAction.title}</h3></div><span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"><NextActionIcon className="h-5 w-5" /></span></div>
          <p className="mt-2 text-sm text-muted-foreground">{nextAction.body}</p>
          <Link to={nextAction.to as any}><Button className="mt-5 w-full rounded-xl bg-gradient-primary text-primary-foreground">{nextAction.label}</Button></Link>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">{profileItems.map((i) => <div key={i.label} className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${i.done ? "text-emerald-500" : "text-muted-foreground/30"}`} />{i.label}</div>)}</div>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-lg font-bold leading-tight">KYC Verification</h3>
            {kycApproved && <Badge className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Approved</Badge>}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <RingProgress value={kycProgress} tone="blue" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold capitalize" title={kycLabel}>{kycLabel}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{kycDescription}</p>
            </div>
          </div>
          <Link to="/kyc"><Button variant="outline" className="mt-5 w-full rounded-xl">{kycButtonLabel}</Button></Link>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <h3 className="font-display text-lg font-bold leading-tight">Profile Completion</h3>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <RingProgress value={profileCompletion} tone="green" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" title={profileTitle}>{profileTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{profileDescription}</p>
            </div>
          </div>
          <Link to="/kyc"><Button variant="outline" className="mt-5 w-full rounded-xl">{profileButtonLabel}</Button></Link>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <QuickAction icon={Plus} title="Deposit" body="Add funds instantly" to="/deposit" />
        <QuickAction icon={TrendingUp} title="Start investing" body="Explore investment plans" to="/invest" />
        <QuickAction icon={ArrowDownToLine} title="Withdraw" body="Request your earnings" to="/withdraw" />
        <button onClick={exportCsv} className="min-w-0 rounded-[1.4rem] border border-border/70 bg-card p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-elegant"><span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"><Download className="h-5 w-5" /></span><div className="mt-3 font-semibold">Download statement</div><div className="text-sm text-muted-foreground">Get your account statement</div></button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Wallet Breakdown" action={<Link to="/transactions" className="text-xs font-semibold text-primary">View all wallets</Link>} />
          <div className="mt-4 space-y-2">
            <BalanceRow icon={Wallet} label="Available Balance" value={mask(balanceVisible, formatCurrency(displayBalance.available))} tone="emerald" />
            <BalanceRow icon={CreditCard} label="Invested Balance" value={mask(balanceVisible, formatCurrency(displayBalance.invested))} tone="blue" />
            <BalanceRow icon={AlertCircle} label="Pending Withdrawals" value={mask(balanceVisible, formatCurrency(withdrawalStats.pending))} tone="red" />
            <BalanceRow icon={CircleDollarSign} label="Total Profit" value={mask(balanceVisible, formatCurrency(displayBalance.total_profit))} tone="emerald" />
            <BalanceRow icon={LockKeyhole} label="Locked Bonus" value={mask(balanceVisible, formatCurrency(0))} tone="violet" />
          </div>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Portfolio Growth" subtitle={`${mask(balanceVisible, formatCurrency(displayTotal))}  ↑ ${monthlyGrowth}`} action={<PeriodPills />} />
          <div className="mt-4 h-56"><LineChart data={chartData.map((d) => d.value)} labels={chartData.map((d) => d.label)} /></div>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Daily Earnings" subtitle={`${mask(balanceVisible, formatCurrency(dailyProfit))}  ↑ 1.28%`} action={<PeriodPills />} />
          <div className="mt-4 h-56"><BarChart data={chartData.map((d) => d.earnings || 20)} labels={chartData.map((d) => d.label)} /></div>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">Investment Maturity</h2><Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">In Progress</Badge></div>
          <div className="mt-4 flex items-center gap-3"><span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"><ShieldCheck className="h-5 w-5" /></span><div><p className="font-semibold">{firstActiveInvestment?.investment_plans?.name ?? "No active investment"}</p><p className="text-xs text-muted-foreground">{maturity.remaining} days remaining</p></div></div>
          <div className="mt-5 grid grid-cols-4 gap-2 text-center"><TimeBox value={Math.max(0, maturity.remaining)} label="Days" /><TimeBox value={14} label="Hours" /><TimeBox value={32} label="Mins" /><TimeBox value={45} label="Secs" /></div>
          <Progress value={maturity.complete} className="mt-5 h-2" />
          <div className="mt-4 space-y-2 text-sm"><InfoLine label="Start Date" value={fmtDate(maturity.start)} /><InfoLine label="Maturity Date" value={fmtDate(maturity.end)} /><InfoLine label="Expected Return" value={mask(balanceVisible, formatCurrency(firstActiveInvestment?.total_expected_profit ?? 0))} /><InfoLine label="Current Profit" value={mask(balanceVisible, formatCurrency(firstActiveInvestment?.accrued_profit ?? 0))} positive /></div>
          <Link to="/invest" className="mt-4 block text-center text-sm font-semibold text-primary">View investment details</Link>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Account Limits" />
          <div className="mt-4 space-y-2"><LimitRow label="Daily Deposit" value={`${formatCurrency(limitDefaults.depositLimit)} / $50,000`} /><LimitRow label="Daily Withdrawal" value={`${formatCurrency(limitDefaults.withdrawalLimit)} / $20,000`} good /><LimitRow label="Monthly Deposit" value="$50,000 / $200,000" /><LimitRow label="Monthly Withdrawal" value="$20,000 / $100,000" /></div>
          <Button variant="ghost" className="mt-4 w-full rounded-xl text-primary">Upgrade limits</Button>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Recommended Plans" action={<Link to="/invest" className="text-xs font-semibold text-primary">View all plans →</Link>} />
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">{plans.slice(0, 3).map((p, i) => <PlanCard key={p.id} plan={p} popular={i === 1 || p.name.toLowerCase().includes("growth")} />)}</div>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Referral Rewards" />
          <p className="mt-1 text-sm text-muted-foreground">Earn up to 10% referral bonus</p>
          <div className="mt-4 rounded-2xl border border-border/70 bg-secondary/40 p-3 text-xs break-all">{referralLink}</div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center"><MiniStat label="Total" value={String(referralStats.total || 0)} /><MiniStat label="Pending" value={mask(balanceVisible, formatCurrency(referralStats.pending))} /><MiniStat label="Paid" value={mask(balanceVisible, formatCurrency(referralStats.paid))} /></div>
          <Button onClick={copyReferral} className="mt-4 w-full rounded-xl bg-gradient-primary text-primary-foreground"><Gift className="mr-2 h-4 w-4" />Invite friends</Button>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Withdrawal Account" action={<Badge className={withdrawalAccount?.status === "verified" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}>{withdrawalAccount?.status === "verified" ? "Verified" : "Not added"}</Badge>} />
          <div className="mt-4 flex items-center gap-3"><span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10"><Landmark className="h-5 w-5" /></span><div><p className="font-semibold">{withdrawalAccount?.bank_name ?? "No bank account"}</p><p className="text-xs text-muted-foreground">{withdrawalAccount?.account_number ? `•••• ${withdrawalAccount.account_number.slice(-4)}` : "Set up where funds are paid"}</p></div></div>
          <p className="mt-3 text-xs text-muted-foreground">{withdrawalAccount?.account_name ?? "Add account name, number, and bank for faster withdrawals."}</p>
          <Dialog open={accountOpen} onOpenChange={setAccountOpen}><DialogTrigger asChild><Button variant="outline" className="mt-4 w-full rounded-xl">{withdrawalAccount ? "Manage account" : "Add bank account"}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Withdrawal account</DialogTitle><DialogDescription>Save the destination account you want administrators to review for withdrawals.</DialogDescription></DialogHeader><form onSubmit={saveWithdrawalAccount} className="space-y-4"><div><Label>Bank name</Label><Input value={accountForm.bank_name} onChange={(e) => setAccountForm((p) => ({ ...p, bank_name: e.target.value }))} /></div><div><Label>Account number</Label><Input value={accountForm.account_number} onChange={(e) => setAccountForm((p) => ({ ...p, account_number: e.target.value }))} /></div><div><Label>Account name</Label><Input value={accountForm.account_name} onChange={(e) => setAccountForm((p) => ({ ...p, account_name: e.target.value }))} /></div><DialogFooter><Button type="submit" disabled={accountSaving}>{accountSaving ? "Saving..." : "Save account"}</Button></DialogFooter></form></DialogContent></Dialog>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Deposit Methods" />
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">{paymentMethods.slice(0, 4).map((m) => <MethodCard key={m.id} method={m} />)}</div>
          <Link to="/deposit" className="mt-4 block text-center text-sm font-semibold text-primary">View all methods</Link>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Compare Plans" />
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border/70"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Min. Deposit</th><th className="px-4 py-3">Return</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Risk Level</th><th className="px-4 py-3">Features</th></tr></thead><tbody>{plans.slice(0, 4).map((p) => <tr key={p.id} className="border-t border-border/70"><td className="px-4 py-3 font-semibold">{p.name}</td><td className="px-4 py-3">{formatCurrency(p.min_amount)}</td><td className="px-4 py-3 text-emerald-600">{returnRange(p)}</td><td className="px-4 py-3">{p.duration_days} Days</td><td className="px-4 py-3">{riskForPlan(p)}</td><td className="px-4 py-3">{p.description ?? "All features"}</td></tr>)}</tbody></table></div>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Recent Activity" action={<Link to="/transactions" className="text-xs font-semibold text-primary">View all</Link>} />
          <div className="mt-4 space-y-3">{recentActivity.map((t) => <ActivityRow key={t.id} tx={t} visible={balanceVisible} />)}</div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,0.85fr)]">
        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Recent Transactions" action={<Link to="/transactions" className="text-xs font-semibold text-primary">View all</Link>} />
          <div className="mt-3 flex flex-wrap gap-2">{typedTabs.map((tab, i) => <Badge key={tab} variant={i === 0 ? "default" : "outline"} className="rounded-full">{tab}</Badge>)}</div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border/70"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Reference ID</th><th className="px-4 py-3">Date</th></tr></thead><tbody>{displayTransactions.slice(0, 6).map((t) => <TransactionTableRow key={t.id} tx={t} visible={balanceVisible} />)}</tbody></table></div>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Security Activity" />
          <div className="mt-4 space-y-3"><InfoLine label="Last Login" value={loginHistory ? new Date(loginHistory.created_at).toLocaleString() : "No login record yet"} /><InfoLine label="Device" value={loginHistory?.device ?? "Current browser"} /><InfoLine label="Location" value={loginHistory?.ip ?? "Protected"} /><InfoLine label="Password Changed" value="Not recorded" /><InfoLine label="Two-Factor Auth" value="Optional" /></div>
          <Link to="/kyc" className="mt-4 block text-center text-sm font-semibold text-primary">Manage security</Link>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Support & Help" />
          <div className="mt-4 space-y-3"><SupportAction icon={MessageCircle} title="Live Chat" body="Chat with our support team" /><SupportAction icon={LifeBuoy} title="Support Ticket" body="Create or view tickets" /><SupportAction icon={HelpCircle} title="FAQ" body="Find common answers" /><SupportAction icon={Headphones} title="Contact Us" body="Email or phone assistance" /></div>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft">
          <SectionHeader title="Trust & Security" />
          <div className="mt-4 space-y-3"><TrustItem icon={ShieldCheck} title="SSL Encrypted" body="Bank-level security" /><TrustItem icon={BadgeCheck} title="Wallet" body="Admin-controlled balance" /><TrustItem icon={FileText} title="Audit Trail" body="Admin actions recorded" /></div>
          <Link to="/kyc" className="mt-4 block text-center text-sm font-semibold text-primary">Learn more about security</Link>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <FooterCard icon={Shield} title="Wallet Notice" body="This account uses admin-managed wallet balances." />
        <FooterCard icon={UserCheck} title="Controlled Demo Flow" body="Create users, credit balances, track transactions, and notify users without connecting live payment rails." />
        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft"><div className="flex items-center justify-between"><div><h3 className="font-display font-bold">Onboarding Checklist</h3><p className="text-xs text-muted-foreground">{onboardingItems.filter((i) => i.done).length}/5 completed</p></div><Progress value={profileCompletion} className="h-2 w-32" /></div><div className="mt-4 flex flex-wrap gap-2">{onboardingItems.map((i) => <span key={i.label} className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${i.done ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-border bg-secondary text-muted-foreground"}`}><CheckCircle2 className="h-4 w-4" /></span>)}</div></Card>
        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft"><h3 className="font-display font-bold">Appearance</h3><p className="text-xs text-muted-foreground">Choose your preferred theme</p><div className="mt-4 grid grid-cols-2 gap-2"><Button variant={!dark ? "default" : "outline"} onClick={() => !dark || toggleDark()} className="rounded-xl"><Sun className="mr-2 h-4 w-4" />Light</Button><Button variant={dark ? "default" : "outline"} onClick={() => dark || toggleDark()} className="rounded-xl"><Moon className="mr-2 h-4 w-4" />Dark</Button></div></Card>
      </div>
    </div>
  );
}

function HeroMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 border-l border-white/15 px-3 first:border-l-0 first:pl-0 last:pr-0 sm:px-5">
      <p className="truncate text-[10px] leading-tight text-white/75 sm:text-xs">{label}</p>
      <p className="mt-1 truncate font-display text-[17px] font-extrabold leading-none tracking-tight sm:text-xl md:text-2xl">{value}</p>
      {sub && <p className="mt-1 truncate text-[10px] font-semibold text-emerald-300 sm:text-xs">↑ {sub}</p>}
    </div>
  );
}
function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) { return <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-display text-lg font-bold leading-tight">{title}</h2>{subtitle && <p className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</p>}</div>{action && <div className="shrink-0 text-right">{action}</div>}</div>; }
function PeriodPills() { return <div className="hidden gap-1 md:flex">{["7D", "30D", "90D"].map((p) => <Badge key={p} variant="outline" className={`rounded-full ${p === "30D" ? "border-primary bg-primary/5 text-primary" : ""}`}>{p}</Badge>)}</div>; }
function QuickAction({ icon: Icon, title, body, to }: { icon: any; title: string; body: string; to: string }) { return <Link to={to as any} className="min-w-0 rounded-[1.4rem] border border-border/70 bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-elegant"><span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"><Icon className="h-5 w-5" /></span><div className="mt-3 font-semibold">{title}</div><div className="text-sm text-muted-foreground">{body}</div></Link>; }
function BalanceRow({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: string }) { return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl bg-secondary/50 px-3 py-2"><span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"><span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${toneClass(tone)}`}><Icon className="h-3.5 w-3.5" /></span><span className="min-w-0 truncate" title={label}>{label}</span></span><span className="max-w-[120px] truncate text-right text-sm font-bold sm:max-w-[150px]" title={value}>{value}</span></div>; }
function LimitRow({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl bg-secondary/50 px-3 py-2 text-sm"><span className="truncate text-muted-foreground" title={label}>{label}</span><span className={`max-w-[150px] truncate text-right text-xs font-semibold sm:text-sm ${good ? "text-emerald-600" : ""}`} title={value}>{value}</span></div>; }
function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-secondary/50 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>; }
function TimeBox({ value, label }: { value: number; label: string }) { return <div className="rounded-2xl border border-border/70 bg-secondary/40 p-2"><div className="font-display text-xl font-bold">{String(value).padStart(2, "0")}</div><div className="text-[10px] text-muted-foreground">{label}</div></div>; }
function InfoLine({ label, value, positive }: { label: string; value: string; positive?: boolean }) { return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm"><span className="truncate text-muted-foreground" title={label}>{label}</span><span className={`max-w-[160px] truncate text-right font-semibold ${positive ? "text-emerald-600" : ""}`} title={value}>{value}</span></div>; }
function PlanCard({ plan, popular }: { plan: Plan; popular?: boolean }) { return <div className="min-w-0 rounded-2xl border border-border/70 bg-secondary/30 p-4"><div className="flex items-center justify-between gap-2"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10"><TrendingUp className="h-4 w-4" /></span>{popular && <Badge className="max-w-[82px] truncate rounded-full bg-primary text-primary-foreground">Popular</Badge>}</div><h3 className="mt-3 truncate font-semibold" title={plan.name}>{plan.name}</h3><div className="mt-2 space-y-1 text-xs text-muted-foreground"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><span className="min-w-0 truncate">Min.</span><b className="max-w-[92px] truncate text-right text-foreground" title={formatCurrency(plan.min_amount)}>{formatCurrency(plan.min_amount)}</b></div><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><span className="min-w-0 truncate">Return</span><b className="max-w-[92px] truncate text-right text-foreground" title={returnRange(plan)}>{returnRange(plan)}</b></div></div><Link to="/invest"><Button variant="outline" className="mt-4 w-full rounded-xl">Invest now</Button></Link></div>; }
function MethodCard({ method }: { method: PaymentMethod }) { const Icon = methodIcon(method.type, method.name); return <div className="min-w-0 flex items-center gap-3 rounded-2xl border border-border/70 bg-secondary/30 p-3"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10"><Icon className="h-5 w-5" /></span><div className="min-w-0"><div className="truncate text-sm font-semibold" title={method.name}>{method.name}</div><div className="truncate text-xs text-muted-foreground">{method.type.toLowerCase().includes("manual") ? "Manual review" : "Instant deposit"}</div></div></div>; }
function methodIcon(type: string, name: string) { const all = `${type} ${name}`.toLowerCase(); if (all.includes("card")) return CreditCard; if (all.includes("crypto")) return Smartphone; if (all.includes("mobile")) return Phone; if (all.includes("manual")) return UserCheck; return Landmark; }
function ActivityRow({ tx, visible }: { tx: Transaction; visible: boolean }) { const credit = ["deposit", "daily_profit", "bonus", "adjustment"].includes(tx.type); return <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${credit ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10" : "bg-blue-50 text-blue-600 dark:bg-blue-400/10"}`}>{credit ? <ArrowUpRight className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}</span><div><div className="text-sm font-semibold capitalize">{tx.description ?? tx.type.replaceAll("_", " ")}</div><div className="text-xs text-muted-foreground">{fmtDate(tx.created_at, { month: "short", day: "numeric" })}</div></div></div><div className={`text-sm font-bold ${credit ? "text-emerald-600" : "text-red-500"}`}>{credit ? "+" : "-"}{mask(visible, formatCurrency(tx.amount))}</div></div>; }
function TransactionTableRow({ tx, visible }: { tx: Transaction; visible: boolean }) { const credit = ["deposit", "daily_profit", "bonus", "adjustment"].includes(tx.type); return <tr className="border-t border-border/70"><td className="px-4 py-3 capitalize">{tx.type.replaceAll("_", " ")}</td><td className="px-4 py-3">{tx.description ?? tx.type}</td><td className={`px-4 py-3 font-semibold ${credit ? "text-emerald-600" : "text-red-500"}`}>{credit ? "+" : "-"}{mask(visible, formatCurrency(tx.amount))}</td><td className="px-4 py-3"><Badge variant="outline" className={statusClass(tx.status)}>{tx.status}</Badge></td><td className="px-4 py-3 text-muted-foreground">{tx.transaction_id ?? tx.reference ?? "—"}</td><td className="px-4 py-3 text-muted-foreground">{fmtDate(tx.created_at, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>; }
function SupportAction({ icon: Icon, title, body }: { icon: any; title: string; body: string }) { return <button className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-secondary/30 p-3 text-left transition hover:bg-secondary"><span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10"><Icon className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{body}</span></span></button>; }
function TrustItem({ icon: Icon, title, body }: { icon: any; title: string; body: string }) { return <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-secondary/40 p-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10"><Icon className="h-5 w-5" /></span><div className="min-w-0"><div className="truncate text-sm font-semibold">{title}</div><div className="text-xs text-muted-foreground">{body}</div></div></div>; }
function FooterCard({ icon: Icon, title, body }: { icon: any; title: string; body: string }) { return <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-5 shadow-soft"><div className="flex gap-4"><span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10"><Icon className="h-7 w-7" /></span><div><h3 className="font-display font-bold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{body}</p></div></div></Card>; }
function RingProgress({ value, tone }: { value: number; tone: "blue" | "green" }) { const size = 58; const stroke = 7; const radius = (size - stroke) / 2; const c = 2 * Math.PI * radius; const offset = c - (value / 100) * c; return <div className="relative h-[58px] w-[58px] shrink-0"><svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-secondary" /><circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} className={tone === "blue" ? "text-blue-600" : "text-emerald-500"} /></svg><div className="absolute inset-0 grid place-items-center text-xs font-bold">{value}%</div></div>; }
function toneClass(tone: string) { if (tone === "emerald") return "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10"; if (tone === "red") return "bg-red-50 text-red-600 dark:bg-red-400/10"; if (tone === "violet") return "bg-violet-50 text-violet-600 dark:bg-violet-400/10"; return "bg-blue-50 text-blue-600 dark:bg-blue-400/10"; }

function SparkLine({ data, stroke = "#2563eb", fill = "rgba(37,99,235,.12)" }: { data: number[]; stroke?: string; fill?: string }) {
  const { line, area } = useSvgPath(data, 170, 92, 8);
  return <svg viewBox="0 0 170 92" className="h-full w-full" preserveAspectRatio="none"><path d={area} fill={fill} /><path d={line} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function LineChart({ data, labels }: { data: number[]; labels: string[] }) {
  const { line, area, points } = useSvgPath(data, 720, 220, 18);
  const last = points.at(-1);
  return <div className="relative h-full w-full"><svg viewBox="0 0 720 220" className="h-full w-full" preserveAspectRatio="none"><defs><linearGradient id="dashboardLineFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" /><stop offset="100%" stopColor="#2563eb" stopOpacity="0" /></linearGradient></defs>{[0, 1, 2, 3].map((n) => <line key={n} x1="0" x2="720" y1={30 + n * 45} y2={30 + n * 45} stroke="currentColor" className="text-border" strokeWidth="1" />)}<path d={area} fill="url(#dashboardLineFill)" /><path d={line} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{last && <circle cx={last.x} cy={last.y} r="5" fill="#2563eb" stroke="white" strokeWidth="3" />}</svg><div className="pointer-events-none absolute inset-x-2 bottom-0 flex justify-between text-[10px] text-muted-foreground"><span>{labels[0] ?? "Apr 21"}</span><span>{labels[Math.floor(labels.length / 2)] ?? "May 05"}</span><span>{labels.at(-1) ?? "May 19"}</span></div></div>;
}
function BarChart({ data, labels }: { data: number[]; labels: string[] }) {
  const max = Math.max(...data, 1);
  return <div className="relative flex h-full items-end gap-1.5 px-1 pb-6 pt-4">{data.slice(-24).map((v, i) => <div key={`${v}-${i}`} title={`${labels[i] ?? "Day"}: ${formatCurrency(v)}`} className="flex-1 rounded-t-lg bg-gradient-to-t from-emerald-500 to-emerald-300 transition hover:opacity-80" style={{ height: `${Math.max(12, (v / max) * 88)}%` }} />)}<div className="absolute inset-x-2 bottom-0 flex justify-between text-[10px] text-muted-foreground"><span>{labels[0] ?? "Apr 21"}</span><span>{labels[Math.floor(labels.length / 2)] ?? "May 05"}</span><span>{labels.at(-1) ?? "May 19"}</span></div></div>;
}
function useSvgPath(data: number[], width: number, height: number, pad: number) {
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 1);
  const range = max - min || 1;
  const step = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  const points = data.map((v, i) => ({ x: pad + i * step, y: pad + (height - pad * 2) - ((v - min) / range) * (height - pad * 2) }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = points.length ? `${line} L${points.at(-1)?.x.toFixed(2)},${height - pad} L${points[0].x.toFixed(2)},${height - pad} Z` : "";
  return { points, line, area };
}

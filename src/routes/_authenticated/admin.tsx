import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { db, getIsAdmin } from "@/lib/supabase-helpers";
import { formatCurrency, formatPercent, statusClass } from "@/lib/brand";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  Eye,
  FileText,
  FileWarning,
  Filter,
  Inbox,
  Landmark,
  Layers,
  Loader2,
  Megaphone,
  MoreVertical,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user || !(await getIsAdmin(data.user.id))) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

type Profile = { id: string; full_name: string | null; email: string | null; phone: string | null; status: string; created_at: string };
type Balance = { user_id: string; available: number; invested: number; total_profit: number };
type Kyc = { id: string; user_id: string; status: string; proof_of_address: string | null; document_urls: Record<string, string> | null; admin_notes: string | null; submitted_at: string; user_full_name?: string | null; user_email?: string | null; profiles?: { full_name?: string | null; email?: string | null } | null };
type Deposit = { id: string; user_id: string; amount: number; status: string; notes: string | null; proof_url: string | null; created_at: string; reviewed_at?: string | null; admin_notes?: string | null; user_full_name?: string | null; user_email?: string | null; payment_method_name?: string | null; profiles?: { full_name?: string | null; email?: string | null } | null; payment_methods?: { name?: string | null } | null };
type Withdrawal = { id: string; user_id: string; amount: number; method: string; status: string; destination_account: Record<string, any> | null; admin_notes: string | null; created_at: string; processed_at?: string | null; user_full_name?: string | null; user_email?: string | null; intensive_payment_amount?: number | null; loan_interest_amount?: number | null; total_obligation?: number | null; profiles?: { full_name?: string | null; email?: string | null } | null };
type Plan = { id: string; name: string; min_amount: number; max_amount: number | null; daily_roi_percent: number; duration_days: number; active: boolean; description: string | null };
type Tx = { id: string; user_id: string; type: string; amount: number; status: string; reference: string | null; description: string | null; created_at: string; profiles?: { full_name?: string | null; email?: string | null } | null };
type Audit = { id: string; admin_id: string | null; action: string; entity_type: string | null; entity_id: string | null; metadata: Record<string, any> | null; created_at: string; profiles?: { full_name?: string | null; email?: string | null } | null };

type TabValue = "users" | "kyc" | "deposits" | "withdrawals" | "plans" | "cms";
type ActionModal = "create-user" | "credit" | "investment" | "kyc" | "deposits" | "withdrawals" | "plans" | "announcement" | null;

function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>("users");
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [kyc, setKyc] = useState<Kyc[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [auditLogs, setAuditLogs] = useState<Audit[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [newUser, setNewUser] = useState({ fullName: "", email: "", password: "" });
  const [newPlan, setNewPlan] = useState({ name: "", min: "", max: "", roi: "", duration: "", description: "" });
  const [newInvestment, setNewInvestment] = useState({ userId: "", planId: "", amount: "", description: "Admin-created investment" });
  const [announcement, setAnnouncement] = useState({ title: "", body: "", audience: "general", userId: "" });
  const [adjustment, setAdjustment] = useState({ userId: "", amount: "", direction: "credit", type: "adjustment", description: "Manual wallet credit" });

  const balanceMap = useMemo(() => new Map(balances.map((b) => [b.user_id, b])), [balances]);
  const latestKycMap = useMemo(() => {
    const map = new Map<string, Kyc>();
    kyc.forEach((row) => {
      if (!map.has(row.user_id)) map.set(row.user_id, row);
    });
    return map;
  }, [kyc]);

  const visibleProfiles = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => `${p.full_name ?? ""} ${p.email ?? ""} ${p.phone ?? ""}`.toLowerCase().includes(q));
  }, [profiles, userQuery]);

  const totals = useMemo(() => {
    const pendingKyc = kyc.filter((r) => ["pending", "under_review"].includes(r.status)).length;
    const pendingDeposits = deposits.filter((r) => r.status === "pending");
    const pendingWithdrawals = withdrawals.filter((r) => ["pending", "processing"].includes(r.status));
    const walletValue = balances.reduce((s, b) => s + Number(b.available) + Number(b.invested) + Number(b.total_profit), 0);
    const totalCredits = transactions.filter((t) => ["deposit", "daily_profit", "bonus", "adjustment"].includes(t.type)).reduce((s, t) => s + Number(t.amount), 0);
    const totalDebits = transactions.filter((t) => ["withdrawal", "investment", "fee"].includes(t.type)).reduce((s, t) => s + Number(t.amount), 0);
    const failedTransactions = deposits.filter((r) => r.status === "rejected").length + withdrawals.filter((r) => r.status === "rejected").length;
    return {
      pendingKyc: pendingKyc,
      pendingDepositCount: pendingDeposits.length,
      pendingDepositAmount: pendingDeposits.reduce((s, r) => s + Number(r.amount), 0),
      pendingWithdrawalCount: pendingWithdrawals.length,
      pendingWithdrawalAmount: pendingWithdrawals.reduce((s, r) => s + Number(r.amount), 0),
      walletValue,
      totalCredits,
      totalDebits,
      failedTransactions,
      activePlans: plans.filter((p) => p.active).length,
    };
  }, [balances, deposits, kyc, plans, transactions, withdrawals]);

  const load = async () => {
    setLoading(true);
    const [profileRows, balanceRows, kycRows, depositRows, withdrawalRows, planRows, txRows, auditRows] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email,phone,status,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("balances").select("user_id,available,invested,total_profit"),
      db.rpc("admin_list_kyc_submissions"),
      db.rpc("admin_list_deposit_requests"),
      db.rpc("admin_list_withdrawal_requests"),
      db.from("investment_plans").select("id,name,min_amount,max_amount,daily_roi_percent,duration_days,active,description").order("min_amount"),
      db.from("transactions").select("id,user_id,type,amount,status,reference,description,created_at,profiles(full_name,email)").order("created_at", { ascending: false }).limit(200),
      db.from("admin_audit_logs").select("id,admin_id,action,entity_type,entity_id,metadata,created_at,profiles(full_name,email)").order("created_at", { ascending: false }).limit(100),
    ]);
    let kycData = (kycRows.data ?? []) as any[];
    if (kycRows.error) {
      const fallback = await db.from("kyc_submissions").select("id,user_id,status,proof_of_address,document_urls,admin_notes,submitted_at,reviewed_at,profiles(full_name,email)").order("submitted_at", { ascending: false }).limit(200);
      kycData = (fallback.data ?? []) as any[];
      if (fallback.error) toast.error(`KYC review could not load: ${fallback.error.message}`);
    }

    let depositData = (depositRows.data ?? []) as any[];
    if (depositRows.error) {
      const fallback = await db.from("deposit_requests").select("id,user_id,amount,status,notes,proof_url,created_at,reviewed_at,admin_notes,profiles(full_name,email),payment_methods(name)").order("created_at", { ascending: false }).limit(200);
      depositData = (fallback.data ?? []) as any[];
      if (fallback.error) toast.error(`Deposit review could not load: ${fallback.error.message}`);
    }

    let withdrawalData = (withdrawalRows.data ?? []) as any[];
    if (withdrawalRows.error) {
      const fallback = await db.from("withdrawal_requests").select("id,user_id,amount,method,status,destination_account,admin_notes,created_at,processed_at,profiles(full_name,email)").order("created_at", { ascending: false }).limit(200);
      withdrawalData = (fallback.data ?? []) as any[];
      if (fallback.error) toast.error(`Withdrawal review could not load: ${fallback.error.message}`);
    }

    setProfiles((profileRows.data ?? []) as Profile[]);
    setBalances((balanceRows.data ?? []) as Balance[]);
    setKyc(kycData.map((row) => ({
      ...row,
      profiles: row.profiles ?? { full_name: row.user_full_name ?? null, email: row.user_email ?? null },
    })) as Kyc[]);
    setDeposits(depositData.map((row) => ({
      ...row,
      profiles: row.profiles ?? { full_name: row.user_full_name ?? null, email: row.user_email ?? null },
      payment_methods: row.payment_methods ?? { name: row.payment_method_name ?? null },
    })) as Deposit[]);
    setWithdrawals(withdrawalData.map((row) => ({
      ...row,
      profiles: row.profiles ?? { full_name: row.user_full_name ?? null, email: row.user_email ?? null },
      intensive_payment_amount: row.intensive_payment_amount ?? row.loan_interest_amount ?? Number(row.destination_account?.intensive_payment_amount ?? row.destination_account?.loan_interest_amount ?? Number(row.amount ?? 0) * 0.3),
      total_obligation: row.total_obligation ?? Number(row.destination_account?.total_intensive_obligation ?? row.destination_account?.total_loan_obligation ?? Number(row.amount ?? 0) * 1.3),
    })) as Withdrawal[]);
    setPlans((planRows.data ?? []) as Plan[]);
    setTransactions((txRows.data ?? []) as Tx[]);
    setAuditLogs((auditRows.data ?? []) as Audit[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setActionLoading(key);
    try {
      await fn();
      await load();
    } catch (error: any) {
      toast.error(error.message ?? "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!newUser.email || !newUser.password) return toast.error("Email and temporary password are required");
    setActionLoading("create-user");
    try {
      const { error } = await supabase.functions.invoke("admin-create-user", { body: { email: newUser.email, password: newUser.password, full_name: newUser.fullName } });
      if (error) throw error;
      toast.success("User account created. The user will see a welcome notification after login.");
      setNewUser({ fullName: "", email: "", password: "" });
      setActionModal(null);
      await load();
    } catch (error: any) {
      toast.error(error.message ?? "Unable to create user. Deploy the admin-create-user Supabase function first.");
    } finally {
      setActionLoading(null);
    }
  };

  const savePlan = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      name: newPlan.name,
      min_amount: Number(newPlan.min),
      max_amount: newPlan.max ? Number(newPlan.max) : null,
      daily_roi_percent: Number(newPlan.roi),
      duration_days: Number(newPlan.duration),
      description: newPlan.description || null,
      active: true,
    };
    if (!payload.name || payload.min_amount <= 0 || payload.daily_roi_percent <= 0 || payload.duration_days <= 0) return toast.error("Complete the plan fields correctly");
    await runAction("save-plan", async () => {
      const { error } = await db.from("investment_plans").insert(payload);
      if (error) throw error;
      toast.success("Investment plan created");
      setNewPlan({ name: "", min: "", max: "", roi: "", duration: "", description: "" });
      setActionModal(null);
    });
  };

  const adjustBalance = async (event: FormEvent) => {
    event.preventDefault();
    if (!adjustment.userId || !adjustment.amount) return toast.error("Select a user and amount");
    const selectedUser = profiles.find((p) => p.id === adjustment.userId);
    await runAction("adjust-balance", async () => {
      const { error } = await db.rpc("admin_adjust_balance", {
        _user_id: adjustment.userId,
        _amount: Number(adjustment.amount),
        _direction: adjustment.direction,
        _transaction_type: adjustment.type,
        _description: adjustment.description || (adjustment.direction === "credit" ? "Manual wallet credit" : "Manual wallet debit"),
      });
      if (error) throw error;
      toast.success(`${selectedUser?.full_name ?? selectedUser?.email ?? "User"} balance updated and notification sent`);
      setAdjustment({ userId: "", amount: "", direction: "credit", type: "adjustment", description: "Manual wallet credit" });
      setActionModal(null);
    });
  };

  const createUserInvestment = async (event: FormEvent) => {
    event.preventDefault();
    if (!newInvestment.userId || !newInvestment.planId || !newInvestment.amount) return toast.error("Select a user, plan, and amount");
    const selectedUser = profiles.find((p) => p.id === newInvestment.userId);
    const selectedPlan = plans.find((p) => p.id === newInvestment.planId);
    await runAction("create-investment", async () => {
      const { error } = await db.rpc("admin_create_user_investment", {
        _user_id: newInvestment.userId,
        _plan_id: newInvestment.planId,
        _amount: Number(newInvestment.amount),
        _description: newInvestment.description || "Admin-created investment",
      });
      if (error) throw error;
      toast.success(`${selectedPlan?.name ?? "Investment"} created for ${selectedUser?.full_name ?? selectedUser?.email ?? "user"}`);
      setNewInvestment({ userId: "", planId: "", amount: "", description: "Admin-created investment" });
      setActionModal(null);
    });
  };

  const sendAnnouncement = async (event: FormEvent) => {
    event.preventDefault();
    if (!announcement.title.trim()) return toast.error("Announcement title is required");
    if (announcement.audience === "individual" && !announcement.userId) return toast.error("Select the user who should receive this announcement");
    await runAction("announcement", async () => {
      const { error } = await db.rpc("admin_send_announcement", {
        _title: announcement.title,
        _body: announcement.body || null,
        _audience: announcement.audience,
        _target_user_id: announcement.audience === "individual" ? announcement.userId : null,
      });
      if (error) throw error;
      toast.success(announcement.audience === "individual" ? "Announcement sent to selected user" : "Announcement sent to all users");
      setAnnouncement({ title: "", body: "", audience: "general", userId: "" });
      setActionModal(null);
    });
  };

  const openKycDocument = async (path?: string | null) => {
    if (!path) return toast.error("Document path is not available");
    const { data, error } = await supabase.storage.from("kyc-documents").createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? "Unable to open KYC document");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const openDepositProof = async (path?: string | null) => {
    if (!path) return toast.error("No proof of payment was uploaded for this deposit");
    const { data, error } = await supabase.storage.from("deposit-proofs").createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? "Unable to open deposit proof");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const approveDeposit = (deposit: Deposit, approve: boolean) => runAction(`${approve ? "deposit-approve" : "deposit-reject"}-${deposit.id}`, async () => {
    const { error } = await db.rpc("approve_deposit", {
      _deposit_id: deposit.id,
      _approve: approve,
      _admin_notes: approve ? "Approved by admin." : "Rejected by admin.",
    });
    if (error) throw error;
    toast.success(approve ? "Deposit approved and user credited" : "Deposit rejected");
  });

  const updateWithdrawal = (withdrawal: Withdrawal, status: string) => runAction(`withdraw-${withdrawal.id}-${status}`, async () => {
    const { error } = await db.rpc("admin_update_withdrawal", {
      _withdrawal_id: withdrawal.id,
      _status: status,
      _admin_notes: `Marked ${status} by admin.`,
    });
    if (error) throw error;
    toast.success(`Withdrawal marked ${status}`);
  });

  const renderKycDocuments = (row: Kyc, compact = false) => {
    const docs = Object.entries(row.document_urls ?? {}).filter(([, path]) => Boolean(path));
    if (!docs.length) return <span className="text-xs text-muted-foreground">No documents</span>;
    return (
      <div className="flex max-w-md flex-wrap gap-2">
        {docs.map(([key, path]) => (
          <Button key={`${row.id}-${key}`} type="button" size="sm" variant="outline" className="h-8 rounded-xl text-xs" onClick={() => openKycDocument(path)}>
            <FileText className="mr-1 h-3.5 w-3.5" />{compact ? shortDocLabel(key) : docLabel(key)}
          </Button>
        ))}
      </div>
    );
  };

  const kycUserName = (row: Kyc) => row.profiles?.full_name ?? row.user_full_name ?? "User";
  const kycUserEmail = (row: Kyc) => row.profiles?.email ?? row.user_email ?? "";

  const depositReviewRows = deposits.map((d) => [
    <div key={`${d.id}-user`}><div className="font-medium">{d.profiles?.full_name ?? d.user_full_name ?? "User"}</div><div className="text-xs text-muted-foreground">{d.profiles?.email ?? d.user_email ?? ""}</div></div>,
    <span key={`${d.id}-amount`} className="font-semibold">{formatCurrency(d.amount)}</span>,
    <span key={`${d.id}-method`} className="text-muted-foreground">{d.payment_methods?.name ?? d.payment_method_name ?? "Manual method"}</span>,
    <Button key={`${d.id}-proof`} type="button" size="sm" variant="outline" className="h-8 rounded-xl text-xs" onClick={() => openDepositProof(d.proof_url)} disabled={!d.proof_url}><FileText className="mr-1 h-3.5 w-3.5" />{d.proof_url ? "Open proof" : "No proof"}</Button>,
    <span key={`${d.id}-date`} className="whitespace-nowrap text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</span>,
    <Badge key={`${d.id}-badge`} variant="outline" className={statusClass(d.status)}>{d.status}</Badge>,
    <div key={`${d.id}-actions`} className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={d.status !== "pending" || actionLoading === `deposit-approve-${d.id}`} onClick={() => approveDeposit(d, true)}>{actionLoading === `deposit-approve-${d.id}` && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Approve</Button><Button size="sm" variant="outline" disabled={d.status !== "pending" || actionLoading === `deposit-reject-${d.id}`} onClick={() => approveDeposit(d, false)}>Reject</Button></div>,
  ]);

  const withdrawalReviewRows = withdrawals.map((w) => [
    <div key={`${w.id}-user`}><div className="font-medium">{w.profiles?.full_name ?? w.user_full_name ?? "User"}</div><div className="text-xs text-muted-foreground">{w.profiles?.email ?? w.user_email ?? ""}</div></div>,
    <span key={`${w.id}-amount`} className="font-semibold">{formatCurrency(w.amount)}</span>,
    <span key={`${w.id}-interest`} className="font-semibold text-emerald-600">{formatCurrency(Number(w.intensive_payment_amount ?? w.loan_interest_amount ?? w.destination_account?.intensive_payment_amount ?? w.destination_account?.loan_interest_amount ?? w.amount * 0.3))}</span>,
    <span key={`${w.id}-total`} className="font-semibold text-primary">{formatCurrency(Number(w.total_obligation ?? w.destination_account?.total_intensive_obligation ?? w.destination_account?.total_loan_obligation ?? w.amount * 1.3))}</span>,
    <span key={`${w.id}-method`} className="text-muted-foreground">{w.method}</span>,
    <div key={`${w.id}-dest`} className="max-w-xs text-muted-foreground">
      <div className="line-clamp-2">{w.destination_account?.details ?? w.destination_account?.account ?? w.destination_account?.bank_name ?? "—"}</div>
      {(w.destination_account?.intensive_payment_wallet ?? w.destination_account?.loan_payment_wallet) && (
        <div className="mt-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
          Payment wallet: {w.destination_account.intensive_payment_wallet ?? w.destination_account.loan_payment_wallet}
        </div>
      )}
    </div>,
    <Badge key={`${w.id}-badge`} variant="outline" className={statusClass(w.status)}>{w.status}</Badge>,
    <WithdrawalActionButtons key={`${w.id}-actions`} withdrawal={w} loadingKey={actionLoading} onUpdate={updateWithdrawal} />,
  ]);

  const exportReport = () => {
    const rows = [
      ["Section", "Name/Email", "Type", "Amount", "Status", "Date"],
      ...profiles.map((p) => ["User", p.email ?? p.full_name ?? p.id, "profile", "", p.status, new Date(p.created_at).toLocaleString()]),
      ...transactions.map((t) => ["Transaction", t.profiles?.email ?? t.user_id, t.type, String(t.amount), t.status, new Date(t.created_at).toLocaleString()]),
      ...auditLogs.map((a) => ["Audit", a.profiles?.email ?? a.admin_id ?? "Admin", a.action, String(a.metadata?.amount ?? ""), a.entity_type ?? "", new Date(a.created_at).toLocaleString()]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fivberfinancial-admin-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openReviewCenter = () => {
    if (totals.pendingKyc) setActiveTab("kyc");
    else if (totals.pendingDepositCount) setActiveTab("deposits");
    else if (totals.pendingWithdrawalCount) setActiveTab("withdrawals");
    else setActiveTab("users");
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto w-full max-w-[1600px] overflow-x-hidden space-y-7">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Admin control panel</h1>
          <p className="mt-2 text-base text-muted-foreground">Manage users, manual credits, KYC, withdrawals, plans, announcements, and audit logs.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Badge variant="outline" className="rounded-xl border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-700">Admin mode active</Badge>
          <Button variant="outline" className="rounded-xl"><CalendarDays className="mr-2 h-4 w-4" />Live database</Button>
          <Button onClick={exportReport} className="rounded-xl bg-gradient-primary text-primary-foreground"><Download className="mr-2 h-4 w-4" />Export Report</Button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric icon={Users} title="Total Users" value={profiles.length.toLocaleString()} change="live" data={profiles.map((_, i) => i + 1).slice(-10)} />
        <AdminMetric icon={Wallet} title="Manual Credits" value={formatCurrency(totals.totalCredits)} change="admin record" data={sparkFrom(transactions.filter((t) => ["deposit", "daily_profit", "bonus", "adjustment"].includes(t.type)).map((t) => Number(t.amount)))} tone="emerald" />
        <AdminMetric icon={Landmark} title="Manual Debits" value={formatCurrency(totals.totalDebits)} change="admin record" data={sparkFrom(transactions.filter((t) => ["withdrawal", "investment", "fee"].includes(t.type)).map((t) => Number(t.amount)))} tone="violet" />
        <AdminMetric icon={Layers} title="Total Wallet Value" value={formatCurrency(totals.walletValue)} change="live" data={sparkFrom(balances.map((b) => Number(b.available) + Number(b.invested) + Number(b.total_profit)))} tone="orange" />
        <Card className="min-w-0 rounded-[1.5rem] border-border/70 bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between"><span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-primary dark:bg-blue-400/10"><Database className="h-6 w-6" /></span><MiniBars count={totals.activePlans} /></div>
          <div className="mt-3 text-sm text-muted-foreground">Active Plans</div>
          <div className="font-display text-3xl font-extrabold">{totals.activePlans}</div>
          <p className="mt-3 text-sm text-muted-foreground">Investment plans</p>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <QuickAdminAction icon={Plus} label="Create User" onClick={() => { setActiveTab("users"); setActionModal("create-user"); }} />
        <QuickAdminAction icon={TrendingUp} label="Create Investment" tone="emerald" onClick={() => { setActiveTab("users"); setActionModal("investment"); }} />
        <QuickAdminAction icon={ShieldCheck} label="Review KYC" badge={totals.pendingKyc} tone="emerald" onClick={() => { setActiveTab("kyc"); setActionModal("kyc"); }} />
        <QuickAdminAction icon={Wallet} label="Review Deposits" badge={totals.pendingDepositCount} tone="violet" onClick={() => { setActiveTab("deposits"); setActionModal("deposits"); }} />
        <QuickAdminAction icon={Download} label="Review Withdrawals" badge={totals.pendingWithdrawalCount} tone="orange" onClick={() => { setActiveTab("withdrawals"); setActionModal("withdrawals"); }} />
        <QuickAdminAction icon={BadgeDollarSign} label="Create Plan" onClick={() => { setActiveTab("plans"); setActionModal("plans"); }} />
        <QuickAdminAction icon={Send} label="Send Announcement" onClick={() => { setActiveTab("cms"); setActionModal("announcement"); }} />
      </div>

      <div className="grid gap-7 xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl font-bold">Admin Analytics <span className="text-base font-normal text-muted-foreground">(Live records)</span></h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <AnalyticsBox title="User Growth" value={`+${profiles.length}`} data={profiles.map((_, i) => i + 1).slice(-10)} />
            <AnalyticsBox title="Credited Volume" value={formatCurrency(totals.totalCredits)} data={sparkFrom(transactions.filter((t) => ["deposit", "daily_profit", "bonus", "adjustment"].includes(t.type)).map((t) => Number(t.amount)))} tone="emerald" />
            <AnalyticsBox title="Debited Volume" value={formatCurrency(totals.totalDebits)} data={sparkFrom(transactions.filter((t) => ["withdrawal", "investment", "fee"].includes(t.type)).map((t) => Number(t.amount)))} tone="orange" />
            <AnalyticsBox title="KYC Approved" value={`+${kyc.filter((r) => r.status === "approved").length}`} data={sparkFrom(kyc.map((_, i) => i + 1))} tone="violet" />
            <DonutCard total={formatCurrency(totals.walletValue)} deposits={totals.totalCredits} withdrawals={totals.totalDebits} />
          </div>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-red-200 bg-red-50/40 p-6 shadow-soft dark:border-red-400/20 dark:bg-red-400/10">
          <div className="mb-4 flex items-center gap-2 font-display text-xl font-bold text-red-700 dark:text-red-300"><AlertTriangle className="h-5 w-5" />Needs Review</div>
          <ReviewRow icon={ShieldCheck} label="Pending KYC" value={totals.pendingKyc} />
          <ReviewRow icon={Wallet} label="Pending Deposits" value={totals.pendingDepositCount} />
          <ReviewRow icon={Landmark} label="Pending Withdrawals" value={totals.pendingWithdrawalCount} />
          <ReviewRow icon={FileWarning} label="Failed Transactions" value={totals.failedTransactions} />
          <ReviewRow icon={Users} label="Flagged Users" value={0} />
          <Button onClick={openReviewCenter} variant="outline" className="mt-5 w-full rounded-xl border-red-200 text-red-600 hover:bg-red-50 dark:border-red-400/20">Go to Review Center</Button>
        </Card>
      </div>

      <div className="grid gap-7 xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0 overflow-hidden rounded-[1.75rem] border-border/70 bg-card shadow-soft">
          <div className="flex flex-col gap-4 border-b border-border/70 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="font-display text-2xl font-bold">Users</h2><p className="text-sm text-muted-foreground">Create users, credit wallet balances, and monitor account status.</p></div>
            <div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Search users..." className="h-11 rounded-xl pl-9" /></div><Button variant="outline" className="rounded-xl" onClick={() => toast.info("Search currently filters this user table.")}><Filter className="mr-2 h-4 w-4" />Filter</Button><Button onClick={() => { setActiveTab("users"); setActionModal("create-user"); }} className="rounded-xl bg-gradient-primary text-primary-foreground"><Plus className="mr-2 h-4 w-4" />Create User</Button></div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-secondary/40"><TableHead>User</TableHead><TableHead>Phone</TableHead><TableHead>KYC Status</TableHead><TableHead>Wallet Balance</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>{visibleProfiles.slice(0, 8).length ? visibleProfiles.slice(0, 8).map((u) => <UserListRow key={u.id} user={u} wallet={balanceMap.get(u.id)} kyc={latestKycMap.get(u.id)?.status ?? "pending"} onCredit={() => { setActiveTab("users"); setAdjustment((a) => ({ ...a, userId: u.id, direction: "credit", description: "Manual wallet credit" })); setActionModal("credit"); }} onInvest={() => { setActiveTab("users"); setNewInvestment((a) => ({ ...a, userId: u.id })); setActionModal("investment"); }} />) : <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">No users found. Create a user to begin the account flow.</TableCell></TableRow>}</TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border/70 p-4 text-sm text-muted-foreground"><span>Showing {Math.min(visibleProfiles.length, 8)} of {profiles.length.toLocaleString()} users</span><span>{profiles.length ? "Live data" : "No demo users"}</span></div>
        </Card>

        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Recent Activity</h2><Button variant="ghost" size="sm" className="text-primary" onClick={() => setActiveTab("users")}>View all</Button></div>
          {transactions.slice(0, 5).length ? transactions.slice(0, 5).map((tx) => <RecentAdminActivity key={tx.id} icon={activityIcon(tx.type)} title={tx.description ?? tx.type.replaceAll("_", " ")} body={`${tx.profiles?.email ?? tx.user_id} • ${formatCurrency(tx.amount)}`} time={relativeTime(tx.created_at)} tone={txTone(tx.type)} />) : <EmptyPanel title="No activity yet" body="Create a user and manually credit a balance to start seeing activity." />}
        </Card>
      </div>

      <div className="grid gap-7 xl:grid-cols-[1fr_0.9fr]">
        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Audit Logs</h2><Button variant="ghost" size="sm" className="text-primary" onClick={load}>Refresh</Button></div>
          <Table><TableHeader><TableRow><TableHead>Admin</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Amount</TableHead><TableHead>Entity</TableHead><TableHead>Time</TableHead></TableRow></TableHeader><TableBody>{auditLogs.length ? auditLogs.slice(0, 6).map((a) => <TableRow key={a.id}><TableCell>{a.profiles?.email ?? "Admin"}</TableCell><TableCell><Badge className="bg-emerald-100 text-emerald-700">{a.action}</Badge></TableCell><TableCell>{a.entity_id ?? "—"}</TableCell><TableCell>{a.metadata?.amount ? formatCurrency(a.metadata.amount) : "—"}</TableCell><TableCell>{a.entity_type ?? "—"}</TableCell><TableCell>{new Date(a.created_at).toLocaleString()}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No audit logs yet.</TableCell></TableRow>}</TableBody></Table>
        </Card>
        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Wallet Center</h2><Button variant="ghost" size="sm" className="text-primary" onClick={() => { setActiveTab("users"); setActionModal("credit"); }}>Manual credit</Button></div>
          <SecurityRow title="Real-money rails disabled" info="Admin controlled" time="Active" tone="amber" />
          <SecurityRow title="Manual admin credits" info="Audit-logged" time="Ready" tone="orange" />
          <SecurityRow title="User notifications" info="Automatic" time="Ready" tone="red" />
        </Card>
      </div>

      <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft">
        <h2 className="font-display text-2xl font-bold">Management workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">Main account flow: admin creates user → admin manually credits wallet → user receives notification → dashboard balance increases.</p>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)} className="mt-6 space-y-6">
          <TabsList className="flex h-auto flex-wrap justify-start rounded-2xl bg-secondary/70 p-1">
            {[["users", "Users & Credits"], ["kyc", "KYC"], ["deposits", "Deposits"], ["withdrawals", "Withdrawals"], ["plans", "Plans"], ["cms", "CMS & Settings"]].map(([value, label]) => <TabsTrigger key={value} value={value} className="rounded-xl">{label}</TabsTrigger>)}
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <Card className="rounded-3xl border-border/60 bg-card p-6 shadow-soft">
              <h2 className="font-display text-xl font-semibold">Create user account</h2>
              <p className="mt-1 text-sm text-muted-foreground">Only administrators can create users. New users receive a welcome notification and must change the temporary password after login.</p>
              <form onSubmit={createUser} className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                <div className="space-y-2"><Label>Full name</Label><Input className="h-11 rounded-xl" value={newUser.fullName} onChange={(e) => setNewUser((u) => ({ ...u, fullName: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" className="h-11 rounded-xl" value={newUser.email} onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Temporary password</Label><Input type="password" className="h-11 rounded-xl" value={newUser.password} onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))} /></div>
                <Button disabled={actionLoading === "create-user"} className="h-11 rounded-xl bg-gradient-primary text-primary-foreground">{actionLoading === "create-user" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create user</Button>
              </form>
            </Card>

            <Card className="rounded-3xl border-border/60 bg-card p-6 shadow-soft">
              <h2 className="font-display text-xl font-semibold">Manual wallet credit</h2>
              <p className="mt-1 text-sm text-muted-foreground">Credit/debit actions update the user&apos;s available balance, create a transaction, send an in-app notification, and write an audit log.</p>
              <form onSubmit={adjustBalance} className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_1.2fr_auto] lg:items-end">
                <div className="space-y-2"><Label>User</Label><Select value={adjustment.userId} onValueChange={(value) => setAdjustment((a) => ({ ...a, userId: value }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select user" /></SelectTrigger><SelectContent>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Amount</Label><Input type="number" min="1" step="0.01" className="h-11 rounded-xl" value={adjustment.amount} onChange={(e) => setAdjustment((a) => ({ ...a, amount: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Direction</Label><Select value={adjustment.direction} onValueChange={(value) => setAdjustment((a) => ({ ...a, direction: value, description: value === "credit" ? "Manual wallet credit" : "Manual wallet debit" }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="credit">Credit</SelectItem><SelectItem value="debit">Debit</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>Type</Label><Select value={adjustment.type} onValueChange={(value) => setAdjustment((a) => ({ ...a, type: value }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{["adjustment", "bonus", "fee"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Description</Label><Input className="h-11 rounded-xl" value={adjustment.description} onChange={(e) => setAdjustment((a) => ({ ...a, description: e.target.value }))} /></div>
                <Button disabled={actionLoading === "adjust-balance"} className="h-11 rounded-xl bg-gradient-primary text-primary-foreground">{actionLoading === "adjust-balance" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Apply</Button>
              </form>
            </Card>
            <Card className="rounded-3xl border-border/60 bg-card p-6 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold">Create investment for user</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Admin can activate a user investment on behalf of a selected user. The user receives a notification and sees the investment on their dashboard.</p>
                </div>
                <Button onClick={() => setActionModal("investment")} className="rounded-xl bg-gradient-primary text-primary-foreground"><TrendingUp className="mr-2 h-4 w-4" />Open investment modal</Button>
              </div>
            </Card>

            <DataTable headers={["User", "Email", "Wallet", "Status", "Joined"]} rows={visibleProfiles.map((p) => [p.full_name ?? "—", p.email ?? "—", formatCurrency(Number(balanceMap.get(p.id)?.available ?? 0)), <Badge key={p.id} variant="outline" className={statusClass(p.status)}>{p.status}</Badge>, new Date(p.created_at).toLocaleDateString()])} empty="No users found." />
          </TabsContent>

          <TabsContent value="kyc" className="space-y-6">
            <DataTable headers={["User", "Address", "Documents", "Submitted", "Status", "Actions"]} rows={kyc.map((k) => [
              <div key={`${k.id}-user`}><div className="font-medium">{kycUserName(k)}</div><div className="text-xs text-muted-foreground">{kycUserEmail(k)}</div></div>,
              <span key={`${k.id}-addr`} className="line-clamp-2 max-w-md text-muted-foreground">{k.proof_of_address ?? "—"}</span>,
              <div key={`${k.id}-docs`}>{renderKycDocuments(k, true)}</div>,
              new Date(k.submitted_at).toLocaleDateString(),
              <Badge key={`${k.id}-badge`} variant="outline" className={statusClass(k.status)}>{k.status.replace("_", " ")}</Badge>,
              <div key={`${k.id}-actions`} className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => runAction(`kyc-approve-${k.id}`, async () => { const { error } = await db.rpc("review_kyc", { _kyc_id: k.id, _status: "approved", _admin_notes: null }); if (error) throw error; toast.success("KYC approved"); })}>Approve</Button><Button size="sm" variant="outline" onClick={() => runAction(`kyc-reject-${k.id}`, async () => { const { error } = await db.rpc("review_kyc", { _kyc_id: k.id, _status: "rejected", _admin_notes: "Please resubmit clearer documents." }); if (error) throw error; toast.success("KYC rejected"); })}>Reject</Button></div>,
            ])} empty="No KYC submissions." />
          </TabsContent>

          <TabsContent value="deposits" className="space-y-6">
            <Card className="rounded-3xl border-blue-200 bg-blue-50/40 p-5 text-blue-800 shadow-soft dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200"><b>Funding note:</b> You can keep deposit requests for review, but the recommended admin funding flow is manual wallet credit.</Card>
            <DataTable headers={["User", "Amount", "Method", "Proof", "Submitted", "Status", "Actions"]} rows={depositReviewRows} empty="No deposit requests." />
          </TabsContent>

          <TabsContent value="withdrawals" className="space-y-6">
            <DataTable headers={["User", "Amount", "30% Interest", "Total Due", "Method", "Destination", "Status", "Actions"]} rows={withdrawalReviewRows} empty="No withdrawal requests." />
          </TabsContent>

          <TabsContent value="plans" className="space-y-6">
            <Card className="rounded-3xl border-border/60 bg-card p-6 shadow-soft">
              <h2 className="font-display text-xl font-semibold">Create investment plan</h2>
              <form onSubmit={savePlan} className="mt-5 grid gap-4 lg:grid-cols-3">
                <div className="space-y-2"><Label>Name</Label><Input className="h-11 rounded-xl" value={newPlan.name} onChange={(e) => setNewPlan((p) => ({ ...p, name: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Minimum</Label><Input type="number" className="h-11 rounded-xl" value={newPlan.min} onChange={(e) => setNewPlan((p) => ({ ...p, min: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Maximum (blank for unlimited)</Label><Input type="number" className="h-11 rounded-xl" value={newPlan.max} onChange={(e) => setNewPlan((p) => ({ ...p, max: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Daily ROI %</Label><Input type="number" step="0.01" className="h-11 rounded-xl" value={newPlan.roi} onChange={(e) => setNewPlan((p) => ({ ...p, roi: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Duration days</Label><Input type="number" className="h-11 rounded-xl" value={newPlan.duration} onChange={(e) => setNewPlan((p) => ({ ...p, duration: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Description</Label><Input className="h-11 rounded-xl" value={newPlan.description} onChange={(e) => setNewPlan((p) => ({ ...p, description: e.target.value }))} /></div>
                <Button disabled={actionLoading === "save-plan"} className="h-11 rounded-xl bg-gradient-primary text-primary-foreground lg:col-span-3">{actionLoading === "save-plan" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save plan</Button>
              </form>
            </Card>
            <DataTable headers={["Plan", "Min", "Max", "Daily ROI", "Duration", "Status"]} rows={plans.map((p) => [p.name, formatCurrency(p.min_amount), p.max_amount ? formatCurrency(p.max_amount) : "Unlimited", formatPercent(p.daily_roi_percent), `${p.duration_days} days`, <Badge key={p.id} variant="outline" className={p.active ? statusClass("active") : statusClass("suspended")}>{p.active ? "active" : "paused"}</Badge>])} empty="No plans configured." />
          </TabsContent>

          <TabsContent value="cms" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-3xl border-border/60 bg-card p-6 shadow-soft">
                <div className="mb-4 flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">Announcement</h2></div>
                <form onSubmit={sendAnnouncement} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Audience</Label><Select value={announcement.audience} onValueChange={(value) => setAnnouncement((a) => ({ ...a, audience: value, userId: value === "general" ? "" : a.userId }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General announcement</SelectItem><SelectItem value="individual">Individual user</SelectItem></SelectContent></Select></div>
                    {announcement.audience === "individual" && <div className="space-y-2"><Label>Recipient</Label><Select value={announcement.userId} onValueChange={(value) => setAnnouncement((a) => ({ ...a, userId: value }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select user" /></SelectTrigger><SelectContent>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id}</SelectItem>)}</SelectContent></Select></div>}
                  </div>
                  <div className="space-y-2"><Label>Title</Label><Input className="h-11 rounded-xl" value={announcement.title} onChange={(e) => setAnnouncement((a) => ({ ...a, title: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Body</Label><Textarea className="min-h-28 rounded-xl" value={announcement.body} onChange={(e) => setAnnouncement((a) => ({ ...a, body: e.target.value }))} /></div>
                  <Button disabled={actionLoading === "announcement"} className="rounded-xl bg-gradient-primary text-primary-foreground">{announcement.audience === "individual" ? "Send to user" : "Send to all users"}</Button>
                </form>
              </Card>
              <Card className="rounded-3xl border-border/60 bg-gradient-card p-6 shadow-soft">
                <div className="mb-4 flex items-center gap-2"><Settings className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">Admin settings</h2></div>
                <div className="grid gap-3 text-sm text-muted-foreground">
                  {["Real-money rails disabled", "Admin creates users only", "Manual credit/debit updates wallet balances", "User notifications are sent automatically", "All admin balance actions are audit-logged"].map((item) => <div key={item} className="rounded-2xl border border-border/60 bg-card/70 p-3"><BadgeDollarSign className="mr-2 inline h-4 w-4 text-accent" />{item}</div>)}
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      <Dialog open={Boolean(actionModal)} onOpenChange={(open) => !open && setActionModal(null)}>
        <DialogContent className="max-h-[86vh] overflow-y-auto rounded-3xl sm:max-w-[720px] lg:max-w-[980px]">
          <DialogHeader>
            <DialogTitle>
              {actionModal === "create-user" && "Create user account"}
              {actionModal === "credit" && "Manual wallet credit"}
              {actionModal === "investment" && "Create user investment"}
              {actionModal === "kyc" && "Review KYC submissions"}
              {actionModal === "deposits" && "Review deposits"}
              {actionModal === "withdrawals" && "Review withdrawals"}
              {actionModal === "plans" && "Create investment plan"}
              {actionModal === "announcement" && "Send announcement"}
            </DialogTitle>
            <DialogDescription>
              Use this quick action modal so you do not need to scroll down the admin page to complete important actions.
            </DialogDescription>
          </DialogHeader>

          {actionModal === "create-user" && (
            <form onSubmit={createUser} className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2"><Label>Full name</Label><Input className="h-11 rounded-xl" value={newUser.fullName} onChange={(e) => setNewUser((u) => ({ ...u, fullName: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" className="h-11 rounded-xl" value={newUser.email} onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Temporary password</Label><Input type="password" className="h-11 rounded-xl" value={newUser.password} onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))} /></div>
              <Button disabled={actionLoading === "create-user"} className="h-11 rounded-xl bg-gradient-primary text-primary-foreground lg:col-span-3">{actionLoading === "create-user" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create user</Button>
            </form>
          )}

          {actionModal === "credit" && (
            <form onSubmit={adjustBalance} className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 lg:col-span-2"><Label>User</Label><Select value={adjustment.userId} onValueChange={(value) => setAdjustment((a) => ({ ...a, userId: value }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select user" /></SelectTrigger><SelectContent>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Amount</Label><Input type="number" min="1" step="0.01" className="h-11 rounded-xl" value={adjustment.amount} onChange={(e) => setAdjustment((a) => ({ ...a, amount: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Direction</Label><Select value={adjustment.direction} onValueChange={(value) => setAdjustment((a) => ({ ...a, direction: value, description: value === "credit" ? "Manual wallet credit" : "Manual wallet debit" }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="credit">Credit</SelectItem><SelectItem value="debit">Debit</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Type</Label><Select value={adjustment.type} onValueChange={(value) => setAdjustment((a) => ({ ...a, type: value }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{["adjustment", "bonus", "fee"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Description</Label><Input className="h-11 rounded-xl" value={adjustment.description} onChange={(e) => setAdjustment((a) => ({ ...a, description: e.target.value }))} /></div>
              <Button disabled={actionLoading === "adjust-balance"} className="h-11 rounded-xl bg-gradient-primary text-primary-foreground lg:col-span-2">{actionLoading === "adjust-balance" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Apply balance update</Button>
            </form>
          )}


          {actionModal === "investment" && (
            <form onSubmit={createUserInvestment} className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2"><Label>User</Label><Select value={newInvestment.userId} onValueChange={(value) => setNewInvestment((a) => ({ ...a, userId: value }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select user" /></SelectTrigger><SelectContent>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Investment plan</Label><Select value={newInvestment.planId} onValueChange={(value) => { const plan = plans.find((p) => p.id === value); setNewInvestment((a) => ({ ...a, planId: value, amount: a.amount || String(plan?.min_amount ?? "") })); }}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select plan" /></SelectTrigger><SelectContent>{plans.filter((p) => p.active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} • {formatCurrency(p.min_amount)} min • {formatPercent(p.daily_roi_percent)}/day</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Amount</Label><Input type="number" min="1" step="0.01" className="h-11 rounded-xl" value={newInvestment.amount} onChange={(e) => setNewInvestment((a) => ({ ...a, amount: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Description</Label><Input className="h-11 rounded-xl" value={newInvestment.description} onChange={(e) => setNewInvestment((a) => ({ ...a, description: e.target.value }))} /></div>
              <Button disabled={actionLoading === "create-investment"} className="h-11 rounded-xl bg-gradient-primary text-primary-foreground lg:col-span-2">{actionLoading === "create-investment" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create investment for user</Button>
            </form>
          )}

          {actionModal === "kyc" && (
            <DataTable headers={["User", "Address", "Documents", "Submitted", "Status", "Actions"]} rows={kyc.map((k) => [
              <div key={`${k.id}-modal-user`}><div className="font-medium">{kycUserName(k)}</div><div className="text-xs text-muted-foreground">{kycUserEmail(k)}</div></div>,
              <span key={`${k.id}-modal-addr`} className="line-clamp-2 max-w-md text-muted-foreground">{k.proof_of_address ?? "—"}</span>,
              <div key={`${k.id}-modal-docs`}>{renderKycDocuments(k)}</div>,
              new Date(k.submitted_at).toLocaleDateString(),
              <Badge key={`${k.id}-modal-badge`} variant="outline" className={statusClass(k.status)}>{k.status.replace("_", " ")}</Badge>,
              <div key={`${k.id}-modal-actions`} className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => runAction(`kyc-approve-${k.id}`, async () => { const { error } = await db.rpc("review_kyc", { _kyc_id: k.id, _status: "approved", _admin_notes: null }); if (error) throw error; toast.success("KYC approved"); })}>Approve</Button><Button size="sm" variant="outline" onClick={() => runAction(`kyc-reject-${k.id}`, async () => { const { error } = await db.rpc("review_kyc", { _kyc_id: k.id, _status: "rejected", _admin_notes: "Please resubmit clearer documents." }); if (error) throw error; toast.success("KYC rejected"); })}>Reject</Button></div>,
            ])} empty="No KYC submissions." />
          )}

          {actionModal === "deposits" && (
            <DataTable headers={["User", "Amount", "Method", "Proof", "Submitted", "Status", "Actions"]} rows={depositReviewRows} empty="No deposit requests." />
          )}

          {actionModal === "withdrawals" && (
            <DataTable headers={["User", "Amount", "30% Interest", "Total Due", "Method", "Destination", "Status", "Actions"]} rows={withdrawalReviewRows} empty="No withdrawal requests." />
          )}

          {actionModal === "plans" && (
            <form onSubmit={savePlan} className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2"><Label>Name</Label><Input className="h-11 rounded-xl" value={newPlan.name} onChange={(e) => setNewPlan((p) => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Minimum</Label><Input type="number" className="h-11 rounded-xl" value={newPlan.min} onChange={(e) => setNewPlan((p) => ({ ...p, min: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Maximum</Label><Input type="number" className="h-11 rounded-xl" value={newPlan.max} onChange={(e) => setNewPlan((p) => ({ ...p, max: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Daily ROI %</Label><Input type="number" step="0.01" className="h-11 rounded-xl" value={newPlan.roi} onChange={(e) => setNewPlan((p) => ({ ...p, roi: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Duration days</Label><Input type="number" className="h-11 rounded-xl" value={newPlan.duration} onChange={(e) => setNewPlan((p) => ({ ...p, duration: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Description</Label><Input className="h-11 rounded-xl" value={newPlan.description} onChange={(e) => setNewPlan((p) => ({ ...p, description: e.target.value }))} /></div>
              <Button disabled={actionLoading === "save-plan"} className="h-11 rounded-xl bg-gradient-primary text-primary-foreground lg:col-span-3">{actionLoading === "save-plan" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save plan</Button>
            </form>
          )}

          {actionModal === "announcement" && (
            <form onSubmit={sendAnnouncement} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Audience</Label><Select value={announcement.audience} onValueChange={(value) => setAnnouncement((a) => ({ ...a, audience: value, userId: value === "general" ? "" : a.userId }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General announcement</SelectItem><SelectItem value="individual">Individual user</SelectItem></SelectContent></Select></div>
                {announcement.audience === "individual" && <div className="space-y-2"><Label>Recipient</Label><Select value={announcement.userId} onValueChange={(value) => setAnnouncement((a) => ({ ...a, userId: value }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select user" /></SelectTrigger><SelectContent>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id}</SelectItem>)}</SelectContent></Select></div>}
              </div>
              <div className="space-y-2"><Label>Title</Label><Input className="h-11 rounded-xl" value={announcement.title} onChange={(e) => setAnnouncement((a) => ({ ...a, title: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Body</Label><Textarea className="min-h-32 rounded-xl" value={announcement.body} onChange={(e) => setAnnouncement((a) => ({ ...a, body: e.target.value }))} /></div>
              <Button disabled={actionLoading === "announcement"} className="rounded-xl bg-gradient-primary text-primary-foreground">{announcement.audience === "individual" ? "Send to user" : "Send to all users"}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <Card className="overflow-hidden rounded-3xl border-border/60 bg-card shadow-soft">
      <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow className="bg-secondary/60">{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.length ? rows.map((row, index) => <TableRow key={index}>{row.map((cell, cellIndex) => <TableCell key={cellIndex}>{cell}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={headers.length} className="h-32 text-center text-muted-foreground">{empty}</TableCell></TableRow>}
        </TableBody>
      </Table>
      </div>
    </Card>
  );
}

function docLabel(key: string) {
  const labels: Record<string, string> = {
    selfie: "Selfie",
    governmentId: "Government ID",
    passport: "Passport",
    driverLicense: "Driver License",
    nationalId: "National ID",
    utilityBill: "Utility Bill",
    proofOfAddress: "Proof of Address",
  };
  return labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

function shortDocLabel(key: string) {
  const labels: Record<string, string> = {
    selfie: "Selfie",
    governmentId: "Gov ID",
    passport: "Passport",
    driverLicense: "License",
    nationalId: "NIN",
    utilityBill: "Bill",
    proofOfAddress: "Address",
  };
  return labels[key] ?? docLabel(key);
}

function AdminMetric({ icon: Icon, title, value, change, data, tone = "blue" }: { icon: any; title: string; value: string; change: string; data: number[]; tone?: "blue" | "emerald" | "violet" | "orange" }) {
  return (
    <Card className="min-w-0 rounded-[1.5rem] border-border/70 bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${toneBg(tone)}`}><Icon className="h-6 w-6" /></span>
        <div className="h-14 w-28"><Spark data={data.length ? data : [0, 0, 0]} tone={tone} /></div>
      </div>
      <div className="mt-3 text-sm text-muted-foreground">{title}</div>
      <div className="truncate font-display text-2xl font-extrabold">{value}</div>
      <p className="mt-2 text-sm text-muted-foreground"><span className="font-semibold text-emerald-600">{change}</span><br />admin record</p>
    </Card>
  );
}

function QuickAdminAction({ icon: Icon, label, badge, tone = "blue", onClick }: { icon: any; label: string; badge?: number; tone?: "blue" | "emerald" | "violet" | "orange"; onClick: () => void }) {
  return <button onClick={onClick} className={`relative flex items-center justify-center gap-2 rounded-2xl border bg-card px-4 py-4 font-bold shadow-soft transition hover:-translate-y-0.5 hover:shadow-elegant ${tone === "orange" ? "border-orange-200 text-orange-600" : tone === "violet" ? "border-violet-200 text-violet-600" : tone === "emerald" ? "border-emerald-200 text-emerald-600" : "border-primary/20 text-primary"}`}><Icon className="h-5 w-5" />{label}{!!badge && <span className="absolute -right-2 -top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white">{badge}</span>}</button>;
}

function AnalyticsBox({ title, value, data, tone = "blue" }: { title: string; value: string; data: number[]; tone?: "blue" | "emerald" | "violet" | "orange" }) {
  return <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4"><div className="text-sm text-muted-foreground">{title}</div><div className={`mt-1 truncate font-display text-xl font-extrabold ${toneText(tone)}`}>{value}</div><div className="mt-3 h-28"><Spark data={data.length ? data : [0, 0, 0]} tone={tone} /></div></div>;
}

function DonutCard({ total, deposits, withdrawals }: { total: string; deposits: number; withdrawals: number }) {
  const sum = Math.max(deposits + withdrawals, 1);
  const creditPct = Math.round((deposits / sum) * 100);
  const debitPct = Math.round((withdrawals / sum) * 100);
  return (
    <div className="min-w-0 rounded-2xl border border-border/70 bg-secondary/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Account Flow</div>
          <p className="mt-1 text-xs text-muted-foreground">Manual credit/debit activity</p>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-primary dark:bg-blue-400/10"><Database className="h-5 w-5" /></span>
      </div>
      <div className="mt-4 rounded-2xl bg-card p-3 shadow-sm">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Wallet value</div>
        <div className="truncate font-display text-xl font-extrabold">{total}</div>
      </div>
      <div className="mt-4 space-y-3">
        <FlowBar label="Credits" amount={formatCurrency(deposits)} value={creditPct} className="bg-emerald-500" />
        <FlowBar label="Debits" amount={formatCurrency(withdrawals)} value={debitPct} className="bg-violet-600" />
        <FlowBar label="Live records" amount="Active" value={100} className="bg-blue-600" />
      </div>
    </div>
  );
}

function FlowBar({ label, amount, value, className }: { label: string; amount: string; value: number; className: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs"><span className="truncate text-muted-foreground">{label}</span><b className="shrink-0 text-foreground">{amount}</b></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><span className={`block h-full rounded-full ${className}`} style={{ width: `${Math.max(3, Math.min(value, 100))}%` }} /></div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) { return <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${color}`} /> <span>{label}</span><b className="ml-auto text-foreground">{value}</b></div>; }
function ReviewRow({ icon: Icon, label, value }: { icon: any; label: string; value: number }) { return <div className="flex items-center justify-between border-b border-red-100 py-3 text-sm last:border-b-0 dark:border-red-400/10"><span className="flex items-center gap-3"><Icon className="h-4 w-4 text-orange-500" />{label}</span><b>{value}</b></div>; }

function WithdrawalActionButtons({ withdrawal, loadingKey, onUpdate }: { withdrawal: Withdrawal; loadingKey: string | null; onUpdate: (withdrawal: Withdrawal, status: string) => void }) {
  const actions = withdrawal.status === "pending"
    ? ["processing", "approved", "rejected"]
    : withdrawal.status === "processing"
      ? ["approved", "rejected"]
      : withdrawal.status === "approved"
        ? ["paid", "rejected"]
        : [];

  if (!actions.length) {
    return <span className="text-xs text-muted-foreground">No action</span>;
  }

  return (
    <div className="flex min-w-[220px] flex-wrap gap-2">
      {actions.map((status) => (
        <Button key={status} size="sm" variant="outline" className="h-8 rounded-xl capitalize" disabled={loadingKey === `withdraw-${withdrawal.id}-${status}`} onClick={() => onUpdate(withdrawal, status)}>
          {loadingKey === `withdraw-${withdrawal.id}-${status}` && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {status}
        </Button>
      ))}
    </div>
  );
}

function UserListRow({ user, wallet, kyc, onCredit, onInvest }: { user: Profile; wallet?: Balance; kyc: string; onCredit: () => void; onInvest: () => void }) {
  const initials = (user.full_name ?? user.email ?? "U").split(/[\s@]+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  const walletValue = Number(wallet?.available ?? 0) + Number(wallet?.invested ?? 0) + Number(wallet?.total_profit ?? 0);
  return <TableRow><TableCell><div className="flex items-center gap-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700">{initials}</span><div><div className="font-semibold">{user.full_name ?? "Unnamed User"}</div><div className="text-xs text-muted-foreground">{user.email}</div></div></div></TableCell><TableCell>{user.phone ?? "—"}</TableCell><TableCell><Badge className={statusClass(kyc)}>{kyc.replaceAll("_", " ")}</Badge></TableCell><TableCell>{formatCurrency(walletValue)}</TableCell><TableCell><Badge className={statusClass(user.status)}>{user.status}</Badge></TableCell><TableCell>{new Date(user.created_at).toLocaleDateString()}<br /><span className="text-xs text-muted-foreground">{new Date(user.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></TableCell><TableCell><div className="flex gap-2"><Button size="icon" variant="outline" className="h-9 w-9 rounded-xl" onClick={() => toast.info(`${user.email ?? "User"} wallet: ${formatCurrency(walletValue)}`)} title="View wallet"><Eye className="h-4 w-4" /></Button><Button size="icon" variant="outline" className="h-9 w-9 rounded-xl" onClick={onCredit} title="Credit/debit balance"><MoreVertical className="h-4 w-4" /></Button><Button size="icon" variant="outline" className="h-9 w-9 rounded-xl" onClick={onInvest} title="Create investment"><TrendingUp className="h-4 w-4" /></Button></div></TableCell></TableRow>;
}

function RecentAdminActivity({ icon: Icon, title, body, time, tone = "blue" }: { icon: any; title: string; body: string; time: string; tone?: "blue" | "emerald" | "orange" | "red" }) {
  const color = tone === "emerald" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10" : tone === "orange" ? "bg-orange-50 text-orange-600 dark:bg-orange-400/10" : tone === "red" ? "bg-red-50 text-red-600 dark:bg-red-400/10" : "bg-blue-50 text-primary dark:bg-blue-400/10";
  return <div className="flex items-start justify-between gap-3 py-3"><div className="flex gap-3"><span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${color}`}><Icon className="h-4 w-4" /></span><div><div className="text-sm font-bold capitalize">{title}</div><div className="text-xs text-muted-foreground">{body}</div></div></div><span className="whitespace-nowrap text-xs text-muted-foreground">{time}</span></div>;
}

function EmptyPanel({ title, body }: { title: string; body: string }) { return <div className="rounded-2xl border border-dashed border-border p-6 text-center"><div className="font-semibold">{title}</div><p className="mt-1 text-sm text-muted-foreground">{body}</p></div>; }

function SecurityRow({ title, info, time, tone }: { title: string; info: string; time: string; tone: "red" | "orange" | "amber" }) {
  const color = tone === "red" ? "text-red-600 bg-red-50" : tone === "orange" ? "text-orange-600 bg-orange-50" : "text-amber-600 bg-amber-50";
  return <div className="flex items-center justify-between gap-3 border-b border-border/70 py-4 last:border-b-0"><div className="flex items-center gap-3"><span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${color}`}><AlertTriangle className="h-4 w-4" /></span><span className="font-semibold">{title}</span></div><span className="text-sm text-muted-foreground">{info}</span><span className="text-sm text-muted-foreground">{time}</span></div>;
}

function Spark({ data, tone = "blue" }: { data: number[]; tone?: "blue" | "emerald" | "violet" | "orange" }) {
  const width = 180, height = 80;
  const normalized = data.length ? data : [0, 0, 0];
  const max = Math.max(...normalized, 1), min = Math.min(...normalized, 0);
  const points = normalized.map((v, i) => `${(i / Math.max(normalized.length - 1, 1)) * width},${height - ((v - min) / Math.max(max - min, 1)) * (height - 12) - 6}`).join(" ");
  return <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={toneText(tone)} /></svg>;
}

function MiniBars({ count }: { count: number }) { const bars = Array.from({ length: 7 }, (_, i) => Math.max(12, Math.min(95, (count + i + 1) * 10))); return <div className="flex h-14 items-end gap-1">{bars.map((h, i) => <span key={i} className="w-2 rounded-t bg-blue-500" style={{ height: `${h}%` }} />)}</div>; }
function toneBg(tone: "blue" | "emerald" | "violet" | "orange") { return tone === "emerald" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10" : tone === "violet" ? "bg-violet-50 text-violet-600 dark:bg-violet-400/10" : tone === "orange" ? "bg-orange-50 text-orange-600 dark:bg-orange-400/10" : "bg-blue-50 text-primary dark:bg-blue-400/10"; }
function toneText(tone: "blue" | "emerald" | "violet" | "orange") { return tone === "emerald" ? "text-emerald-600" : tone === "violet" ? "text-violet-600" : tone === "orange" ? "text-orange-600" : "text-primary"; }
function sparkFrom(values: number[]) { if (!values.length) return [0, 0, 0, 0, 0]; return values.slice(-10); }
function relativeTime(date: string) { const diff = Math.max(0, Date.now() - new Date(date).getTime()); const mins = Math.round(diff / 60000); if (mins < 60) return `${mins || 1} mins ago`; const hours = Math.round(mins / 60); if (hours < 24) return `${hours} hours ago`; return `${Math.round(hours / 24)} days ago`; }
function activityIcon(type: string) { if (type === "adjustment" || type === "bonus") return BadgeDollarSign; if (type === "withdrawal") return Download; if (type === "investment") return TrendingUp; if (type === "deposit") return Wallet; return Clock3; }
function txTone(type: string): "blue" | "emerald" | "orange" | "red" { if (["deposit", "bonus", "adjustment", "daily_profit"].includes(type)) return "emerald"; if (["withdrawal", "fee"].includes(type)) return "orange"; if (type === "investment") return "blue"; return "blue"; }

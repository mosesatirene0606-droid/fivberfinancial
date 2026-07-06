import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, Loader2, UploadCloud, Info, CheckCircle2, ShieldCheck, Search, FileSearch, CircleDotDashed, Banknote } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db, uploadPrivateFile } from "@/lib/supabase-helpers";
import { formatCurrency, statusClass } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/deposit")({ component: DepositPage });

type PaymentMethod = { id: string; name: string; type: string; instructions: string | null; details: Record<string, string> | null };
type Deposit = { id: string; amount: number; status: string; created_at: string; payment_methods?: { name?: string } | null };
type DepositAccount = { bank_name: string; account_name: string; account_number: string; bank_code: string; reference_code?: string | null };

const defaultMethods: PaymentMethod[] = [
  {
    id: "bank-transfer",
    name: "Bank Transfer",
    type: "bank",
    instructions: "Transfer to the bank account configured here, then upload proof of payment.",
    details: { bank: "Fivber Bank", account_name: "fivberfinancial", account_number: "0000000000", bank_code: "FIVB123XXX" },
  },
  { id: "crypto", name: "Crypto Wallet", type: "crypto", instructions: "Send to the configured wallet address and upload a screenshot or transaction hash.", details: null },
  { id: "mobile-money", name: "Mobile Money", type: "mobile_money", instructions: "Use the mobile money details provided by the administrator and upload proof of payment.", details: null },
  { id: "manual", name: "Manual Review", type: "manual", instructions: "Submit your payment proof for manual finance review.", details: null },
];

function DepositPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>(defaultMethods);
  const [history, setHistory] = useState<Deposit[]>([]);
  const [methodId, setMethodId] = useState(defaultMethods[0].id);
  const [amount, setAmount] = useState("1000");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [depositAccount, setDepositAccount] = useState<DepositAccount | null>(null);

  const selectedMethod = methods.find((m) => m.id === methodId) ?? methods[0];
  const instructionDetails = selectedMethod?.details ?? defaultMethods[0].details;
  const bankDetails = selectedMethod?.type?.toLowerCase().includes("bank") ? (depositAccount ?? instructionDetails) : instructionDetails;

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const [methodResult, deposits, generatedAccount] = await Promise.all([
        db.from("payment_methods").select("id,name,type,instructions,details").eq("active", true).order("name"),
        db.from("deposit_requests").select("id,amount,status,created_at,payment_methods(name)").eq("user_id", userData.user.id).order("created_at", { ascending: false }).limit(8),
        db.rpc("get_my_deposit_account"),
      ]);
      if (methodResult.data?.length) setMethods(methodResult.data as PaymentMethod[]);
      if (generatedAccount.data) setDepositAccount((Array.isArray(generatedAccount.data) ? generatedAccount.data[0] : generatedAccount.data) as DepositAccount);
      setHistory((deposits.data ?? []) as Deposit[]);
    })();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter a valid deposit amount");
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("You must be signed in");
      const proofPath = await uploadPrivateFile("deposit-proofs", userData.user.id, proof);
      const { data, error } = await db.rpc("create_deposit", {
        _amount: value,
        _payment_method_id: methodId.includes("-") && methodId.length < 20 ? null : methodId,
        _proof_url: proofPath,
        _notes: reference || null,
      });
      if (error) throw error;
      toast.success("Deposit request submitted for admin approval");
      setAmount("");
      setReference("");
      setProof(null);
      const methodName = selectedMethod?.name ?? "Deposit";
      setHistory((rows) => [{ id: String(data ?? Date.now()), amount: value, status: "pending", created_at: new Date().toISOString(), payment_methods: { name: methodName } }, ...rows]);
    } catch (error: any) {
      toast.error(error.message ?? "Unable to submit deposit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Deposit funds</h1>
        <p className="mt-2 text-base text-muted-foreground">Submit a deposit request. Funds are credited only after administrator approval.</p>
      </div>

      <div className="grid gap-7 xl:grid-cols-[1.25fr_0.95fr]">
        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft md:p-8">
          <form onSubmit={submit} className="space-y-7">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount</Label>
                <div className="relative">
                  <Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" className="h-14 rounded-2xl pr-20 text-base" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground">USD</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Payment method</Label>
                <Select value={methodId} onValueChange={setMethodId}>
                  <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select payment method" /></SelectTrigger>
                  <SelectContent>{methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-3xl border border-blue-200 bg-blue-50/70 p-5 text-blue-900 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">
              <div className="mb-3 flex items-center gap-2 font-bold"><Info className="h-5 w-5" /> Payment instructions</div>
              <p className="text-sm">{selectedMethod?.instructions ?? "Use the payment instructions configured by your administrator."}</p>
              {bankDetails && <PaymentInstructionDetails details={bankDetails as Record<string, string>} />}
            </div>

            <div className="space-y-2">
              <Label>Payment reference / notes</Label>
              <Textarea value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank transfer reference, crypto hash, sender name, or helpful notes" className="min-h-28 rounded-2xl" />
            </div>

            <div className="space-y-2">
              <Label>Proof of payment</Label>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-blue-200 bg-background/60 p-10 text-center transition hover:border-primary hover:bg-blue-50/60 dark:border-border dark:hover:bg-secondary/60">
                <UploadCloud className="mb-3 h-10 w-10 text-primary" />
                <span className="text-base font-semibold">{proof ? proof.name : "Upload proof of payment"}</span>
                <span className="mt-1 text-sm text-muted-foreground">Drag and drop your file here, or <span className="font-semibold text-primary">click to browse</span></span>
                <span className="mt-1 text-xs text-muted-foreground">PNG, JPG, PDF up to 10MB</span>
                <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
              </label>
            </div>

            <Button disabled={loading} className="h-12 rounded-2xl bg-gradient-primary px-7 text-primary-foreground shadow-soft">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Submit deposit request
            </Button>
          </form>
        </Card>

        <div className="space-y-7">
          <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft md:p-8">
            <div className="mb-5 flex items-center gap-4">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-50 text-primary dark:bg-blue-400/10"><Landmark className="h-7 w-7" /></span>
              <h2 className="font-display text-2xl font-bold">Approval workflow</h2>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">Every deposit remains pending until an administrator confirms proof of payment. Approved deposits automatically credit your available balance and create a transaction record.</p>
            <div className="mt-7 space-y-5">
              <WorkflowStep icon={ShieldCheck} tone="blue" title="Deposit submitted" body="You submit your deposit with proof of payment." />
              <WorkflowStep icon={CircleDotDashed} tone="amber" title="Under administrator review" body="Our team verifies your payment details." />
              <WorkflowStep icon={CheckCircle2} tone="emerald" title="Deposit approved" body="Funds are credited to your account balance." />
            </div>
            <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm font-bold text-primary dark:border-blue-400/20 dark:bg-blue-400/10"><ShieldCheck className="mr-2 inline h-4 w-4" />Admin action is audit-logged.</div>
          </Card>

          <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft md:p-8">
            <div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Deposit history</h2><Button variant="outline" className="rounded-2xl">View all</Button></div>
            <div className="mt-5 space-y-3">
              {history.length ? history.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-2xl border border-border/70 bg-secondary/40 p-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10"><Banknote className="h-5 w-5" /></span>
                    <div><div className="font-semibold">{formatCurrency(d.amount)}</div><div className="text-xs text-muted-foreground">{d.payment_methods?.name ?? "Deposit"} · {new Date(d.created_at).toLocaleDateString()}</div></div>
                  </div>
                  <Badge variant="outline" className={statusClass(d.status)}>{d.status}</Badge>
                </div>
              )) : (
                <div className="rounded-3xl border border-dashed border-blue-200 p-12 text-center">
                  <span className="mx-auto mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-primary dark:bg-blue-400/10"><FileSearch className="h-10 w-10" /></span>
                  <div className="font-display text-xl font-bold">No deposits yet</div>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Your deposit history will appear here once you make your first deposit.</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PaymentInstructionDetails({ details }: { details: Record<string, string> }) {
  const rows = [
    ["Bank", details.bank_name ?? details.bank ?? "Configure Bank"],
    ["Account name", details.account_name ?? "fivberfinancial"],
    ["Account number", details.account_number ?? "Generating..."],
    ["Bank code", details.bank_code ?? "FIVB123XXX"],
    ["Reference", details.reference_code ?? "Use your registered email"],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="mt-5 grid gap-3 rounded-2xl bg-white/85 p-5 text-sm text-blue-900 shadow-inner dark:bg-background/40 dark:text-blue-100 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-xl border border-blue-100 bg-blue-50/70 p-3 dark:border-blue-400/10 dark:bg-blue-400/5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-200">{label}</div>
          <div className="mt-1 truncate font-bold" title={String(value)}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function WorkflowStep({ icon: Icon, title, body, tone }: { icon: any; title: string; body: string; tone: "blue" | "amber" | "emerald" }) {
  const color = tone === "emerald" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10" : tone === "amber" ? "bg-amber-50 text-amber-600 dark:bg-amber-400/10" : "bg-blue-50 text-primary dark:bg-blue-400/10";
  return <div className="flex gap-4"><span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${color}`}><Icon className="h-5 w-5" /></span><div><div className="font-bold">{title}</div><p className="mt-1 text-sm text-muted-foreground">{body}</p></div></div>;
}

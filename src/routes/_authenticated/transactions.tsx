import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, Search, Bell, CalendarDays, Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/supabase-helpers";
import { formatCurrency, statusClass } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/transactions")({ component: TransactionsPage });

type Transaction = { id: string; transaction_id: string | null; type: string; amount: number; status: string; reference: string | null; description: string | null; created_at: string };
type Notification = { id: string; title: string; body: string | null; type: string; read_at: string | null; created_at: string };

function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const [tx, nt] = await Promise.all([
        db.from("transactions").select("id,transaction_id,type,amount,status,reference,description,created_at").eq("user_id", userData.user.id).order("created_at", { ascending: false }).limit(100),
        db.from("notifications").select("id,title,body,type,read_at,created_at").eq("user_id", userData.user.id).order("created_at", { ascending: false }).limit(20),
      ]);
      setTransactions((tx.data ?? []) as Transaction[]);
      setNotifications((nt.data ?? []) as Notification[]);
    })();
  }, []);

  const filtered = useMemo(() => transactions.filter((t) => {
    const text = `${t.type} ${t.status} ${t.reference ?? ""} ${t.description ?? ""} ${t.transaction_id ?? ""}`.toLowerCase();
    return (type === "all" || t.type === type) && text.includes(query.toLowerCase());
  }), [transactions, query, type]);

  const types = Array.from(new Set(transactions.map((t) => t.type)));

  const exportCsv = () => {
    const rows = [["Date", "Type", "Transaction ID", "Reference", "Amount", "Status", "Description"], ...filtered.map((t) => [
      new Date(t.created_at).toLocaleString(),
      t.type,
      t.transaction_id ?? "",
      t.reference ?? "",
      String(t.amount),
      t.status,
      t.description ?? "",
    ])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fivberfinancial-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="mt-1 text-muted-foreground">Complete record of deposits, investments, daily profit, withdrawals, bonuses, and adjustments.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />CSV export</Button>
          <Button className="rounded-xl bg-gradient-primary text-primary-foreground" onClick={() => window.print()}><FileText className="mr-2 h-4 w-4" />PDF statement</Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="rounded-3xl border-border/60 bg-card p-6 shadow-soft">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /><h2 className="font-display text-lg font-semibold">Transaction history</h2></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reference" className="h-10 rounded-xl pl-9" />
              </div>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-10 rounded-xl sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All types</SelectItem>{types.map((t) => <SelectItem key={t} value={t}>{t.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length ? filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium capitalize">{t.type.replaceAll("_", " ")}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">{t.reference ?? t.transaction_id ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(t.amount)}</TableCell>
                    <TableCell><Badge variant="outline" className={statusClass(t.status)}>{t.status}</Badge></TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No matching transactions.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="rounded-3xl border-border/60 bg-card p-6 shadow-soft">
          <div className="mb-5 flex items-center gap-2"><Bell className="h-5 w-5 text-accent" /><h2 className="font-display text-lg font-semibold">Notifications</h2></div>
          <div className="space-y-3">
            {notifications.length ? notifications.map((n) => (
              <div key={n.id} className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="font-medium">{n.title}</div><p className="mt-1 text-sm text-muted-foreground">{n.body ?? ""}</p></div>
                  {!n.read_at && <span className="mt-1 h-2 w-2 rounded-full bg-accent" />}
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> {new Date(n.created_at).toLocaleString()}</div>
              </div>
            )) : <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No notifications yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

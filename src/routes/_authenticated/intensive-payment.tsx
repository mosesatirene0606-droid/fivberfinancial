import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, FileText, Loader2, MonitorSmartphone, ShieldCheck, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/supabase-helpers";
import { formatCurrency } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/intensive-payment")({ component: IntensivePaymentPage });

type WalletMethod = {
  id: string;
  name: string;
  type: string;
  instructions?: string | null;
  details: Record<string, any>;
};

type NormalizedWallet = {
  id: string;
  name: string;
  network: string;
  address: string;
  currency: string;
  scheme: string;
  instructions?: string | null;
};

const fallbackWallets: NormalizedWallet[] = [
  {
    id: "bitcoin-fallback",
    name: "Bitcoin Wallet",
    network: "Bitcoin",
    currency: "BTC",
    scheme: "bitcoin",
    address: "bc1qc9zjnpwluq4xmt02jfyekturwtmsgdclwfeym9",
    instructions: "Open your Bitcoin wallet. The 30% intensive payment amount and reference are attached to this payment link.",
  },
  {
    id: "eth-fallback",
    name: "Ethereum Wallet",
    network: "Ethereum",
    currency: "ETH",
    scheme: "ethereum",
    address: "0xEa9B10f4ea797fd469f98e526C0E358D5faB9De4",
    instructions: "Open your Ethereum wallet. The 30% intensive payment amount and reference are attached to this payment link.",
  },
  {
    id: "bnb-fallback",
    name: "BNB Wallet",
    network: "BNB Smart Chain",
    currency: "BNB",
    scheme: "ethereum",
    address: "0xEa9B10f4ea797fd469f98e526C0E358D5faB9De4",
    instructions: "Open your BNB wallet. The 30% intensive payment amount and reference are attached to this payment link.",
  },
  {
    id: "solana-fallback",
    name: "Solana Wallet",
    network: "Solana",
    currency: "SOL",
    scheme: "solana",
    address: "4HpqwCSQu1MRBZ4VgBxSTMSZ3BKza9mJRK6Cs3atZNoy",
    instructions: "Open your Solana wallet. The 30% intensive payment amount and reference are attached to this payment link.",
  },
];

function normalizeWallet(row: WalletMethod): NormalizedWallet | null {
  const details = row.details ?? {};
  const address = details.address ?? details.wallet ?? details.wallet_address ?? details.account_number;
  if (!address || String(address).toLowerCase().includes("configure")) return null;
  return {
    id: row.id,
    name: row.name,
    network: details.network ?? row.name,
    address: String(address),
    currency: details.currency ?? details.symbol ?? (String(details.network ?? row.name).toLowerCase().includes("bitcoin") ? "BTC" : String(details.network ?? row.name).toLowerCase().includes("solana") ? "SOL" : String(details.network ?? row.name).toLowerCase().includes("bnb") ? "BNB" : "ETH"),
    scheme: details.scheme ?? (String(details.network ?? row.name).toLowerCase().includes("solana") ? "solana" : String(details.network ?? row.name).toLowerCase().includes("bitcoin") ? "bitcoin" : "ethereum"),
    instructions: row.instructions,
  };
}

function buildWalletUri(wallet: NormalizedWallet, amount: number, reference: string) {
  const safeAddress = wallet.address.trim();
  const safeAmount = amount.toFixed(2);
  const label = encodeURIComponent("fivberfinancial intensive payment");
  const message = encodeURIComponent(reference);

  if (wallet.scheme === "bitcoin") {
    return `bitcoin:${safeAddress}?amount=${safeAmount}&label=${label}&message=${message}`;
  }

  if (wallet.scheme === "solana") {
    return `solana:${safeAddress}?amount=${safeAmount}&label=${label}&message=${message}`;
  }

  const chainId = wallet.network.toLowerCase().includes("bnb") ? "&chainId=56" : "";
  return `ethereum:${safeAddress}?amount=${safeAmount}${chainId}&label=${label}&message=${message}`;
}

function buildUniversalWalletLink(wallet: NormalizedWallet, amount: number, reference: string) {
  const safeAddress = encodeURIComponent(wallet.address.trim());
  const safeAmount = encodeURIComponent(amount.toFixed(2));
  const safeReference = encodeURIComponent(reference);
  const network = wallet.network.toLowerCase();

  // Browser-safe universal links prevent desktop errors like
  // "scheme does not have a registered handler". On phones, compatible wallet
  // apps can still intercept these links. On desktop, users get a safe page
  // instead of a broken custom-protocol launch.
  if (network.includes("bitcoin") || wallet.scheme === "bitcoin") {
    return `https://link.trustwallet.com/send?coin=0&address=${safeAddress}&amount=${safeAmount}&memo=${safeReference}`;
  }

  if (network.includes("solana") || wallet.scheme === "solana") {
    return `https://link.trustwallet.com/send?coin=501&address=${safeAddress}&amount=${safeAmount}&memo=${safeReference}`;
  }

  if (network.includes("bnb") || network.includes("smart chain")) {
    return `https://link.trustwallet.com/send?coin=20000714&address=${safeAddress}&amount=${safeAmount}&memo=${safeReference}`;
  }

  return `https://link.trustwallet.com/send?coin=60&address=${safeAddress}&amount=${safeAmount}&memo=${safeReference}`;
}

function buildWalletInstruction(wallet: NormalizedWallet, amount: number, reference: string) {
  return [
    wallet.name,
    `Network: ${wallet.network}`,
    `Wallet address: ${wallet.address}`,
    `Attached 30% intensive payment amount: ${formatCurrency(amount)}`,
    `Reference: ${reference}`,
    "Note: If your wallet app does not prefill the amount, paste this exact amount and reference manually.",
  ].join("\n");
}

function readSearchValue(search: URLSearchParams, key: string, fallback = "") {
  const raw = search.get(key);
  if (raw === null) return fallback;
  const decoded = decodeURIComponent(raw).trim();
  try {
    const parsed = JSON.parse(decoded);
    return parsed === null || parsed === undefined ? fallback : String(parsed);
  } catch {
    return decoded.replace(/^['"]|['"]$/g, "");
  }
}

function readSearchNumber(search: URLSearchParams, key: string) {
  const text = readSearchValue(search, key);
  const cleaned = text.replace(/[^0-9.-]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

export function IntensivePaymentPage() {
  const [wallets, setWallets] = useState<NormalizedWallet[]>(fallbackWallets);
  const [loadingWallet, setLoadingWallet] = useState<string | null>(null);
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const withdrawalId = readSearchValue(search, "withdrawalId");
  const reference = readSearchValue(search, "reference", "FIVB-INTENSIVE-PENDING");
  const withdrawalAmount = readSearchNumber(search, "withdrawalAmount");
  const explicitIntensiveAmount = readSearchNumber(search, "intensiveAmount") || readSearchNumber(search, "loanAmount") || readSearchNumber(search, "interestAmount");
  const intensiveAmount = explicitIntensiveAmount > 0 ? explicitIntensiveAmount : Number((withdrawalAmount * 0.3).toFixed(2));

  useEffect(() => {
    (async () => {
      const { data } = await db
        .from("payment_methods")
        .select("id,name,type,instructions,details")
        .eq("active", true)
        .eq("type", "crypto")
        .order("name", { ascending: true });
      const normalized = ((data ?? []) as WalletMethod[]).map(normalizeWallet).filter(Boolean) as NormalizedWallet[];
      if (normalized.length) setWallets(normalized);
    })();
  }, []);

  const validAmount = Number.isFinite(intensiveAmount) && intensiveAmount > 0;
  const paymentLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, []);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Unable to copy");
    }
  };

  const openWallet = async (wallet: NormalizedWallet) => {
    if (!validAmount) return toast.error("Missing intensive payment amount");
    const uri = buildWalletUri(wallet, intensiveAmount, reference);
    const universalLink = buildUniversalWalletLink(wallet, intensiveAmount, reference);
    const instruction = buildWalletInstruction(wallet, intensiveAmount, reference);
    setLoadingWallet(wallet.id);

    // Recording the selected wallet is useful for admin review, but it must not block
    // the user from opening the wallet link. This keeps the button active even when
    // the link was copied/shared, the withdrawal is not found, or Supabase is slow.
    if (withdrawalId) {
      const payload = {
        _withdrawal_id: withdrawalId,
        _intensive_amount: intensiveAmount,
        _wallet_name: wallet.name,
        _wallet_address: wallet.address,
        _wallet_uri: uri,
        _reference: reference,
      };
      let { error } = await db.rpc("record_withdrawal_payment_intent", payload);

      // Backward compatibility for databases that still have the old RPC parameter name.
      if (error && /loan_amount|intensive_amount|parameter/i.test(error.message ?? "")) {
        const legacyPayload = {
          _withdrawal_id: withdrawalId,
          _loan_amount: intensiveAmount,
          _wallet_name: wallet.name,
          _wallet_address: wallet.address,
          _wallet_uri: uri,
          _reference: reference,
        };
        const legacyResult = await db.rpc("record_withdrawal_payment_intent", legacyPayload);
        error = legacyResult.error;
      }

      if (error) toast.warning("Wallet link will still open. Admin record can be reviewed manually if this withdrawal is not found.");
    }

    try {
      await navigator.clipboard?.writeText(instruction);
    } catch {
      // Copy is helpful, but not required.
    }

    const opened = window.open(universalLink, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = universalLink;
    }

    toast.success("Wallet payment details copied. Complete payment in your wallet app.");
    setTimeout(() => setLoadingWallet(null), 1500);
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">30% intensive payment link</h1>
          <p className="mt-2 max-w-3xl text-base text-muted-foreground">
            Choose one wallet below. The intensive payment amount is already attached to the wallet link, so the user does not need to enter the amount again.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-primary dark:border-blue-400/20 dark:bg-blue-400/10">
          Payment
        </Badge>
      </div>

      <Card className="overflow-hidden rounded-[1.75rem] border-border/70 bg-card shadow-soft">
        <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-gradient-primary p-7 text-primary-foreground md:p-8">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-white/75">
              <FileText className="h-4 w-4" /> Payment receipt summary
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Summary label="Withdrawal request" value={withdrawalAmount > 0 ? formatCurrency(withdrawalAmount) : "Pending"} />
              <Summary label="30% intensive payment" value={validAmount ? formatCurrency(intensiveAmount) : "Missing amount"} highlight />
              <Summary label="Reference" value={reference} mono />
              <Summary label="Status" value="Awaiting wallet payment" />
            </div>
            <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm leading-relaxed text-white/85 ring-1 ring-white/15">
              This does not create a separate intensive account. It simply records that this withdrawal has a 30% payment instruction before administrator processing.
            </div>
          </div>

          <div className="space-y-4 p-7 md:p-8">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-primary dark:bg-blue-400/10"><ShieldCheck className="h-6 w-6" /></span>
              <div>
                <h2 className="font-display text-2xl font-bold">Step-by-step instruction</h2>
                <p className="text-sm text-muted-foreground">Open a browser-safe wallet link, complete payment, then return to wait for admin review.</p>
              </div>
            </div>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="rounded-2xl border border-border/70 bg-secondary/40 p-4"><b className="text-foreground">1.</b> Select Bitcoin, Ethereum, BNB, or Solana.</li>
              <li className="rounded-2xl border border-border/70 bg-secondary/40 p-4"><b className="text-foreground">2.</b> Tap <b className="text-foreground">Open wallet with amount</b>. A browser-safe wallet link opens and the payment amount/reference are copied automatically.</li>
              <li className="rounded-2xl border border-border/70 bg-secondary/40 p-4"><b className="text-foreground">3.</b> Complete the payment inside your wallet app and keep the transaction hash or screenshot.</li>
              <li className="rounded-2xl border border-border/70 bg-secondary/40 p-4"><b className="text-foreground">4.</b> Admin reviews the withdrawal and payment instruction before changing the withdrawal status.</li>
            </ol>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="rounded-xl" onClick={() => copyText(paymentLink, "Payment link")}> <Copy className="mr-2 h-4 w-4" /> Copy payment link</Button>
              <Link to="/withdraw"><Button variant="ghost" className="rounded-xl">Back to withdrawal</Button></Link>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {wallets.map((wallet) => {
          const uri = validAmount ? buildWalletUri(wallet, intensiveAmount, reference) : "";
          const universalLink = validAmount ? buildUniversalWalletLink(wallet, intensiveAmount, reference) : "";
          const instruction = validAmount ? buildWalletInstruction(wallet, intensiveAmount, reference) : "";
          const isLoading = loadingWallet === wallet.id;
          return (
            <Card key={wallet.id} className="flex min-w-0 flex-col rounded-[1.5rem] border-border/70 bg-card p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-primary dark:bg-blue-400/10"><WalletCards className="h-6 w-6" /></span>
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg font-bold" title={wallet.name}>{wallet.name}</h3>
                  <p className="truncate text-sm text-muted-foreground" title={wallet.network}>{wallet.network}</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-border/70 bg-secondary/40 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Wallet address</div>
                <div className="mt-1 break-all font-mono text-xs font-semibold">{wallet.address}</div>
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm dark:border-emerald-400/20 dark:bg-emerald-400/10">
                <div className="text-xs font-medium text-muted-foreground">Attached amount</div>
                <div className="font-display text-xl font-bold text-emerald-700 dark:text-emerald-300">{validAmount ? formatCurrency(intensiveAmount) : "Enter withdrawal amount"}</div>
              </div>
              {wallet.instructions && <p className="mt-3 text-xs text-muted-foreground">{wallet.instructions}</p>}
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">
                <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Desktop browsers may not open crypto URI schemes directly. This button uses a browser-safe wallet link and also copies the exact details.</span>
              </div>
              <div className="mt-auto flex flex-col gap-2 pt-4">
                <Button className="rounded-xl bg-gradient-primary text-primary-foreground" disabled={isLoading} onClick={() => openWallet(wallet)}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                  Open wallet with amount
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => copyText(`${instruction}\nWallet app URI: ${uri}\nBrowser-safe link: ${universalLink}`, "Wallet details")}> <Copy className="mr-2 h-4 w-4" /> Copy details</Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-[1.5rem] border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-800 shadow-soft dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
        Wallet apps handle payment links differently. The button now uses a browser-safe wallet link to avoid desktop “scheme has no registered handler” errors. If a wallet app does not prefill the amount, use the copied wallet details and reference shown above. The fivberfinancial record still keeps the exact 30% intensive payment amount.
      </Card>
    </div>
  );
}

function Summary({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
      <div className="text-xs font-medium text-white/65">{label}</div>
      <div className={`mt-1 truncate text-xl font-extrabold ${highlight ? "text-emerald-200" : "text-white"} ${mono ? "font-mono text-sm" : "font-display"}`} title={value}>{value}</div>
    </div>
  );
}

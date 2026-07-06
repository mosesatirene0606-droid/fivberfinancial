export const BRAND_NAME = "fivberfinancial";
export const BRAND_LEGAL_NAME = "fivberfinancial Investment & Brokerage";
export const BRAND_TAGLINE = "Premium investment access. Secure brokerage control.";
export const SUPPORT_EMAIL = "support@fivberfinancial.com";

export const formatCurrency = (value: number | string | null | undefined, currency = "USD") => {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
};

export const formatPercent = (value: number | string | null | undefined) => {
  const amount = Number(value ?? 0);
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
};

export const statusClass = (status?: string | null) => {
  const normalized = (status ?? "").toLowerCase();
  if (["approved", "active", "completed", "paid"].includes(normalized)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["pending", "processing", "under_review"].includes(normalized)) return "border-blue-200 bg-blue-50 text-blue-700";
  if (["rejected", "cancelled", "expired", "suspended"].includes(normalized)) return "border-red-200 bg-red-50 text-red-700";
  return "border-border bg-secondary text-muted-foreground";
};

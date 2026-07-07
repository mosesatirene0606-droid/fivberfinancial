export const BRAND_NAME = "fivberfinancial";
export const BRAND_LEGAL_NAME = "fivberfinancial Investment & Brokerage";
export const BRAND_TAGLINE = "Premium investment access. Secure brokerage control.";
export const SUPPORT_EMAIL = "support@fivberfinancial.com";

export const BRAND = {
  name: BRAND_NAME,
  legalName: BRAND_LEGAL_NAME,
  tagline: BRAND_TAGLINE,
  shortName: "Fivber",
  supportEmail: SUPPORT_EMAIL,
  assets: {
    icon: "/brand/logo-icon.png",
    loaderRef: "/brand/logo-loader-ref.png",
    stacked: "/brand/logo-stacked.png",
    mark: "/brand/logo-mark.png",
    horizontal: "/brand/logo-horizontal.png",
  },
};

export const formatCurrency = (
  value: number | string | null | undefined,
  currency = "USD",
) => {
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

  return `${Number.isFinite(amount) ? amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"}%`;
};

export const statusClass = (status?: string | null) => {
  const normalized = (status ?? "").toLowerCase();

  if (["approved", "active", "completed", "paid", "verified"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";
  }

  if (["pending", "processing", "under_review", "in_review"].includes(normalized)) {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300";
  }

  if (["rejected", "cancelled", "expired", "suspended", "failed"].includes(normalized)) {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300";
  }

  return "border-border bg-secondary text-muted-foreground";
};

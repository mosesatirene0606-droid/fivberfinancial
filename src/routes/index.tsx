import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Sparkles,
  LineChart,
  Lock,
  CheckCircle2,
  BadgeDollarSign,
  FileCheck2,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export const Route = createFileRoute("/")({ component: Landing });

const plans = [
  { name: "Starter", min: "$100", max: "$1,000", roi: "1.2%", duration: "30 days" },
  { name: "Silver", min: "$1,000", max: "$5,000", roi: "1.8%", duration: "45 days", popular: true },
  { name: "Gold", min: "$5,000", max: "$20,000", roi: "2.5%", duration: "60 days" },
  { name: "VIP", min: "$20,000", max: "Unlimited", roi: "3.2%", duration: "90 days" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold lowercase">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-soft">
              <TrendingUp className="h-4 w-4" />
            </span>
            {BRAND_NAME}
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#plans" className="hover:text-foreground">Plans</a>
            <a href="#security" className="hover:text-foreground">Security</a>
            <a href="#admin" className="hover:text-foreground">Admin</a>
          </nav>
          <Link to="/auth">
            <Button className="rounded-full bg-gradient-primary text-primary-foreground shadow-soft">
              Secure login <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="absolute left-1/2 top-8 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
        <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              {BRAND_TAGLINE}
            </div>
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-foreground md:text-7xl">
              Build wealth with
              <span className="block bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                confidence and control.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              A clean, premium investment and brokerage platform with admin-controlled onboarding, KYC verification, configurable plans, deposits, withdrawals, and transparent portfolio analytics.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link to="/auth">
                <Button size="lg" className="h-12 rounded-full bg-gradient-primary px-7 text-primary-foreground shadow-elegant transition-transform hover:scale-[1.02]">
                  Access your account <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="#plans">
                <Button size="lg" variant="outline" className="h-12 rounded-full px-7">
                  Explore plans
                </Button>
              </a>
            </div>

            <div className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-3 md:gap-6">
              {[
                { k: "Admin", v: "controlled accounts" },
                { k: "KYC", v: "required access" },
                { k: "Audit", v: "tracked actions" },
              ].map((s) => (
                <div key={s.v} className="rounded-2xl border border-border/60 bg-card/75 p-4 shadow-soft backdrop-blur">
                  <div className="font-display text-2xl font-bold text-foreground md:text-3xl">{s.k}</div>
                  <div className="mt-1 text-xs text-muted-foreground md:text-sm">{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight">A platform built for trust</h2>
          <p className="mt-4 text-muted-foreground">Every core brokerage action is designed around verification, admin approval, and clean financial records.</p>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            { icon: LineChart, title: "Portfolio analytics", body: "Beautiful dashboard cards and charts for balance, invested capital, daily earnings, profit, withdrawals, deposits, and performance." },
            { icon: Wallet, title: "Controlled withdrawals", body: "Verified users request withdrawals, while administrators approve, reject, process, and mark payouts as paid." },
            { icon: ShieldCheck, title: "KYC-first access", body: "Selfie, identity document, address proof, phone, and email verification before investing or withdrawing." },
          ].map((f) => (
            <div key={f.title} className="group rounded-3xl border border-border/60 bg-gradient-card p-8 shadow-soft transition-all hover:-translate-y-1 hover:shadow-elegant">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-xl font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="plans" className="border-y border-border/60 bg-secondary/40">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-4xl font-bold tracking-tight">Configurable investment plans</h2>
            <p className="mt-4 text-muted-foreground">The administrator controls ROI, duration, minimum, maximum, and plan availability.</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <div key={p.name} className={`relative rounded-3xl border p-7 transition-all ${p.popular ? "border-transparent bg-gradient-primary text-primary-foreground shadow-elegant" : "border-border/60 bg-card shadow-soft hover:shadow-elegant"}`}>
                {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">Popular</span>}
                <h3 className="font-display text-2xl font-bold">{p.name}</h3>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between"><span className={p.popular ? "text-primary-foreground/70" : "text-muted-foreground"}>Minimum</span><span>{p.min}</span></div>
                  <div className="flex justify-between"><span className={p.popular ? "text-primary-foreground/70" : "text-muted-foreground"}>Maximum</span><span>{p.max}</span></div>
                  <div className="flex justify-between"><span className={p.popular ? "text-primary-foreground/70" : "text-muted-foreground"}>Daily ROI</span><span>{p.roi}</span></div>
                  <div className="flex justify-between"><span className={p.popular ? "text-primary-foreground/70" : "text-muted-foreground"}>Duration</span><span>{p.duration}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent-foreground"><Lock className="h-5 w-5" /></div>
            <h2 className="font-display text-4xl font-bold tracking-tight">Security and compliance by design</h2>
            <p className="mt-4 text-muted-foreground">User accounts are created only by administrators. New users must change temporary passwords and complete KYC before they can access sensitive financial features.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Admin-only account creation",
              "Password hashing via Supabase Auth",
              "Forgot and reset password flow",
              "Login history and device tracking",
              "KYC status enforcement",
              "Audited deposit and withdrawal actions",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
                <CheckCircle2 className="h-5 w-5 text-accent" />
                <span className="text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="admin" className="bg-gradient-hero px-6 py-24">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-border/70 bg-card/80 p-8 shadow-elegant backdrop-blur md:p-12">
          <div className="grid gap-10 lg:grid-cols-3">
            {[
              { icon: Building2, title: "Admin dashboard", body: "Track total users, pending KYC, deposits, withdrawals, investments, platform revenue, and system activity." },
              { icon: BadgeDollarSign, title: "Financial controls", body: "Credit, debit, issue bonuses, approve deposits, process withdrawals, configure plans, and pause offerings." },
              { icon: FileCheck2, title: "Content and settings", body: "Manage pages, FAQs, announcements, banners, payment methods, currency, timezone, and security settings." },
            ].map((item) => (
              <div key={item.title}>
                <item.icon className="h-8 w-8 text-primary" />
                <h3 className="mt-4 font-display text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 px-6 py-10 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {BRAND_NAME}. Premium investment and brokerage web platform.
      </footer>
    </div>
  );
}

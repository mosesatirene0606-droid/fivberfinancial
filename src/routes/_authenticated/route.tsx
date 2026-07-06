import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowUpRight,
  Bell,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  TrendingUp,
  UserCircle2,
  Wallet,
  X,
} from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { db, getIsAdmin } from "@/lib/supabase-helpers";
import { COUNTRIES, COUNTRY_EVENT, getStoredCountry, saveCountryPreference } from "@/lib/locale";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const baseNav = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/invest", icon: TrendingUp, label: "Invest" },
  { to: "/deposit", icon: Landmark, label: "Deposit" },
  { to: "/withdraw", icon: ArrowUpRight, label: "Withdraw" },
  { to: "/transactions", icon: Wallet, label: "Transactions" },
  { to: "/kyc", icon: ShieldCheck, label: "KYC Center" },
] as const;

const adminNav = { to: "/admin", icon: Settings, label: "Admin" } as const;
const bottomNav = [baseNav[0], baseNav[1], baseNav[2], baseNav[3], baseNav[4]] as const;

type NotificationRow = { id: string; title: string; body: string | null; type: string; read_at: string | null; created_at: string };

function AuthedLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [country, setCountry] = useState(getStoredCountry());

  const nav = useMemo(() => (isAdmin ? [...baseNav, adminNav] : baseNav), [isAdmin]);

  useEffect(() => {
    const preferred = localStorage.getItem("fivberfinancial.theme");
    const nextDark = preferred ? preferred === "dark" : document.documentElement.classList.contains("dark");
    setDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    const storedCountry = getStoredCountry();
    setCountry(storedCountry);
    document.documentElement.lang = storedCountry.locale;
    const onCountryChange = (event: Event) => setCountry((event as CustomEvent).detail ?? getStoredCountry());
    window.addEventListener(COUNTRY_EVENT, onCountryChange);
    return () => window.removeEventListener(COUNTRY_EVENT, onCountryChange);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
      if (data.user) {
        setIsAdmin(await getIsAdmin(data.user.id));
        const [{ data: profile }, { count }, recent] = await Promise.all([
          db.from("profiles").select("full_name,country_code").eq("id", data.user.id).maybeSingle(),
          db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", data.user.id).is("read_at", null),
          db.from("notifications").select("id,title,body,type,read_at,created_at").eq("user_id", data.user.id).order("created_at", { ascending: false }).limit(8),
        ]);
        setName(profile?.full_name?.split(" ")[0] ?? data.user.email?.split("@")[0] ?? "User");
        if (profile?.country_code) setCountry(saveCountryPreference(profile.country_code));
        setUnread(count ?? 0);
        setNotifications((recent.data ?? []) as NotificationRow[]);
      }
    })();
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("fivberfinancial.theme", next ? "dark" : "light");
  };

  const changeCountry = async (code: string) => {
    const next = saveCountryPreference(code);
    setCountry(next);
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await db.from("profiles").update({
        country_code: next.code,
        country_name: next.name,
        locale: next.locale,
        phone_country_code: next.phoneCode,
      }).eq("id", data.user.id);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const markNotificationsRead = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const readAt = new Date().toISOString();
    await db.from("notifications").update({ read_at: readAt }).eq("user_id", data.user.id).is("read_at", null);
    setNotifications((rows) => rows.map((row) => ({ ...row, read_at: row.read_at ?? readAt })));
    setUnread(0);
  };

  const handleNotificationOpen = (open: boolean) => {
    setNotificationOpen(open);
    if (open && unread > 0) void markNotificationsRead();
  };

  const NavItems = ({ compact = false }: { compact?: boolean }) => (
    <nav className={compact ? "grid gap-1" : "flex-1 space-y-1"}>
      {nav.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          onClick={() => setMobileOpen(false)}
          className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground [&.active]:bg-gradient-primary [&.active]:text-primary-foreground [&.active]:shadow-soft"
          activeProps={{ className: "active" }}
        >
          <n.icon className="h-4 w-4" />
          {n.label}
          {n.label === "KYC Center" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-warning" />}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-secondary/40 dark:bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] flex-col border-r border-border/60 bg-card/95 p-5 shadow-soft backdrop-blur md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-1 font-display text-xl font-bold">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-soft">
            <TrendingUp className="h-5 w-5" />
          </span>
          <span className="lowercase">{BRAND_NAME}</span>
        </Link>
        <NavItems />
        <div className="mt-6 space-y-4">
          <div className="rounded-3xl border border-border/60 bg-gradient-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-accent" /> KYC Status</div>
            <p className="text-xs text-muted-foreground">Verification keeps withdrawals and investment access protected.</p>
            <Link to="/kyc"><Button variant="outline" size="sm" className="mt-4 w-full rounded-xl">Complete KYC</Button></Link>
          </div>
          <div className="rounded-3xl border border-border/60 bg-secondary/50 p-4">
            <div className="truncate text-xs text-muted-foreground">Signed in as</div>
            <div className="truncate text-sm font-semibold">{email}</div>
            <Button variant="ghost" size="sm" onClick={signOut} className="mt-3 h-8 w-full justify-start rounded-xl text-muted-foreground">
              <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur md:hidden">
          <div className="h-full w-80 max-w-[88vw] border-r border-border bg-card p-6 shadow-elegant">
            <div className="mb-8 flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2 font-display font-bold lowercase">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground"><TrendingUp className="h-4 w-4" /></span> {BRAND_NAME}
              </Link>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="rounded-full"><X className="h-4 w-4" /></Button>
            </div>
            <NavItems compact />
            <Button variant="ghost" size="sm" onClick={signOut} className="mt-8 h-10 w-full justify-start rounded-xl text-muted-foreground">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      )}

      <div className="min-w-0 overflow-x-hidden md:pl-[280px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-card/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} className="rounded-full"><Menu className="h-4 w-4" /></Button>
            <div className="font-display font-bold lowercase">{BRAND_NAME}</div>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></div>
            <span className="text-sm font-medium text-muted-foreground">Secure investment workspace</span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-2">
            <div className="relative hidden w-full max-w-sm lg:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 rounded-2xl border-border/70 bg-background/80 pl-9" placeholder="Search anything..." />
            </div>
            <Select value={country.code} onValueChange={changeCountry}>
              <SelectTrigger className="h-10 w-[92px] rounded-full border-border/70 bg-background/80 px-2 text-xs md:w-[118px]">
                <SelectValue aria-label="Country">
                  <span className="flex items-center gap-1.5"><span className="text-base">{country.flag}</span><span className="hidden md:inline">{country.code}</span></span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end" className="max-h-80 rounded-2xl">
                {COUNTRIES.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    <span className="flex items-center gap-2"><span>{item.flag}</span><span>{item.name}</span><span className="text-muted-foreground">{item.phoneCode}</span></span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full" aria-label="Toggle dark mode">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full"><HelpCircle className="h-4 w-4" /></Button>
            <Popover open={notificationOpen} onOpenChange={handleNotificationOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-full">
                  <Bell className="h-4 w-4" />
                  {unread > 0 && <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{unread}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 rounded-3xl p-0 shadow-elegant">
                <div className="flex items-center justify-between border-b border-border/70 p-4">
                  <div>
                    <div className="font-display font-bold">Notifications</div>
                    <div className="text-xs text-muted-foreground">Balance credits and account updates appear here.</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={markNotificationsRead} className="rounded-xl text-primary">Mark read</Button>
                </div>
                <div className="max-h-96 overflow-y-auto p-2">
                  {notifications.length ? notifications.map((note) => (
                    <div key={note.id} className={`rounded-2xl p-3 ${note.read_at ? "" : "bg-primary/5"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{note.title}</div>
                          {note.body && <div className="mt-1 text-xs text-muted-foreground">{note.body}</div>}
                        </div>
                        {!note.read_at && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">{new Date(note.created_at).toLocaleString()}</div>
                    </div>
                  )) : <div className="p-8 text-center text-sm text-muted-foreground">No notifications yet.</div>}
                </div>
              </PopoverContent>
            </Popover>
            <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-background/70 py-1 pl-1 pr-3 md:flex">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground"><UserCircle2 className="h-5 w-5" /></span>
              <span className="text-sm font-semibold">{name || "User"}</span>
            </div>
          </div>
        </header>
        <main className="min-w-0 overflow-x-hidden p-4 pb-28 md:p-8 lg:p-10">
          <Outlet />
        </main>
      </div>

      <Link to="/deposit" className="fixed bottom-8 left-1/2 z-40 inline-flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow md:hidden">
        <Plus className="h-6 w-6" />
      </Link>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border/60 bg-card/95 px-2 pb-2 pt-2 shadow-elegant backdrop-blur md:hidden">
        {bottomNav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors [&.active]:text-primary"
            activeProps={{ className: "active" }}
          >
            <n.icon className="h-4 w-4" />
            {n.label === "Transactions" ? "More" : n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

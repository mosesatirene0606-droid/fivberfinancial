import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, UploadCloud, Loader2, FileCheck2, Smartphone, MailCheck, CheckCircle2, Globe2, Home } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db, getKycStatus, uploadPrivateFile } from "@/lib/supabase-helpers";
import { statusClass } from "@/lib/brand";
import { COUNTRIES, COUNTRY_EVENT, getStoredCountry, saveCountryPreference, t } from "@/lib/locale";

export const Route = createFileRoute("/_authenticated/kyc")({ component: KycPage });

type FileKey = "selfie" | "governmentId" | "passport" | "driverLicense" | "nationalId" | "utilityBill" | "proofOfAddress";

type KycState = {
  status: string;
  admin_notes?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
};

const fileFields: { key: FileKey; label: string; required?: boolean; hint: string }[] = [
  { key: "selfie", label: "Selfie capture", required: true, hint: "Clear live selfie or photo" },
  { key: "governmentId", label: "Government-issued ID", required: true, hint: "Passport, national ID, or voter card" },
  { key: "passport", label: "Passport upload", hint: "Optional passport page" },
  { key: "driverLicense", label: "Driver's License", hint: "Optional driver license" },
  { key: "nationalId", label: "National ID", hint: "Optional national ID" },
  { key: "utilityBill", label: "Utility Bill", required: true, hint: "Recent bill or address document" },
  { key: "proofOfAddress", label: "Proof of address", required: true, hint: "Bank statement, tenancy proof, or utility document" },
];

const steps = ["Country and phone", "Address details", "Documents", "Review and submit"];

function KycPage() {
  const [kyc, setKyc] = useState<KycState>({ status: "pending" });
  const [country, setCountry] = useState(getStoredCountry());
  const [phoneCode, setPhoneCode] = useState(getStoredCountry().phoneCode);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [files, setFiles] = useState<Partial<Record<FileKey, File>>>({});
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

  const language = country.language;
  const stepProgress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const [profile, status] = await Promise.all([
        db.from("profiles").select("phone,country_code,phone_country_code").eq("id", userData.user.id).maybeSingle(),
        getKycStatus(userData.user.id),
      ]);
      const storedCountry = profile.data?.country_code ? saveCountryPreference(profile.data.country_code) : getStoredCountry();
      setCountry(storedCountry);
      setPhoneCode(profile.data?.phone_country_code ?? storedCountry.phoneCode);
      setPhone((profile.data?.phone ?? "").replace(profile.data?.phone_country_code ?? storedCountry.phoneCode, "").trim());
      if (status) setKyc(status as KycState);
    })();

    const onCountryChange = (event: Event) => {
      const next = (event as CustomEvent).detail ?? getStoredCountry();
      setCountry(next);
      setPhoneCode((current) => current || next.phoneCode);
    };
    window.addEventListener(COUNTRY_EVENT, onCountryChange);
    return () => window.removeEventListener(COUNTRY_EVENT, onCountryChange);
  }, []);

  const updateCountry = async (code: string) => {
    const next = saveCountryPreference(code);
    setCountry(next);
    setPhoneCode(next.phoneCode);
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await db.from("profiles").update({ country_code: next.code, country_name: next.name, locale: next.locale, phone_country_code: next.phoneCode }).eq("id", userData.user.id);
    }
  };

  const validateStep = (targetStep = step) => {
    if (targetStep === 0) {
      if (!phone.trim()) return toast.error("Phone number is required"), false;
    }
    if (targetStep === 1) {
      if (!address.trim()) return toast.error("Proof of address details are required"), false;
    }
    if (targetStep === 2) {
      for (const field of fileFields.filter((f) => f.required)) {
        if (!files[field.key]) return toast.error(`${field.label} is required`), false;
      }
    }
    return true;
  };

  const nextStep = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (![0, 1, 2].every((index) => validateStep(index))) return;
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("You must be signed in");
      const entries = await Promise.all(fileFields.map(async (field) => [field.key, await uploadPrivateFile("kyc-documents", userData.user!.id, files[field.key])] as const));
      const documentUrls = Object.fromEntries(entries.filter(([, value]) => Boolean(value)));
      const fullPhone = phone.trim().startsWith("+") ? phone.trim() : `${phoneCode} ${phone.trim()}`;
      await db.from("profiles").update({
        phone: fullPhone,
        country_code: country.code,
        country_name: country.name,
        locale: country.locale,
        phone_country_code: phoneCode,
      }).eq("id", userData.user.id);
      const { error } = await db.from("kyc_submissions").insert({
        user_id: userData.user.id,
        status: "pending",
        document_urls: documentUrls,
        proof_of_address: address,
        notes: `Submitted from user dashboard • ${country.name}`,
      });
      if (error) throw error;
      setKyc({ status: "pending", submitted_at: new Date().toISOString() });
      setFiles({});
      setStep(3);
      toast.success("KYC submitted for admin review");
    } catch (error: any) {
      toast.error(error.message ?? "Unable to submit KYC");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{t("Identity verification", language)}</h1>
          <p className="mt-1 text-muted-foreground">{t("Complete KYC to unlock investment activation and withdrawals.", language)}</p>
        </div>
        <Badge variant="outline" className={statusClass(kyc.status)}>Status: {kyc.status.replace("_", " ")}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <Card className="rounded-3xl border-border/60 bg-gradient-card p-6 shadow-soft">
            <ShieldCheck className="mb-4 h-10 w-10 text-accent" />
            <h2 className="font-display text-xl font-semibold">Verification checklist</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your documents are reviewed by an administrator. You may be asked to resubmit clearer documents where needed.</p>
            <div className="mt-5 space-y-3">
              {[
                { icon: Globe2, text: `${country.flag} ${country.name} • ${phoneCode}` },
                { icon: FileCheck2, text: "Upload selfie and identity documents" },
                { icon: Smartphone, text: "Provide a valid phone number" },
                { icon: MailCheck, text: "Use a verified email account" },
              ].map((item) => <div key={item.text} className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-3 text-sm"><item.icon className="h-4 w-4 text-primary" /> {item.text}</div>)}
            </div>
          </Card>

          {kyc.admin_notes && (
            <Card className="rounded-3xl border-red-100 bg-red-50/70 p-6 text-red-800 shadow-soft dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-100">
              <h2 className="font-display text-lg font-semibold">Admin note</h2>
              <p className="mt-2 text-sm">{kyc.admin_notes}</p>
            </Card>
          )}
        </div>

        <Card className="rounded-3xl border-border/60 bg-card p-6 shadow-soft">
          <div className="mb-6">
            <div className="mb-3 flex flex-wrap gap-2">
              {steps.map((item, index) => (
                <button key={item} type="button" onClick={() => index <= step && setStep(index)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${index === step ? "bg-primary text-primary-foreground" : index < step ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-secondary text-muted-foreground"}`}>
                  {index < step ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : null}{index + 1}. {t(item, language)}
                </button>
              ))}
            </div>
            <Progress value={stepProgress} className="h-2" />
          </div>

          <form onSubmit={submit} className="space-y-5">
            {step === 0 && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">{t("Select your country to localize this form. The phone code updates automatically.", language)}</div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("Country of residence", language)}</Label>
                    <Select value={country.code} onValueChange={updateCountry}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-80 rounded-2xl">
                        {COUNTRIES.map((item) => <SelectItem key={item.code} value={item.code}>{item.flag} {item.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("Phone number", language)}</Label>
                    <div className="grid grid-cols-[115px_1fr] gap-2">
                      <Select value={`${country.code}|${phoneCode}`} onValueChange={(value) => {
                        const selected = COUNTRIES.find((item) => `${item.code}|${item.phoneCode}` === value);
                        if (selected) setPhoneCode(selected.phoneCode);
                      }}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-80 rounded-2xl">
                          {COUNTRIES.map((item) => <SelectItem key={`${item.code}-${item.phoneCode}`} value={`${item.code}|${item.phoneCode}`}>{item.flag} {item.phoneCode}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="h-11 rounded-xl" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email verification</Label>
                  <div className="flex h-11 items-center rounded-xl border border-border bg-secondary/50 px-3 text-sm text-muted-foreground">Handled by secure auth email flow</div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2">
                <Label>{t("Proof of address details", language)}</Label>
                <Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Residential address and any extra details for admin review" className="min-h-40 rounded-xl" />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 font-display text-lg font-bold"><Home className="h-5 w-5 text-primary" />{t("Upload required documents", language)}</div>
                <div className="grid gap-4 md:grid-cols-2">
                  {fileFields.map((field) => (
                    <label key={field.key} className="cursor-pointer rounded-2xl border border-dashed border-border bg-secondary/40 p-5 transition hover:bg-secondary/70">
                      <div className="flex items-center gap-3">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><UploadCloud className="h-4 w-4" /></div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{field.label}{field.required ? " *" : ""}</div>
                          <div className="truncate text-xs text-muted-foreground">{files[field.key]?.name ?? field.hint}</div>
                        </div>
                      </div>
                      <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setFiles((prev) => ({ ...prev, [field.key]: e.target.files?.[0] }))} />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="rounded-3xl border border-border bg-secondary/30 p-5">
                <h3 className="font-display text-xl font-bold">{t("Review and submit", language)}</h3>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <ReviewLine label="Country" value={`${country.flag} ${country.name}`} />
                  <ReviewLine label="Phone" value={`${phoneCode} ${phone}`} />
                  <ReviewLine label="Address" value={address || "Not added"} />
                  <ReviewLine label="Required docs" value={`${fileFields.filter((field) => field.required && files[field.key]).length}/4 uploaded`} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-3 pt-2">
              <Button type="button" variant="outline" disabled={step === 0 || loading} onClick={() => setStep((s) => Math.max(0, s - 1))} className="h-11 rounded-xl">{t("Back", language)}</Button>
              {step < steps.length - 1 ? (
                <Button type="button" onClick={nextStep} className="h-11 rounded-xl bg-gradient-primary text-primary-foreground">{t("Continue", language)}</Button>
              ) : (
                <Button disabled={loading} className="h-11 rounded-xl bg-gradient-primary text-primary-foreground shadow-soft">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t("Submit KYC for review", language)}
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-card p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 line-clamp-2 font-semibold">{value}</div></div>;
}

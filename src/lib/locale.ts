export type AppLanguage = "en" | "es" | "fr" | "de" | "pt" | "ar";

export type CountryOption = {
  code: string;
  name: string;
  flag: string;
  phoneCode: string;
  language: AppLanguage;
  locale: string;
};

export const COUNTRIES: CountryOption[] = [
  { code: "US", name: "United States", flag: "🇺🇸", phoneCode: "+1", language: "en", locale: "en-US" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", phoneCode: "+234", language: "en", locale: "en-NG" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", phoneCode: "+44", language: "en", locale: "en-GB" },
  { code: "ES", name: "Spain", flag: "🇪🇸", phoneCode: "+34", language: "es", locale: "es-ES" },
  { code: "FR", name: "France", flag: "🇫🇷", phoneCode: "+33", language: "fr", locale: "fr-FR" },
  { code: "DE", name: "Germany", flag: "🇩🇪", phoneCode: "+49", language: "de", locale: "de-DE" },
  { code: "PT", name: "Portugal", flag: "🇵🇹", phoneCode: "+351", language: "pt", locale: "pt-PT" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", phoneCode: "+971", language: "ar", locale: "ar-AE" },
  { code: "GH", name: "Ghana", flag: "🇬🇭", phoneCode: "+233", language: "en", locale: "en-GH" },
  { code: "KE", name: "Kenya", flag: "🇰🇪", phoneCode: "+254", language: "en", locale: "en-KE" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", phoneCode: "+27", language: "en", locale: "en-ZA" },
  { code: "CA", name: "Canada", flag: "🇨🇦", phoneCode: "+1", language: "en", locale: "en-CA" },
  { code: "AU", name: "Australia", flag: "🇦🇺", phoneCode: "+61", language: "en", locale: "en-AU" },
  { code: "IN", name: "India", flag: "🇮🇳", phoneCode: "+91", language: "en", locale: "en-IN" },
];

export const DEFAULT_COUNTRY_CODE = "US";
export const COUNTRY_STORAGE_KEY = "fivberfinancial.country";
export const COUNTRY_EVENT = "fivberfinancial:country-changed";

export function getCountry(code?: string | null) {
  return COUNTRIES.find((country) => country.code === code) ?? COUNTRIES.find((country) => country.code === DEFAULT_COUNTRY_CODE)!;
}

export function getStoredCountry() {
  if (typeof window === "undefined") return getCountry(DEFAULT_COUNTRY_CODE);
  return getCountry(localStorage.getItem(COUNTRY_STORAGE_KEY));
}

export function saveCountryPreference(code: string) {
  const country = getCountry(code);
  if (typeof window !== "undefined") {
    localStorage.setItem(COUNTRY_STORAGE_KEY, country.code);
    window.dispatchEvent(new CustomEvent(COUNTRY_EVENT, { detail: country }));
  }
  if (typeof document !== "undefined") document.documentElement.lang = country.locale;
  return country;
}

const dictionary: Record<string, Record<AppLanguage, string>> = {
  "Identity verification": { en: "Identity verification", es: "Verificación de identidad", fr: "Vérification d’identité", de: "Identitätsprüfung", pt: "Verificação de identidade", ar: "التحقق من الهوية" },
  "Complete KYC to unlock investment activation and withdrawals.": { en: "Complete KYC to unlock investment activation and withdrawals.", es: "Complete KYC para activar inversiones y retiros.", fr: "Complétez le KYC pour activer les investissements et les retraits.", de: "Schließen Sie KYC ab, um Investitionen und Auszahlungen freizuschalten.", pt: "Conclua o KYC para ativar investimentos e levantamentos.", ar: "أكمل التحقق لفتح الاستثمار والسحب." },
  "Country and phone": { en: "Country and phone", es: "País y teléfono", fr: "Pays et téléphone", de: "Land und Telefon", pt: "País e telefone", ar: "الدولة والهاتف" },
  "Address details": { en: "Address details", es: "Detalles de dirección", fr: "Détails de l’adresse", de: "Adressdaten", pt: "Detalhes do endereço", ar: "تفاصيل العنوان" },
  "Documents": { en: "Documents", es: "Documentos", fr: "Documents", de: "Dokumente", pt: "Documentos", ar: "المستندات" },
  "Review and submit": { en: "Review and submit", es: "Revisar y enviar", fr: "Vérifier et soumettre", de: "Prüfen und senden", pt: "Rever e enviar", ar: "مراجعة وإرسال" },
  "Country of residence": { en: "Country of residence", es: "País de residencia", fr: "Pays de résidence", de: "Wohnsitzland", pt: "País de residência", ar: "بلد الإقامة" },
  "Phone number": { en: "Phone number", es: "Número de teléfono", fr: "Numéro de téléphone", de: "Telefonnummer", pt: "Número de telefone", ar: "رقم الهاتف" },
  "Continue": { en: "Continue", es: "Continuar", fr: "Continuer", de: "Weiter", pt: "Continuar", ar: "متابعة" },
  "Back": { en: "Back", es: "Atrás", fr: "Retour", de: "Zurück", pt: "Voltar", ar: "رجوع" },
  "Submit KYC for review": { en: "Submit KYC for review", es: "Enviar KYC para revisión", fr: "Soumettre le KYC pour examen", de: "KYC zur Prüfung senden", pt: "Enviar KYC para revisão", ar: "إرسال التحقق للمراجعة" },
  "Proof of address details": { en: "Proof of address details", es: "Detalles de comprobante de domicilio", fr: "Détails du justificatif d’adresse", de: "Angaben zum Adressnachweis", pt: "Detalhes do comprovativo de morada", ar: "تفاصيل إثبات العنوان" },
  "Upload required documents": { en: "Upload required documents", es: "Subir documentos requeridos", fr: "Téléverser les documents requis", de: "Erforderliche Dokumente hochladen", pt: "Carregar documentos obrigatórios", ar: "تحميل المستندات المطلوبة" },
  "Select your country to localize this form. The phone code updates automatically.": { en: "Select your country to localize this form. The phone code updates automatically.", es: "Seleccione su país para adaptar este formulario. El prefijo telefónico se actualiza automáticamente.", fr: "Sélectionnez votre pays pour adapter ce formulaire. L’indicatif téléphonique se met à jour automatiquement.", de: "Wählen Sie Ihr Land, um dieses Formular anzupassen. Die Telefonvorwahl wird automatisch aktualisiert.", pt: "Selecione o seu país para adaptar este formulário. O indicativo telefónico é atualizado automaticamente.", ar: "اختر بلدك لتخصيص النموذج. سيتم تحديث رمز الهاتف تلقائياً." },
};

export function t(label: string, language?: AppLanguage) {
  return dictionary[label]?.[language ?? "en"] ?? dictionary[label]?.en ?? label;
}

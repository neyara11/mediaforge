import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import commonRu from "./locales/ru/common.json";
import commonEn from "./locales/en/common.json";
import onboardingRu from "./locales/ru/onboarding.json";
import onboardingEn from "./locales/en/onboarding.json";
import modelsRu from "./locales/ru/models.json";
import modelsEn from "./locales/en/models.json";
import settingsRu from "./locales/ru/settings.json";
import settingsEn from "./locales/en/settings.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ru: { common: commonRu, onboarding: onboardingRu, models: modelsRu, settings: settingsRu },
      en: { common: commonEn, onboarding: onboardingEn, models: modelsEn, settings: settingsEn },
    },
    fallbackLng: "ru",
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;

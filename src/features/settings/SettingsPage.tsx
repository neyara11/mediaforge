import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import ModelCatalog from "./ModelCatalog";
import ErrorBoundary from "../../components/ErrorBoundary";
import { getSetting, setSetting } from "../../db";

type Tab = "general" | "models";

export default function SettingsPage() {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const { i18n } = useTranslation();
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>("general");
  const [ffmpegPath, setFfmpegPath] = useState("");

  useEffect(() => {
    getSetting("ffmpeg_path").then((v) => {
      if (v) setFfmpegPath(v);
    }).catch(() => {});
  }, []);

  const saveFfmpegPath = (path: string) => {
    setFfmpegPath(path);
    setSetting("ffmpeg_path", path).catch(() => {});
  };

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold">{tc("settings")}</h1>

      <div className="mb-6 flex gap-1 rounded-lg bg-zinc-900 p-1">
        {([
          ["general", t("general")],
          ["models", t("models")],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm transition-colors ${
              tab === key
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="mb-4 text-sm font-medium text-zinc-400">{t("interface")}</h2>
            <div>
              <label className="mb-2 block text-sm">{t("language")}</label>
              <div className="flex gap-2">
                {(["ru", "en"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => i18n.changeLanguage(lang)}
                    className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                      i18n.language === lang
                        ? "bg-violet-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {lang === "ru" ? "Русский" : "English"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="mb-4 text-sm font-medium text-zinc-400">{t("api")}</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm">Путь к ffmpeg</label>
                <div className="flex gap-2">
                  <input
                    value={ffmpegPath}
                    onChange={(e) => saveFfmpegPath(e.target.value)}
                    placeholder="C:\ffmpeg\bin\ffmpeg.exe"
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500"
                  />
                </div>
                <p className="mt-1 text-xs text-zinc-600">
                  Скачайте с{" "}
                  <a href="https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" target="_blank" rel="noreferrer" className="text-violet-400 underline">
                    gyan.dev
                  </a>
                  , распакуйте и укажите путь к ffmpeg.exe в папке bin
                </p>
              </div>
              <div>
                <p className="mb-2 text-sm text-zinc-400">{t("resetKeyDesc")}</p>
                <button
                  onClick={logout}
                  className="rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-600/30"
                >
                  {t("reset")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "models" && (
        <ErrorBoundary>
          <ModelCatalog />
        </ErrorBoundary>
      )}
    </div>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle, XCircle, Key, Box, Monitor, Zap } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

type Step = "welcome" | "apiKey" | "models" | "system" | "ready";

const STEPS: Step[] = ["welcome", "apiKey", "models", "system", "ready"];

export default function OnboardingPage() {
  const { t } = useTranslation("onboarding");
  const { login, completeOnboarding } = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    balance?: string;
    error?: string;
  } | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(0);

  const stepIndex = STEPS.indexOf(step);

  const handleTestConnection = async () => {
    if (!apiKey.trim()) return;
    setTesting(true);
    const result = await login(apiKey.trim());
    setConnectionResult(result);
    setTesting(false);
  };

  const handleModelsLoad = async () => {
    try {
      const { testConnection: testConn } = await import("../../api/endpoints/auth");
      const result = await testConn();
      const parsed = JSON.parse(result);
      const count = parsed?.data?.length ?? 0;
      setModelsLoaded(count);
    } catch {
      setModelsLoaded(0);
    }
  };

  const goNext = () => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS.length) {
      if (step === "models") handleModelsLoad();
      setStep(STEPS[nextIdx]);
    } else {
      completeOnboarding();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= stepIndex ? "bg-violet-500" : "bg-zinc-800"
              }`}
            />
          ))}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8">
          {step === "welcome" && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl font-bold text-white">
                M
              </div>
              <h1 className="mb-2 text-2xl font-bold">{t("welcome")}</h1>
              <p className="mb-8 text-sm text-zinc-400">{t("welcomeDesc")}</p>
              <button
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-500"
              >
                {t("getStarted")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === "apiKey" && (
            <div>
              <div className="mb-6 flex items-center gap-3">
                <Key className="h-6 w-6 text-violet-400" />
                <h2 className="text-lg font-semibold">{t("apiKeyStep")}</h2>
              </div>
              <p className="mb-4 text-sm text-zinc-400">{t("apiKeyDesc")}</p>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setConnectionResult(null);
                }}
                placeholder={t("apiKeyPlaceholder")}
                className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
              />
              <button
                onClick={() => window.open("https://routerai.ru/settings/keys", "_blank")}
                className="mb-4 text-xs text-violet-400 hover:underline"
              >
                {t("whereToGet")}
              </button>
              {connectionResult && (
                <div
                  className={`mb-4 flex items-start gap-2 rounded-lg p-3 text-sm ${
                    connectionResult.success
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {connectionResult.success ? (
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div>
                    <p>
                      {connectionResult.success
                        ? t("connectionSuccess")
                        : t("connectionError")}
                    </p>
                    {connectionResult.balance && (
                      <p className="text-xs opacity-75">
                        {t("balance")}: {connectionResult.balance} ₽
                      </p>
                    )}
                  </div>
                </div>
              )}
              <button
                onClick={handleTestConnection}
                disabled={!apiKey.trim() || testing}
                className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testing ? t("testing") : t("testConnection")}
              </button>
              {connectionResult?.success && (
                <button
                  onClick={goNext}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
                >
                  {t("next")}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {step === "models" && (
            <div>
              <div className="mb-6 flex items-center gap-3">
                <Box className="h-6 w-6 text-violet-400" />
                <h2 className="text-lg font-semibold">{t("modelsStep")}</h2>
              </div>
              <p className="mb-4 text-sm text-zinc-400">{t("modelsDesc")}</p>
              <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-sm text-zinc-300">
                  {modelsLoaded > 0
                    ? t("modelsSummary", { count: modelsLoaded })
                    : "Загрузка моделей..."}
                </p>
                <div className="mt-3 space-y-1 text-xs text-zinc-500">
                  <p>{t("modelsImage")}</p>
                  <p>{t("modelsVideo")}</p>
                  <p>{t("modelsTts")}</p>
                  <p>{t("modelsStt")}</p>
                  <p>{t("modelsAudio")}</p>
                </div>
              </div>
              <button
                onClick={goNext}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
              >
                {t("next")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === "system" && (
            <div>
              <div className="mb-6 flex items-center gap-3">
                <Monitor className="h-6 w-6 text-violet-400" />
                <h2 className="text-lg font-semibold">{t("ffmpegStep")}</h2>
              </div>
              <p className="mb-4 text-sm text-zinc-400">{t("ffmpegDesc")}</p>
              <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center gap-2 text-sm text-amber-400">
                  <Zap className="h-4 w-4" />
                  {t("ffmpegNotFound")}
                </div>
              </div>
              <button
                onClick={goNext}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
              >
                {t("next")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === "ready" && (
            <div className="text-center">
              <CheckCircle className="mx-auto mb-4 h-12 w-12 text-emerald-400" />
              <h2 className="mb-2 text-xl font-bold">{t("ready")}</h2>
              <p className="mb-8 text-sm text-zinc-400">{t("readyDesc")}</p>
              <button
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-500"
              >
                {t("openApp")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

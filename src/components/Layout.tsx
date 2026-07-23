import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Image, Mic, Video, Music, Settings } from "lucide-react";
import { NAV_ITEMS } from "../shared/constants";
import { cn } from "../shared/utils";
import CostTracker from "./CostTracker";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Image,
  Mic,
  Video,
  Music,
  Settings,
};

export default function Layout() {
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const next = i18n.language === "ru" ? "en" : "ru";
    i18n.changeLanguage(next);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white">
            M
          </div>
          <span className="font-semibold">MediaForge</span>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = iconMap[item.icon];
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200",
                  )
                }
              >
                {Icon && <Icon className="h-4 w-4" />}
                {t(item.label)}
              </NavLink>
            );
          })}
        </nav>
        <CostTracker />
        <div className="border-t border-zinc-800 p-3">
          <button
            onClick={toggleLanguage}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            {i18n.language === "ru" ? "🇷🇺 RU" : "🇬🇧 EN"}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-zinc-950">
        <Outlet />
      </main>
    </div>
  );
}

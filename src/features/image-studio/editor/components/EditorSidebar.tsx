import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal, Wand2, Layers } from "lucide-react";
import type { Canvas as FabricCanvas } from "fabric";
import { cn } from "../../../../shared/utils";
import FilterPanel from "./FilterPanel";
import AIPanel from "./AIPanel";
import LayersPanel from "./LayersPanel";
import type { FilterState } from "../utils/filterApply";

interface EditorSidebarProps {
  canvas: FabricCanvas | null;
  filters: FilterState;
  onFilterChange: (key: string, value: number) => void;
  onFilterReset: () => void;
  onApplyAI: (type: string, params: Record<string, unknown>) => Promise<void>;
  loading: boolean;
  defaultModel: string;
  availableModels: { id: string; name: string }[];
  onModelChange: (model: string) => void;
}

type TabId = "filters" | "ai" | "layers";

const tabs: { id: TabId; labelKey: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "filters", labelKey: "sidebar.filters", icon: SlidersHorizontal },
  { id: "ai", labelKey: "sidebar.ai", icon: Wand2 },
  { id: "layers", labelKey: "sidebar.layers", icon: Layers },
];

export default function EditorSidebar({
  canvas,
  filters,
  onFilterChange,
  onFilterReset,
  onApplyAI,
  loading,
  defaultModel,
  availableModels,
  onModelChange,
}: EditorSidebarProps) {
  const { t } = useTranslation("editor");
  const [activeTab, setActiveTab] = useState<TabId>("filters");

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-900">
      <div className="flex border-b border-zinc-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={t(tab.labelKey)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 px-3 py-3 text-xs font-medium transition-colors",
                isActive
                  ? "border-b-2 border-violet-500 text-violet-400"
                  : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === "filters" && (
          <FilterPanel
            filters={filters}
            onChange={onFilterChange}
            onReset={onFilterReset}
          />
        )}

        {activeTab === "ai" && (
          <AIPanel
            onApply={onApplyAI}
            loading={loading}
            defaultModel={defaultModel}
            availableModels={availableModels}
            onModelChange={onModelChange}
          />
        )}

        {activeTab === "layers" && <LayersPanel canvas={canvas} />}
      </div>
    </div>
  );
}

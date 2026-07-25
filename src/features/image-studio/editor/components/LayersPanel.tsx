import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Eye, EyeOff, ArrowUp, ArrowDown, GripVertical, Layers } from "lucide-react";
import type { Canvas as FabricCanvas } from "fabric";
import { cn } from "../../../../shared/utils";

interface LayersPanelProps {
  canvas: FabricCanvas | null;
}

interface LayerItem {
  id: string;
  type: string;
  name: string;
  visible: boolean;
  object: any;
}

function getObjectType(obj: any): string {
  const type = obj?.type || "";
  const map: Record<string, string> = {
    image: "Image",
    "i-text": "Text",
    textbox: "Text",
    text: "Text",
    rect: "Rect",
    circle: "Circle",
    ellipse: "Ellipse",
    line: "Line",
    triangle: "Triangle",
    path: "Path",
    group: "Group",
    polygon: "Polygon",
    polyline: "Polyline",
  };
  return map[type] || type || "Object";
}

export default function LayersPanel({ canvas }: LayersPanelProps) {
  const { t } = useTranslation("editor");
  const [layers, setLayers] = useState<LayerItem[]>([]);

  const refreshLayers = useCallback(() => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    const items: LayerItem[] = objects
      .map((obj: any, index: number) => ({
        id: `layer-${objects.length - 1 - index}`,
        type: getObjectType(obj),
        name: `${getObjectType(obj)} ${objects.length - index}`,
        visible: obj.visible !== false,
        object: obj,
      }))
      .reverse();
    setLayers(items);
  }, [canvas]);

  useEffect(() => {
    if (!canvas) return;
    refreshLayers();
    canvas.on("object:added", refreshLayers);
    canvas.on("object:removed", refreshLayers);
    canvas.on("object:modified", refreshLayers);
    return () => {
      canvas.off("object:added", refreshLayers);
      canvas.off("object:removed", refreshLayers);
      canvas.off("object:modified", refreshLayers);
    };
  }, [canvas, refreshLayers]);

  const handleToggleVisibility = useCallback(
    (layer: LayerItem) => {
      if (!canvas) return;
      layer.object.set({ visible: !layer.visible });
      canvas.renderAll();
      refreshLayers();
    },
    [canvas, refreshLayers],
  );

  const handleDelete = useCallback(
    (layer: LayerItem) => {
      if (!canvas) return;
      canvas.remove(layer.object);
      canvas.renderAll();
      refreshLayers();
    },
    [canvas, refreshLayers],
  );

  const handleMoveUp = useCallback(
    (layer: LayerItem) => {
      if (!canvas) return;
      const objects = canvas.getObjects();
      const idx = objects.indexOf(layer.object);
      if (idx < objects.length - 1) {
        canvas.moveObjectTo(layer.object, idx + 1);
        canvas.renderAll();
        refreshLayers();
      }
    },
    [canvas, refreshLayers],
  );

  const handleMoveDown = useCallback(
    (layer: LayerItem) => {
      if (!canvas) return;
      const objects = canvas.getObjects();
      const idx = objects.indexOf(layer.object);
      if (idx > 0) {
        canvas.moveObjectTo(layer.object, idx - 1);
        canvas.renderAll();
        refreshLayers();
      }
    },
    [canvas, refreshLayers],
  );

  const handleSelect = useCallback(
    (layer: LayerItem) => {
      if (!canvas) return;
      canvas.setActiveObject(layer.object);
      canvas.renderAll();
    },
    [canvas],
  );

  if (!canvas) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-zinc-600">
        <Layers className="h-8 w-8 opacity-50" />
        <p className="text-xs">{t("layers.noImage")}</p>
      </div>
    );
  }

  if (layers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-zinc-600">
        <Layers className="h-8 w-8 opacity-50" />
        <p className="text-xs">{t("layers.empty")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-400">{t("layers.title")}</span>
        <span className="text-xs text-zinc-600">{layers.length}</span>
      </div>

      {layers.map((layer, index) => {
        const isFirst = index === 0;
        const isLast = index === layers.length - 1;

        return (
          <div
            key={layer.id}
            onClick={() => handleSelect(layer)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
              "border-zinc-800 bg-zinc-800/50 hover:border-zinc-700",
            )}
          >
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-600" />

            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-700 text-xs text-zinc-400">
              {layer.type.slice(0, 2)}
            </div>

            <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
              {layer.name}
            </span>

            <div className="flex shrink-0 items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleVisibility(layer);
                }}
                title={layer.visible ? t("layers.hide") : t("layers.show")}
                className="rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-300"
              >
                {layer.visible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-zinc-600" />
                )}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveUp(layer);
                }}
                disabled={isFirst}
                title={t("layers.moveUp")}
                className={cn(
                  "rounded p-0.5 transition-colors",
                  isFirst ? "cursor-not-allowed text-zinc-700" : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                <ArrowUp className="h-3 w-3" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveDown(layer);
                }}
                disabled={isLast}
                title={t("layers.moveDown")}
                className={cn(
                  "rounded p-0.5 transition-colors",
                  isLast ? "cursor-not-allowed text-zinc-700" : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                <ArrowDown className="h-3 w-3" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(layer);
                }}
                title={t("layers.delete")}
                className="rounded p-0.5 text-zinc-500 transition-colors hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

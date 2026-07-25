import { useParams } from "react-router-dom";
import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { Point, Rect, FabricImage } from "fabric";
import { FolderOpen } from "lucide-react";
import { getGenerations } from "../../../db";
import { canvasToBase64, extractMaskFromCanvas, createFullMask, compositeMaskOverlay, loadImageElement } from "./utils/canvasExport";
import { resetFilters } from "./utils/filterApply";
import type { FilterState } from "./utils/filterApply";
import { useFabricCanvas } from "./hooks/useFabricCanvas";
import { useEditorHistory } from "./hooks/useEditorHistory";
import { useDefaultModel } from "../../../shared/useDefaultModel";
import { useEditorTools } from "./hooks/useEditorTools";
import type { EditorTool } from "./hooks/useEditorTools";
import EditorToolbar from "./components/EditorToolbar";
import EditorCanvas from "./components/EditorCanvas";
import EditorSidebar from "./components/EditorSidebar";
import EditorStatusBar from "./components/EditorStatusBar";
import { enableBrush, disableBrush, updateBrushSettings } from "./tools/brushTool";
import { enableEraser, disableEraser } from "./tools/eraserTool";
import { enableTextTool, disableTextTool, updateTextStyle } from "./tools/textTool";
import { enableShapeTool, disableShapeTool } from "./tools/shapeTool";
import { enableCropMode, disableCropMode, getCropRect } from "./tools/cropTool";
import { enableLasso, disableLasso } from "./tools/lassoTool";
import { enableMaskMode, disableMaskMode, getMaskObjects, clearMask } from "./tools/maskTool";

export default function ImageEditorPage() {
  const { genId } = useParams<{ genId: string }>();
  const {
    canvasRef,
    canvas,
    isReady,
    loadImage,
    setZoom: setCanvasZoom,
    getZoom,
    fitToScreen,
  } = useFabricCanvas();
  const { undo, redo, canUndo, canRedo, pushState, clear: clearHistory } = useEditorHistory(canvas);
  const { tool, setTool, settings, updateSetting, tools: toolsList } = useEditorTools();
  const { defaultModel, setDefaultModel, availableModels } = useDefaultModel("image");

  const [filters, setFilters] = useState<FilterState>(resetFilters());
  const [showSidebar, setShowSidebar] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorX, setCursorX] = useState(0);
  const [cursorY, setCursorY] = useState(0);

  const currentZoom = useRef(1);

  const deactivateCurrentTool = useCallback(() => {
    if (!canvas) return;
    canvas.selection = true;
    canvas.isDrawingMode = false;
    disableBrush(canvas);
    disableEraser(canvas);
    disableTextTool(canvas);
    disableShapeTool(canvas);
    disableCropMode(canvas);
    disableLasso(canvas);
    disableMaskMode(canvas);
  }, [canvas]);

  const activateTool = useCallback(
    (newTool: EditorTool) => {
      if (!canvas) return;
      deactivateCurrentTool();

      switch (newTool) {
        case "select":
          canvas.selection = true;
          canvas.isDrawingMode = false;
          break;
        case "brush":
          canvas.selection = false;
          enableBrush(canvas, settings.brushSize, settings.brushColor);
          break;
        case "eraser":
          canvas.selection = false;
          enableEraser(canvas, settings.brushSize);
          break;
        case "text":
          canvas.selection = false;
          enableTextTool(canvas);
          break;
        case "rect":
          canvas.selection = false;
          enableShapeTool(canvas, "rect", settings.fillColor, settings.strokeColor, settings.strokeWidth);
          break;
        case "ellipse":
          canvas.selection = false;
          enableShapeTool(canvas, "ellipse", settings.fillColor, settings.strokeColor, settings.strokeWidth);
          break;
        case "line":
          canvas.selection = false;
          enableShapeTool(canvas, "line", "transparent", settings.strokeColor, settings.strokeWidth);
          break;
        case "crop":
          canvas.selection = false;
          enableCropMode(canvas);
          break;
        case "lasso":
          canvas.selection = false;
          enableLasso(canvas, async (_selection: any) => {});
          break;
        case "mask":
          canvas.selection = false;
          enableMaskMode(canvas, settings.brushSize);
          break;
      }
    },
    [canvas, settings, deactivateCurrentTool],
  );

  useEffect(() => {
    activateTool(tool);
  }, [tool, activateTool]);

  useEffect(() => {
    if (!canvas) return;
    if (tool === "brush" || tool === "eraser") {
      updateBrushSettings(canvas, settings.brushSize, settings.brushColor);
    }
  }, [canvas, tool, settings.brushSize, settings.brushColor]);

  useEffect(() => {
    if (!canvas) return;
    if (tool === "text") {
      updateTextStyle(canvas, {
        fontSize: settings.fontSize,
        fontFamily: settings.fontFamily,
        fill: settings.brushColor,
      });
    }
  }, [canvas, tool, settings.fontSize, settings.fontFamily, settings.brushColor]);

  useEffect(() => {
    if (!canvas || !isReady) return;
    canvas.on("object:modified", pushState);
    canvas.on("object:added", pushState);
    canvas.on("object:removed", pushState);

    canvas.on("mouse:move", (opt: any) => {
      const pointer = canvas.getPointer(opt.e);
      setCursorX(Math.round(pointer.x));
      setCursorY(Math.round(pointer.y));
    });

    return () => {
      canvas.off("object:modified", pushState);
      canvas.off("object:added", pushState);
      canvas.off("object:removed", pushState);
    };
  }, [canvas, isReady, pushState]);

  useEffect(() => {
    if (!canvas) return;
    const onWheel = (opt: any) => {
      if (opt.e.ctrlKey) {
        opt.e.preventDefault();
        const delta = opt.e.deltaY;
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        zoom = Math.min(Math.max(zoom, 0.1), 20);
        canvas.zoomToPoint(new Point(opt.e.offsetX, opt.e.offsetY), zoom);
        currentZoom.current = zoom;
      }
    };
    canvas.on("mouse:wheel", onWheel);
    return () => {
      canvas.off("mouse:wheel", onWheel);
    };
  }, [canvas]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!canvas) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const active = canvas.getActiveObject();
        if (active) {
          canvas.remove(active);
          canvas.discardActiveObject();
          canvas.renderAll();
          pushState();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canvas, pushState]);

  useEffect(() => {
    if (!genId) return;
    setLoading(true);
    (async () => {
      try {
        const gens = await getGenerations(undefined, "/v1/images");
        const gen = gens.find((g) => g.id === genId && g.status === "completed" && g.responseJson);
        if (!gen?.responseJson) {
          setError("Изображение не найдено");
          setLoading(false);
          return;
        }
        const parsed = JSON.parse(gen.responseJson);
        const b64 = parsed?.data?.[0]?.b64_json;
        if (b64) {
          await loadImage(b64);
          setImageLoaded(true);
          clearHistory();
          setTimeout(() => pushState(), 100);
        } else {
          setError("Не удалось загрузить изображение");
        }
      } catch {
        setError("Ошибка загрузки из базы данных");
      }
      setLoading(false);
    })();
  }, [genId, loadImage, pushState, clearHistory]);

  const handleFilterChange = useCallback(
    (key: string, value: number) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleApplyAI = useCallback(
    async (type: string, params: Record<string, unknown>) => {
      if (!canvas) return;
      setLoading(true);
      try {
        const prompt = (params.prompt as string) || "";

        if (type === "region_edit") {
          const cropRect = getCropRect(canvas);
          if (!cropRect) {
            setError("Сначала выделите область инструментом Crop");
            setLoading(false);
            return;
          }
          const { left, top, width, height } = cropRect;
          if (width < 4 || height < 4) {
            setError("Область слишком мала");
            setLoading(false);
            return;
          }

          const fullB64 = canvasToBase64(canvas, "png");
          const hCanvas = document.createElement("canvas");
          hCanvas.width = canvas.getWidth();
          hCanvas.height = canvas.getHeight();
          const hCtx = hCanvas.getContext("2d")!;
          const bgImg = await loadImageElement(`data:image/png;base64,${fullB64}`);
          hCtx.drawImage(bgImg, 0, 0);
          hCtx.fillStyle = "rgba(0, 255, 100, 0.12)";
          hCtx.fillRect(left, top, width, height);
          hCtx.strokeStyle = "rgba(0, 255, 100, 0.5)";
          hCtx.lineWidth = 2;
          hCtx.strokeRect(left, top, width, height);
          const highlightedB64 = hCanvas.toDataURL("image/png").replace(/^data:image\/\w+;base64,/, "");

          const result = await invoke<string>("edit_region", {
            imageB64: highlightedB64,
            prompt: prompt || "Regenerate only the green-bordered rectangle area. Match surrounding colors, lighting and style exactly. Keep everything outside the rectangle completely unchanged.",
            model: defaultModel,
          });
          const parsed = JSON.parse(result);
          const resultB64 = parsed?.data?.[0]?.b64_json;
          if (!resultB64) {
            setError("API: " + (parsed?.error?.message || result.substring(0, 200)));
            setLoading(false);
            return;
          }

          const resultFullImg = await loadImageElement(`data:image/png;base64,${resultB64}`);
          const extractCanvas = document.createElement("canvas");
          extractCanvas.width = width;
          extractCanvas.height = height;
          const extCtx = extractCanvas.getContext("2d")!;
          extCtx.drawImage(resultFullImg, left, top, width, height, 0, 0, width, height);
          const extractedB64 = extractCanvas.toDataURL("image/png").replace(/^data:image\/\w+;base64,/, "");

          disableCropMode(canvas);

          const guideRect = new Rect({
            left,
            top,
            width,
            height,
            fill: "rgba(139, 92, 246, 0.1)",
            stroke: "#8b5cf6",
            strokeWidth: 1,
            strokeDashArray: [6, 3],
            selectable: true,
            evented: true,
            name: "region-guide",
          });
          canvas.add(guideRect);

          const dataUrl = `data:image/png;base64,${extractedB64}`;
          const genImg = await FabricImage.fromURL(dataUrl);
          if (genImg) {
            genImg.set({
              left,
              top,
              scaleX: width / (genImg.width || 1),
              scaleY: height / (genImg.height || 1),
              name: "region-result",
            });
            canvas.add(genImg);
          }

          canvas.renderAll();
          setTool("select");
          pushState();
        } else if (type === "inpaint") {
          const maskObjects = getMaskObjects(canvas);
          if (maskObjects.length === 0) {
            setError("Сначала закрасьте область для inpainting (инструмент Mask)");
            setLoading(false);
            return;
          }

          // Extract mask BEFORE hiding objects
          const maskData = await extractMaskFromCanvas(canvas, maskObjects);
          if (!maskData) {
            setError("Не удалось извлечь маску");
            setLoading(false);
            return;
          }

          // Hide mask, export clean canvas as PNG (lossless)
          maskObjects.forEach((obj: any) => obj.set({ visible: false }));
          canvas.renderAll();
          const cleanB64 = canvasToBase64(canvas, "png");
          maskObjects.forEach((obj: any) => obj.set({ visible: true }));
          canvas.renderAll();

          const overlayedB64 = await compositeMaskOverlay(cleanB64, maskData.compositeElement);

          const result = await invoke<string>("inpaint_image", {
            imageB64: overlayedB64,
            maskB64: "",
            prompt: prompt || "Regenerate only the green-highlighted areas. Keep everything else exactly the same. Blend seamlessly.",
            model: defaultModel,
          });
          const parsed = JSON.parse(result);
          const resultB64 = parsed?.data?.[0]?.b64_json;
          console.log("[inpaint] resultB64 length:", resultB64?.length, "first 50:", resultB64?.substring(0, 50));
          if (resultB64) {
            await loadImage(resultB64);
            console.log("[inpaint] loadImage completed, canvas objects:", canvas.getObjects().length);
            clearMask(canvas);
            pushState();
          } else {
            console.log("[inpaint] no b64_json in response, full result:", result.substring(0, 300));
            setError("API: " + (parsed?.error?.message || result.substring(0, 200)));
          }
        } else if (type === "outpaint") {
          const imageB64 = canvasToBase64(canvas);
          const result = await invoke<string>("generative_expand", {
            imageB64,
            direction: "all",
            expandPx: 256,
            prompt: prompt || "Expand the image naturally",
            model: defaultModel,
          });
          const parsed = JSON.parse(result);
          const resultB64 = parsed?.data?.[0]?.b64_json;
          if (resultB64) {
            await loadImage(resultB64);
            pushState();
          }
        } else if (type === "upscale") {
          const imageB64 = canvasToBase64(canvas);
          const result = await invoke<string>("enhance_image", {
            imageB64,
            scale: 2,
            model: defaultModel,
          });
          const parsed = JSON.parse(result);
          const resultB64 = parsed?.data?.[0]?.b64_json;
          if (resultB64) {
            await loadImage(resultB64);
            pushState();
          }
        } else if (type === "style_transfer") {
          const imageB64 = canvasToBase64(canvas);
          const styleRefB64 = (params.styleRef as string) || "";
          if (!styleRefB64) {
            setError("Выберите референс стиля");
            setLoading(false);
            return;
          }
          const result = await invoke<string>("style_transfer", {
            imageB64,
            styleRefB64,
            model: defaultModel,
          });
          const parsed = JSON.parse(result);
          const resultB64 = parsed?.data?.[0]?.b64_json;
          if (resultB64) {
            await loadImage(resultB64);
            pushState();
          }
        } else if (type === "remove_background") {
          const imageB64 = canvasToBase64(canvas);
          const fullMask = createFullMask(canvas);
          const result = await invoke<string>("inpaint_image", {
            imageB64,
            maskB64: fullMask,
            prompt: "Remove the background, make it transparent",
            model: defaultModel,
          });
          const parsed = JSON.parse(result);
          const resultB64 = parsed?.data?.[0]?.b64_json;
          if (resultB64) {
            await loadImage(resultB64);
            pushState();
          }
        }
      } catch (e) {
        setError(`AI операция не удалась: ${e}`);
      }
      setLoading(false);
    },
    [canvas, loadImage, pushState, defaultModel],
  );

  const handleExport = useCallback(async () => {
    if (!canvas) return;
    try {
      const b64 = canvasToBase64(canvas);
      const filePath = await save({
        defaultPath: "edited-image.png",
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });
      if (filePath) {
        await invoke("save_base64_file", { base64Data: b64, filePath });
      }
    } catch {
      setError("Не удалось экспортировать изображение");
    }
  }, [canvas]);

  const handleSave = useCallback(async () => {
    if (!canvas) return;
    try {
      const b64 = canvasToBase64(canvas);
      const filePath = await save({
        defaultPath: "project.mforge",
        filters: [
          { name: "MediaForge Project", extensions: ["mforge"] },
          { name: "PNG Image", extensions: ["png"] },
        ],
      });
      if (!filePath) return;
      if (filePath.endsWith(".mforge")) {
        const projectData = JSON.stringify({
          canvas: canvas.toJSON(),
          filters,
          version: "1.0",
        });
        await invoke("save_editor_project", { jsonData: projectData, filePath });
      } else {
        await invoke("save_base64_file", { base64Data: b64, filePath });
      }
    } catch {
      setError("Не удалось сохранить проект");
    }
  }, [canvas, filters]);

  const handleOpen = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
        multiple: false,
      });
      if (!selected) return;
      setLoading(true);
      const base64 = await invoke<string>("load_image_from_path", { path: selected });
      await loadImage(base64);
      setImageLoaded(true);
      clearHistory();
      setTimeout(() => pushState(), 100);
    } catch (e) {
      console.error("Open failed:", e);
      setError("Не удалось открыть файл: " + String(e));
    }
    setLoading(false);
  }, [loadImage, pushState, clearHistory]);

  const handleToolChange = useCallback(
    (newTool: EditorTool) => {
      setTool(newTool);
    },
    [setTool],
  );

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar
        tool={tool}
        setTool={handleToolChange}
        tools={toolsList}
        settings={settings}
        updateSetting={(key: string, value: string | number) => updateSetting(key as keyof typeof settings, value as never)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onSave={handleSave}
        onOpen={handleOpen}
        onExport={handleExport}
        onZoomIn={() => {
          const z = Math.min(getZoom() * 1.2, 10);
          setCanvasZoom(z);
          currentZoom.current = z;
        }}
        onZoomOut={() => {
          const z = Math.max(getZoom() * 0.8, 0.1);
          setCanvasZoom(z);
          currentZoom.current = z;
        }}
        onFitScreen={fitToScreen}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        zoom={currentZoom.current || getZoom()}
        showSidebar={showSidebar}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 bg-zinc-950 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/70">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          )}

          {error && (
            <div className="absolute left-4 top-4 z-10 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-2 text-zinc-500 hover:text-zinc-300"
              >
                &times;
              </button>
            </div>
          )}

          {!genId && !imageLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-zinc-600">
              <FolderOpen className="h-12 w-12 opacity-50" />
              <p className="text-sm">Выберите изображение для редактирования</p>
              <button
                onClick={handleOpen}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-violet-500"
              >
                Открыть изображение
              </button>
            </div>
          )}

          <EditorCanvas
            canvasRef={canvasRef}
            isMaskMode={tool === "mask"}
          />
        </div>

        {showSidebar && (
          <EditorSidebar
            canvas={canvas}
            filters={filters}
            onFilterChange={handleFilterChange}
            onApplyAI={handleApplyAI}
            loading={loading}
            defaultModel={defaultModel}
            availableModels={availableModels}
            onModelChange={setDefaultModel}
          />
        )}
      </div>

      <EditorStatusBar
        zoom={getZoom()}
        canvasWidth={canvas?.getWidth() ?? 800}
        canvasHeight={canvas?.getHeight() ?? 600}
        cursorX={cursorX}
        cursorY={cursorY}
        tool={tool}
      />
    </div>
  );
}

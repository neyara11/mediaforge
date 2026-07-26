import { useParams, useSearchParams } from "react-router-dom";
import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { Point, FabricImage } from "fabric";
import { FolderOpen } from "lucide-react";
import { getGenerations } from "../../../db";
import { canvasToBase64, createFullMask, extractFeatheredRegion, loadImageElement, getNativeResolutionMultiplier } from "./utils/canvasExport";
import { resetFilters, applyFiltersToObject } from "./utils/filterApply";
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

/** Human-readable text for any thrown value (Error, string, DOM Event...). */
function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Ignore key events originating from text inputs / editable elements. */
function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    t.isContentEditable === true
  );
}

export default function ImageEditorPage() {
  const { t } = useTranslation("editor");
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

  // Batch image index passed from the studio page (multi-image generations)
  const [searchParams] = useSearchParams();
  const imageIndex = Math.max(0, Number(searchParams.get("idx")) || 0);

  const [filters, setFilters] = useState<FilterState>(resetFilters());
  const [showSidebar, setShowSidebar] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorX, setCursorX] = useState(0);
  const [cursorY, setCursorY] = useState(0);

  const [zoom, setZoomState] = useState(1);

  // Keep settings in a ref so tool (re)activation doesn't depend on them —
  // changing a slider must not tear down an in-progress crop/lasso selection.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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
  }, [canvas]);

  const activateTool = useCallback(
    (newTool: EditorTool) => {
      if (!canvas) return;
      const s = settingsRef.current;
      deactivateCurrentTool();

      switch (newTool) {
        case "select":
          canvas.selection = true;
          canvas.isDrawingMode = false;
          break;
        case "brush":
          canvas.selection = false;
          enableBrush(canvas, s.brushSize, s.brushColor);
          break;
        case "eraser":
          canvas.selection = false;
          enableEraser(canvas, s.brushSize);
          break;
        case "text":
          canvas.selection = false;
          enableTextTool(canvas, {
            fontSize: s.fontSize,
            fontFamily: s.fontFamily,
            fill: s.brushColor,
            text: t("editor.textDefault"),
          });
          break;
        case "rect":
          canvas.selection = false;
          enableShapeTool(canvas, "rect", s.fillColor, s.strokeColor, s.strokeWidth);
          break;
        case "ellipse":
          canvas.selection = false;
          enableShapeTool(canvas, "ellipse", s.fillColor, s.strokeColor, s.strokeWidth);
          break;
        case "line":
          canvas.selection = false;
          enableShapeTool(canvas, "line", "transparent", s.strokeColor, s.strokeWidth);
          break;
        case "crop":
          canvas.selection = false;
          enableCropMode(canvas, () => setTool("select"));
          break;
        case "lasso":
          canvas.selection = false;
          enableLasso(canvas, () => {});
          break;
      }
    },
    [canvas, deactivateCurrentTool, setTool, t],
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
    // Bulk operations (crop etc.) request a single history entry explicitly
    canvas.on("history:push" as any, pushState);

    const onMouseMove = (opt: any) => {
      const pointer = canvas.getPointer(opt.e);
      setCursorX(Math.round(pointer.x));
      setCursorY(Math.round(pointer.y));
    };
    canvas.on("mouse:move", onMouseMove);

    return () => {
      canvas.off("object:modified", pushState);
      canvas.off("object:added", pushState);
      canvas.off("object:removed", pushState);
      canvas.off("history:push" as any, pushState);
      canvas.off("mouse:move", onMouseMove);
    };
  }, [canvas, isReady, pushState]);

  useEffect(() => {
    if (!canvas) return;
    const onWheel = (opt: any) => {
      if (opt.e.ctrlKey) {
        opt.e.preventDefault();
        const delta = opt.e.deltaY;
        let newZoom = canvas.getZoom();
        newZoom *= 0.999 ** delta;
        newZoom = Math.min(Math.max(newZoom, 0.1), 10);
        canvas.zoomToPoint(new Point(opt.e.offsetX, opt.e.offsetY), newZoom);
        setZoomState(newZoom);
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
      if (isEditableTarget(e)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const active = canvas.getActiveObject() as any;
        // Don't delete a text object while the user is editing its content
        if (!active || active.isEditing === true) return;
        canvas.remove(active);
        canvas.discardActiveObject();
        canvas.renderAll();
        pushState();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canvas, pushState]);

  // Tool / edit shortcuts advertised in the toolbar tooltips
  useEffect(() => {
    const TOOL_KEYS: Record<string, EditorTool> = {
      v: "select",
      c: "crop",
      b: "brush",
      e: "eraser",
      t: "text",
      r: "rect",
      o: "ellipse",
      i: "line",
      l: "lasso",
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod || e.altKey) return;

      const mapped = TOOL_KEYS[key];
      if (mapped) setTool(mapped);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTool, undo, redo]);

  useEffect(() => {
    if (!genId) return;
    setLoading(true);
    (async () => {
      try {
        const gens = await getGenerations(undefined, "/v1/images");
        const gen = gens.find((g) => g.id === genId && g.status === "completed" && g.responseJson);
        if (!gen?.responseJson) {
          setError(t("editor.notFound"));
          setLoading(false);
          return;
        }
        const parsed = JSON.parse(gen.responseJson);
        const images = Array.isArray(parsed?.data) ? parsed.data : [];
        const b64 = images[Math.min(imageIndex, images.length - 1)]?.b64_json;
        if (b64) {
          await loadImage(b64);
          setImageLoaded(true);
          clearHistory();
          setTimeout(() => pushState(), 100);
        } else {
          setError(t("editor.loadFailed"));
        }
      } catch {
        setError(t("editor.dbError"));
      }
      setLoading(false);
    })();
  }, [genId, imageIndex, loadImage, pushState, clearHistory, t]);

  /** The image object filters apply to: active image, else the background image. */
  const getFilterTarget = useCallback(() => {
    if (!canvas) return null;
    const active = canvas.getActiveObject() as any;
    if (active && active.type === "image") return active;
    return (
      (canvas.getObjects().find(
        (obj: any) => obj.type === "image" && obj.selectable === false && obj.evented === false,
      ) as any) ?? null
    );
  }, [canvas]);

  const handleFilterChange = useCallback(
    (key: string, value: number) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        const target = getFilterTarget();
        if (target && canvas) {
          applyFiltersToObject(target, next);
          canvas.requestRenderAll();
        }
        return next;
      });
    },
    [canvas, getFilterTarget],
  );

  const handleFilterReset = useCallback(() => {
    const next = resetFilters();
    setFilters(next);
    const target = getFilterTarget();
    if (target && canvas) {
      applyFiltersToObject(target, next);
      canvas.requestRenderAll();
    }
  }, [canvas, getFilterTarget]);

  const handleApplyAI = useCallback(
    async (type: string, params: Record<string, unknown>) => {
      if (!canvas) return;
      setLoading(true);
      try {
        const prompt = (params.prompt as string) || "";

        if (type === "region_edit") {
          const cropRect = getCropRect(canvas);
          if (!cropRect) {
            setError(t("editor.selectRegionFirst"));
            setLoading(false);
            return;
          }
          let { left, top, width, height } = cropRect;
          if (width < 4 || height < 4) {
            setError(t("editor.regionTooSmall"));
            setLoading(false);
            return;
          }

          const bgImgObj = canvas.getObjects().find(
            (obj: any) => obj.type === "image" && obj.selectable === false && obj.evented === false,
          );
          if (bgImgObj) {
            const imgLeft = bgImgObj.left!;
            const imgTop = bgImgObj.top!;
            const imgRight = imgLeft + (bgImgObj.width || 0) * (bgImgObj.scaleX || 1);
            const imgBottom = imgTop + (bgImgObj.height || 0) * (bgImgObj.scaleY || 1);
            if (left < imgLeft) { width -= imgLeft - left; left = imgLeft; }
            if (top < imgTop) { height -= imgTop - top; top = imgTop; }
            if (left + width > imgRight) { width = imgRight - left; }
            if (top + height > imgBottom) { height = imgBottom - top; }
          }
          if (width < 4 || height < 4) {
            setError(t("editor.regionOutside"));
            setLoading(false);
            return;
          }

          // Remove the crop selection frame BEFORE exporting, otherwise it
          // would be baked into the image sent to the model
          disableCropMode(canvas);

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
            prompt: prompt || "Regenerate only the green-bordered rectangular area. Match surrounding colors, lighting and style exactly. Keep everything outside the rectangle completely unchanged.",
            model: defaultModel,
          });
          const parsed = JSON.parse(result);
          const resultB64 = parsed?.data?.[0]?.b64_json;
          if (!resultB64) {
            setError("API: " + (parsed?.error?.message || result.substring(0, 200)));
            setLoading(false);
            return;
          }

          // Cut the edited region out of the result (the API may return a
          // different resolution — scale factors map canvas coords onto it)
          // and insert it as a separate layer with feathered edges, so no
          // rectangular seam is visible and all user layers stay untouched.
          const resultFullImg = await loadImageElement(`data:image/png;base64,${resultB64}`);
          const canvasW = canvas.getWidth();
          const canvasH = canvas.getHeight();
          const sx = resultFullImg.width / canvasW;
          const sy = resultFullImg.height / canvasH;
          const srcX = Math.max(0, Math.round(left * sx));
          const srcY = Math.max(0, Math.round(top * sy));
          const srcW = Math.min(resultFullImg.width - srcX, Math.round(width * sx));
          const srcH = Math.min(resultFullImg.height - srcY, Math.round(height * sy));
          if (srcW < 4 || srcH < 4) {
            setError(t("editor.regionTooSmall"));
            setLoading(false);
            return;
          }
          const feather = Math.max(6, Math.round(Math.min(srcW, srcH) * 0.06));
          const patchB64 = extractFeatheredRegion(resultFullImg, srcX, srcY, srcW, srcH, feather);

          const genImg = await FabricImage.fromURL(`data:image/png;base64,${patchB64}`);
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
        } else if (type === "outpaint") {
          const imageB64 = canvasToBase64(canvas, "png", 1, getNativeResolutionMultiplier(canvas));
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
          const imageB64 = canvasToBase64(canvas, "png", 1, getNativeResolutionMultiplier(canvas));
          const result = await invoke<string>("enhance_image", {
            imageB64,
            scale: 4,
            model: defaultModel,
          });
          const parsed = JSON.parse(result);
          const resultB64 = parsed?.data?.[0]?.b64_json;
          if (resultB64) {
            await loadImage(resultB64);
            pushState();
          }
        } else if (type === "style_transfer") {
          const imageB64 = canvasToBase64(canvas, "png", 1, getNativeResolutionMultiplier(canvas));
          const styleRefB64 = (params.styleRef as string) || "";
          if (!styleRefB64) {
            setError(t("editor.styleRefRequired"));
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
          const multiplier = getNativeResolutionMultiplier(canvas);
          const imageB64 = canvasToBase64(canvas, "png", 1, multiplier);
          const fullMask = createFullMask(canvas, multiplier);
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
        setError(t("editor.aiFailed", { error: errorText(e) }));
      }
      setLoading(false);
    },
    [canvas, loadImage, pushState, defaultModel, setTool, t],
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
      setError(t("editor.exportFailed"));
    }
  }, [canvas, t]);

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
      setError(t("editor.saveFailed"));
    }
  }, [canvas, filters, t]);

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
      setError(t("editor.openFailed", { error: errorText(e) }));
    }
    setLoading(false);
  }, [loadImage, pushState, clearHistory, t]);

  const handleLoadProject = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: "MediaForge Project", extensions: ["mforge"] }],
        multiple: false,
      });
      if (!selected) return;
      setLoading(true);
      const jsonStr = await invoke<string>("load_editor_project", { filePath: selected });
      const projectData = JSON.parse(jsonStr);
      if (!projectData.version || !projectData.canvas) {
        setError(t("editor.loadProjectFailed", { error: "Invalid project file" }));
        setLoading(false);
        return;
      }
      canvas!.loadFromJSON(projectData.canvas, () => {
        canvas!.renderAll();
        if (projectData.filters) {
          setFilters(projectData.filters);
        }
        setImageLoaded(true);
        clearHistory();
        setTimeout(() => pushState(), 100);
        setLoading(false);
      });
    } catch (e) {
      console.error("Load project failed:", e);
      setError(t("editor.loadProjectFailed", { error: errorText(e) }));
      setLoading(false);
    }
  }, [canvas, pushState, clearHistory, t]);

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
        onLoadProject={handleLoadProject}
        onExport={handleExport}
        onZoomIn={() => {
          const z = Math.min(getZoom() * 1.2, 10);
          setCanvasZoom(z);
          setZoomState(z);
        }}
        onZoomOut={() => {
          const z = Math.max(getZoom() * 0.8, 0.1);
          setCanvasZoom(z);
          setZoomState(z);
        }}
        onFitScreen={() => {
          fitToScreen();
          setZoomState(1);
        }}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        zoom={zoom}
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
              <p className="text-sm">{t("editor.chooseImage")}</p>
              <button
                onClick={handleOpen}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-violet-500"
              >
                {t("editor.openImage")}
              </button>
            </div>
          )}

          <EditorCanvas canvasRef={canvasRef} />
        </div>

        {showSidebar && (
          <EditorSidebar
            canvas={canvas}
            filters={filters}
            onFilterChange={handleFilterChange}
            onFilterReset={handleFilterReset}
            onApplyAI={handleApplyAI}
            loading={loading}
            defaultModel={defaultModel}
            availableModels={availableModels}
            onModelChange={setDefaultModel}
          />
        )}
      </div>

      <EditorStatusBar
        zoom={zoom}
        canvasWidth={canvas?.getWidth() ?? 800}
        canvasHeight={canvas?.getHeight() ?? 600}
        cursorX={cursorX}
        cursorY={cursorY}
        tool={tool}
      />
    </div>
  );
}

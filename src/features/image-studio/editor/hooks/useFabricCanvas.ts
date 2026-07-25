import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas as FabricCanvas, FabricImage } from "fabric";

const CANVAS_BG = "#1a1a2e";

export function useFabricCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [canvas, setCanvas] = useState<FabricCanvas | null>(null);
  const imageRef = useRef<any>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    let instance: FabricCanvas;
    try {
      instance = new FabricCanvas(el, {
        backgroundColor: CANVAS_BG,
        preserveObjectStacking: true,
        width: el.parentElement?.clientWidth ?? 800,
        height: el.parentElement?.clientHeight ?? 600,
      });
    } catch (e) {
      console.error("Failed to create fabric canvas:", e);
      return;
    }

    fabricRef.current = instance;
    setCanvas(instance);

    const handleResize = () => {
      if (!instance || instance.destroyed) return;
      if (!el.parentElement) return;
      const { clientWidth, clientHeight } = el.parentElement;
      try {
        instance.setDimensions(
          { width: clientWidth, height: clientHeight },
          { backstoreOnly: true } as any,
        );
        instance.setDimensions(
          { width: `${clientWidth}px`, height: `${clientHeight}px` },
          { cssOnly: true } as any,
        );
        instance.renderAll();
      } catch {}
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (el.parentElement) {
      resizeObserver.observe(el.parentElement);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      imageRef.current = null;
      setCanvas(null);
      try { instance.dispose(); } catch {}
      fabricRef.current = null;
    };
  }, []);

  const loadImage = useCallback(async (base64: string) => {
    const instance = fabricRef.current;
    if (!instance) {
      console.log("[loadImage] no fabric instance");
      return;
    }

    const dataUrl = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
    console.log("[loadImage] loading, dataUrl length:", dataUrl.length);

    const img = await FabricImage.fromURL(dataUrl);
    if (!img) {
      console.log("[loadImage] FabricImage.fromURL returned null");
      return;
    }

    console.log("[loadImage] image loaded, size:", img.width, "x", img.height);
    instance.clear();
    instance.remove(...instance.getObjects());

    const canvasW = instance.getWidth();
    const canvasH = instance.getHeight();
    const imgW = img.width!;
    const imgH = img.height!;

    const scale = Math.min(canvasW / imgW, canvasH / imgH, 1);
    img.scale(scale);
    img.set({
      left: (canvasW - imgW * scale) / 2,
      top: (canvasH - imgH * scale) / 2,
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true,
    });

    instance.add(img as any);
    imageRef.current = img as any;
    instance.renderAll();
  }, []);

  const setZoom = useCallback((zoom: number) => {
    const instance = fabricRef.current;
    if (!instance) return;
    instance.setZoom(zoom);
    instance.renderAll();
  }, []);

  const getZoom = useCallback((): number => {
    const instance = fabricRef.current;
    if (!instance) return 1;
    return instance.getZoom();
  }, []);

  const fitToScreen = useCallback(() => {
    const instance = fabricRef.current;
    const img = imageRef.current;
    if (!instance || !img) return;

    const canvasW = instance.getWidth();
    const canvasH = instance.getHeight();
    const imgW = img.width!;
    const imgH = img.height!;

    const scale = Math.min(canvasW / imgW, canvasH / imgH, 1);
    img.scale(scale);
    img.set({
      left: (canvasW - imgW * scale) / 2,
      top: (canvasH - imgH * scale) / 2,
    });

    instance.setZoom(1);
    instance.renderAll();
  }, []);

  const isReady = canvas !== null;

  return {
    canvasRef,
    canvas,
    isReady,
    loadImage,
    setZoom,
    getZoom,
    fitToScreen,
  };
}

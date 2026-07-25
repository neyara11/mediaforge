import { Canvas as FabricCanvas, IText } from "fabric";

export interface TextToolOptions {
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  /** Initial content of a newly created text object */
  text?: string;
}

export function enableTextTool(
  canvas: FabricCanvas,
  options?: TextToolOptions,
): void {
  canvas.selection = false;

  const onClick = (opt: any) => {
    const pointer = opt.scenePoint;
    const text = new IText(options?.text ?? "Text", {
      left: pointer.x,
      top: pointer.y,
      fontSize: options?.fontSize ?? 24,
      fontFamily: options?.fontFamily ?? "Arial, sans-serif",
      fill: options?.fill ?? "#ffffff",
      editable: true,
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    canvas.requestRenderAll();
  };

  canvas.on("mouse:down", onClick);
  (canvas as any).__textClickHandler = onClick;
}

export function disableTextTool(canvas: FabricCanvas): void {
  const handler = (canvas as any).__textClickHandler;
  if (handler) {
    canvas.off("mouse:down", handler);
    delete (canvas as any).__textClickHandler;
  }
  canvas.selection = true;
}

export function updateTextStyle(
  canvas: FabricCanvas,
  style: {
    fontSize?: number;
    fontFamily?: string;
    fill?: string;
    fontWeight?: string;
    fontStyle?: string;
    underline?: boolean;
    textAlign?: string;
  },
): void {
  const obj = canvas.getActiveObject();
  if (!obj || obj.type !== "i-text") return;

  const textObj = obj as IText;
  if (style.fontSize !== undefined) textObj.set("fontSize", style.fontSize);
  if (style.fontFamily !== undefined) textObj.set("fontFamily", style.fontFamily);
  if (style.fill !== undefined) textObj.set("fill", style.fill);
  if (style.fontWeight !== undefined) textObj.set("fontWeight", style.fontWeight);
  if (style.fontStyle !== undefined) textObj.set("fontStyle", style.fontStyle);
  if (style.underline !== undefined) textObj.set("underline", style.underline);
  if (style.textAlign !== undefined) textObj.set("textAlign", style.textAlign);

  canvas.requestRenderAll();
}

import { invoke } from "@tauri-apps/api/core";

export type FilterType = "brightness" | "contrast" | "saturation" | "blur" | "sharpen";

export interface FilterState {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  sharpen: number;
}

export async function applyNativeFilter(
  b64: string,
  type: FilterType,
  value: number,
): Promise<string> {
  return invoke<string>("apply_native_filter", { b64, filterType: type, value });
}

export function applyPixelFilter(
  imageData: ImageData,
  brightness: number,
  contrast: number,
  saturation: number,
): ImageData {
  const data = imageData.data;
  const len = data.length;

  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r = clamp(Math.trunc(r + brightness), 0, 255);
    g = clamp(Math.trunc(g + brightness), 0, 255);
    b = clamp(Math.trunc(b + brightness), 0, 255);

    r = clamp(Math.trunc((r - 128) * contrastFactor + 128), 0, 255);
    g = clamp(Math.trunc((g - 128) * contrastFactor + 128), 0, 255);
    b = clamp(Math.trunc((b - 128) * contrastFactor + 128), 0, 255);

    if (saturation !== 1) {
      const maxC = Math.max(r, g, b) / 255;
      const minC = Math.min(r, g, b) / 255;
      const l = (maxC + minC) / 2;

      if (maxC !== minC) {
        const s =
          l <= 0.5
            ? (maxC - minC) / (maxC + minC)
            : (maxC - minC) / (2 - maxC - minC);

        const newS = clamp(s * saturation, 0, 1);

        if (l < 0.5) {
          const q = l * (1 + newS);
          const p = 2 * l - q;
          r = Math.trunc(hueToRgb(p, q, (r / 255 + 1 / 3) % 1) * 255);
          g = Math.trunc(hueToRgb(p, q, g / 255) * 255);
          b = Math.trunc(hueToRgb(p, q, (b / 255 - 1 / 3 + 1) % 1) * 255);
        } else {
          const q = l + newS - l * newS;
          const p = 2 * l - q;
          r = Math.trunc(hueToRgb(p, q, (r / 255 + 1 / 3) % 1) * 255);
          g = Math.trunc(hueToRgb(p, q, g / 255) * 255);
          b = Math.trunc(hueToRgb(p, q, (b / 255 - 1 / 3 + 1) % 1) * 255);
        }
      }
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  return imageData;
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function resetFilters(): FilterState {
  return { brightness: 0, contrast: 0, saturation: 1, blur: 0, sharpen: 0 };
}

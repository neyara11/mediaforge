import { Canvas as FabricCanvas } from "fabric";

/**
 * Cooperative flag that tells the history hook to ignore canvas mutations
 * (object:added/removed) during bulk operations such as clear()+add(),
 * cropping, or transient selection overlays. Use together with a final
 * explicit pushState / "history:push" event after the operation completes.
 */

const KEY = "__historySuspendCount";

export function suspendHistory(canvas: FabricCanvas): void {
  const c = canvas as any;
  c[KEY] = (c[KEY] ?? 0) + 1;
}

export function resumeHistory(canvas: FabricCanvas): void {
  const c = canvas as any;
  c[KEY] = Math.max(0, (c[KEY] ?? 0) - 1);
}

export function isHistorySuspended(canvas: FabricCanvas): boolean {
  return ((canvas as any)[KEY] ?? 0) > 0;
}

/** Run `fn` with history suspended, then fire a single "history:push" event. */
export function withHistorySuspended<T>(
  canvas: FabricCanvas,
  fn: () => T,
  pushAfter = false,
): T {
  suspendHistory(canvas);
  try {
    return fn();
  } finally {
    resumeHistory(canvas);
    if (pushAfter) {
      canvas.fire("history:push" as any);
    }
  }
}

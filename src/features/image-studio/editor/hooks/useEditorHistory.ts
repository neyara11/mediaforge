import { useState, useCallback, useRef } from "react";
import { Canvas as FabricCanvas } from "fabric";

const MAX_HISTORY = 50;

interface UseEditorHistoryReturn {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  pushState: () => void;
  clear: () => void;
}

export function useEditorHistory(
  canvas: FabricCanvas | null,
): UseEditorHistoryReturn {
  const historyRef = useRef<string[]>([]);
  const indexRef = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const restoringRef = useRef(false);

  const updateFlags = useCallback((idx: number, len: number) => {
    setCanUndo(idx > 0);
    setCanRedo(idx < len - 1);
  }, []);

  const pushState = useCallback(() => {
    if (!canvas || restoringRef.current || canvas.destroyed) return;

    const json = JSON.stringify(canvas.toJSON());

    const history = historyRef.current;
    const idx = indexRef.current;

    const newHistory = history.slice(0, idx + 1);
    newHistory.push(json);

    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }

    historyRef.current = newHistory;
    indexRef.current = newHistory.length - 1;
    updateFlags(newHistory.length - 1, newHistory.length);
  }, [canvas, updateFlags]);

  const undo = useCallback(() => {
    if (!canvas || canvas.destroyed) return;
    const idx = indexRef.current;
    if (idx <= 0) return;

    restoringRef.current = true;
    const targetJson = historyRef.current[idx - 1];
    canvas
      .loadFromJSON(JSON.parse(targetJson))
      .then(() => {
        canvas.renderAll();
        indexRef.current = idx - 1;
        updateFlags(idx - 1, historyRef.current.length);
        restoringRef.current = false;
      })
      .catch(() => {
        restoringRef.current = false;
      });
  }, [canvas, updateFlags]);

  const redo = useCallback(() => {
    if (!canvas || canvas.destroyed) return;
    const history = historyRef.current;
    const idx = indexRef.current;
    if (idx >= history.length - 1) return;

    restoringRef.current = true;
    const targetJson = history[idx + 1];
    canvas
      .loadFromJSON(JSON.parse(targetJson))
      .then(() => {
        canvas.renderAll();
        indexRef.current = idx + 1;
        updateFlags(idx + 1, history.length);
        restoringRef.current = false;
      })
      .catch(() => {
        restoringRef.current = false;
      });
  }, [canvas, updateFlags]);

  const clear = useCallback(() => {
    historyRef.current = [];
    indexRef.current = -1;
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  return { undo, redo, canUndo, canRedo, pushState, clear };
}

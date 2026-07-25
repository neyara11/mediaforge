import type { RefObject } from "react";

interface EditorCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isMaskMode: boolean;
}

export default function EditorCanvas({ canvasRef, isMaskMode }: EditorCanvasProps) {
  return (
    <>
      <div className="absolute inset-0">
        <canvas ref={canvasRef} />
      </div>
      {isMaskMode && (
        <div className="absolute inset-0 pointer-events-none bg-red-500/10" />
      )}
    </>
  );
}

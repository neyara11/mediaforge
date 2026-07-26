import type { RefObject } from "react";

interface EditorCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export default function EditorCanvas({ canvasRef }: EditorCanvasProps) {
  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} />
    </div>
  );
}

import { useState } from "react";
import { Video, Clock } from "lucide-react";
import { createVideo } from "../../api/endpoints/videos";
import PromptBuilder from "../prompt-builder/PromptBuilderPanel";
import { cn, generateId } from "../../shared/utils";
import { saveGeneration } from "../../db";

interface VideoTask {
  id: string;
  prompt: string;
  model: string;
  status: "pending" | "processing" | "completed" | "failed";
  remoteId: string | null;
  elapsed: number;
}

export default function VideoStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("bytedance/seedance-2.0");
  const [duration, setDuration] = useState(8);
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);

  const handleCreate = async () => {
    if (!prompt.trim()) return;
    const taskId = generateId();
    const newTask: VideoTask = {
      id: taskId,
      prompt: prompt.trim(),
      model,
      status: "pending",
      remoteId: null,
      elapsed: 0,
    };
    setTasks((prev) => [newTask, ...prev]);

    try {
      const result = await createVideo({
        prompt: prompt.trim(),
        model,
        duration,
      });
      const parsed = JSON.parse(result);
      const remoteId = parsed?.id ?? null;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, remoteId, status: "processing" } : t,
        ),
      );
      await saveGeneration({
        id: taskId,
        projectId: null,
        model,
        endpoint: "/v1/videos",
        requestJson: JSON.stringify({ prompt: prompt.trim(), model, duration }),
        status: "processing",
        mediaPath: null,
        mediaType: "video/mp4",
        parentId: null,
        costRub: null,
        generationId: remoteId,
      });
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: "failed" } : t)),
      );
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col">
        <div className="border-b border-zinc-800 p-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Опишите видео..."
                rows={2}
                className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
              />
            </div>
            <button
              onClick={() => setShowPromptBuilder(!showPromptBuilder)}
              className={cn(
                "rounded-lg border p-2 text-zinc-400 transition-colors hover:border-violet-500",
                showPromptBuilder && "border-violet-500 text-violet-400",
              )}
            >
              AI
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
            >
              <option value="bytedance/seedance-2.0">Seedance 2.0</option>
              <option value="openai/sora-2">Sora 2</option>
              <option value="google/veo-3.1">Veo 3.1</option>
            </select>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
            >
              <option value="4">4s</option>
              <option value="8">8s</option>
              <option value="12">12s</option>
            </select>
            <button
              onClick={handleCreate}
              disabled={!prompt.trim()}
              className="ml-auto rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create Video Task
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {tasks.length === 0 && (
            <div className="flex h-64 items-center justify-center text-zinc-600">
              <div className="text-center">
                <Video className="mx-auto mb-3 h-8 w-8 opacity-50" />
                <p className="text-sm">Создайте задачу на генерацию видео</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-300 line-clamp-1">
                      {task.prompt}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {task.model}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Clock className="h-3 w-3" />
                      {task.status === "pending"
                        ? "Queued"
                        : task.status === "processing"
                          ? "Processing..."
                          : task.status === "completed"
                            ? "Completed"
                            : "Failed"}
                    </div>
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        task.status === "completed"
                          ? "bg-emerald-400"
                          : task.status === "failed"
                            ? "bg-red-400"
                            : task.status === "processing"
                              ? "bg-amber-400 animate-pulse"
                              : "bg-zinc-600",
                      )}
                    />
                  </div>
                </div>
                {task.status === "processing" && (
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full w-1/2 animate-progress rounded-full bg-violet-500" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showPromptBuilder && (
        <div className="w-80 shrink-0">
          <PromptBuilder
            mode="video"
            onUsePrompt={(p) => {
              setPrompt(p);
              setShowPromptBuilder(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

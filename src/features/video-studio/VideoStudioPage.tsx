import { useState, useEffect, useRef } from "react";
import { Video, Clock, AlertCircle } from "lucide-react";
import { createVideo, pollVideo, downloadVideo } from "../../api/endpoints/videos";
import PromptBuilder from "../prompt-builder/PromptBuilderPanel";
import { cn, generateId, formatCostRub } from "../../shared/utils";
import { useDefaultModel } from "../../shared/useDefaultModel";
import { saveGeneration, setSetting, getGenerations } from "../../db";

interface VideoTask {
  id: string;
  remoteId: string | null;
  prompt: string;
  model: string;
  duration: number;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl: string | null;
  cost: number | null;
  error: string | null;
}

const DURATION_LABELS: Record<number, string> = { 4: "4s", 8: "8s", 12: "12s" };

export default function VideoStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(8);
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { defaultModel, setDefaultModel, availableModels } = useDefaultModel("video");

  const pollTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const videoUrlsRef = useRef<Set<string>>(new Set());
  const tasksRef = useRef<VideoTask[]>(tasks);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    return () => {
      for (const t of pollTimeoutsRef.current.values()) {
        clearTimeout(t);
      }
      for (const url of videoUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    const recover = async () => {
      try {
        const gens = await getGenerations();
        const unfinished = gens.filter(
          (g) =>
            g.endpoint === "/v1/videos" &&
            g.generationId &&
            (g.status === "pending" || g.status === "processing"),
        );

        if (unfinished.length === 0) return;

        const recovered: VideoTask[] = unfinished.map((g) => {
          let promptText = "";
          let dur = 8;
          try {
            const req = JSON.parse(g.requestJson);
            promptText = req.prompt ?? "";
            dur = req.duration ?? 8;
          } catch {
            /* ignore malformed JSON */
          }
          return {
            id: g.id,
            remoteId: g.generationId,
            prompt: promptText,
            model: g.model,
            duration: dur,
            status: g.status as "pending" | "processing",
            videoUrl: null,
            cost: g.costRub,
            error: null,
          };
        });

        setTasks((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const newTasks = recovered.filter((t) => !existingIds.has(t.id));
          if (newTasks.length === 0) return prev;
          return [...prev, ...newTasks];
        });
      } catch {
        /* DB recovery is best-effort */
      }
    };
    recover();
  }, []);

  const handleVideoDownload = async (taskId: string, remoteId: string) => {
    try {
      const bytes = await downloadVideo(remoteId);
      const uint8 = new Uint8Array(bytes);
      const blob = new Blob([uint8], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      videoUrlsRef.current.add(url);

      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, videoUrl: url } : t)),
      );

      const task = tasksRef.current.find((t) => t.id === taskId);
      if (task) {
        saveGeneration({
          id: taskId,
          projectId: null,
          model: task.model,
          endpoint: "/v1/videos",
          requestJson: JSON.stringify({
            prompt: task.prompt,
            model: task.model,
            duration: task.duration,
          }),
          status: "completed",
          mediaPath: url,
          mediaType: "video/mp4",
          parentId: null,
          costRub: task.cost,
          generationId: remoteId,
        }).catch(() => {});
      }
    } catch (e) {
      setError(String(e));
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: "failed" as const, error: `Download failed: ${e}` }
            : t,
        ),
      );
      pollTimeoutsRef.current.delete(taskId);
    }
  };

  const doPoll = async (taskId: string) => {
    const task = tasksRef.current.find((t) => t.id === taskId);
    if (!task?.remoteId || (task.status !== "pending" && task.status !== "processing")) {
      pollTimeoutsRef.current.delete(taskId);
      return;
    }

    try {
      const result = await pollVideo(task.remoteId);
      const data = JSON.parse(result);

      const current = tasksRef.current.find((t) => t.id === taskId);
      if (!current) return;

      if (data.cost != null && current.cost !== data.cost) {
        saveGeneration({
          id: taskId,
          projectId: null,
          model: current.model,
          endpoint: "/v1/videos",
          requestJson: JSON.stringify({
            prompt: current.prompt,
            model: current.model,
            duration: current.duration,
          }),
          status: current.status,
          mediaPath: current.videoUrl,
          mediaType: "video/mp4",
          parentId: null,
          costRub: data.cost,
          generationId: current.remoteId,
        }).catch(() => {});
      }

      if (data.status === "completed") {
        pollTimeoutsRef.current.delete(taskId);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, status: "completed" as const, cost: data.cost ?? t.cost }
              : t,
          ),
        );
        await handleVideoDownload(taskId, current.remoteId!);
        return;
      }

      if (data.status === "failed") {
        pollTimeoutsRef.current.delete(taskId);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: "failed" as const,
                  error: data.error ?? "Generation failed",
                  cost: data.cost ?? t.cost,
                }
              : t,
          ),
        );
        saveGeneration({
          id: taskId,
          projectId: null,
          model: current.model,
          endpoint: "/v1/videos",
          requestJson: JSON.stringify({
            prompt: current.prompt,
            model: current.model,
            duration: current.duration,
          }),
          status: "failed",
          mediaPath: null,
          mediaType: "video/mp4",
          parentId: null,
          costRub: data.cost ?? current.cost,
          generationId: current.remoteId,
        }).catch(() => {});
        return;
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: (data.status as VideoTask["status"]) || t.status,
                cost: data.cost ?? t.cost,
              }
            : t,
        ),
      );

      const delay = data.status === "processing" ? 3000 : 5000;
      const to = setTimeout(() => doPoll(taskId), delay);
      pollTimeoutsRef.current.set(taskId, to);
    } catch {
      const to = setTimeout(() => doPoll(taskId), 5000);
      pollTimeoutsRef.current.set(taskId, to);
    }
  };

  const schedulePoll = (taskId: string) => {
    if (pollTimeoutsRef.current.has(taskId)) return;
    const to = setTimeout(() => doPoll(taskId), 5000);
    pollTimeoutsRef.current.set(taskId, to);
  };

  useEffect(() => {
    for (const task of tasks) {
      if (!task.remoteId) continue;
      if (task.status !== "pending" && task.status !== "processing") continue;
      schedulePoll(task.id);
    }
  }, [tasks]);

  const handleModelChange = (newModel: string) => {
    setDefaultModel(newModel);
    setSetting("default_video_model", newModel).catch(() => {});
  };

  const handleCreate = async () => {
    if (!prompt.trim()) return;
    setError(null);
    const taskId = generateId();

    const newTask: VideoTask = {
      id: taskId,
      remoteId: null,
      prompt: prompt.trim(),
      model: defaultModel,
      duration,
      status: "pending",
      videoUrl: null,
      cost: null,
      error: null,
    };
    setTasks((prev) => [newTask, ...prev]);

    try {
      const result = await createVideo({
        prompt: prompt.trim(),
        model: defaultModel,
        duration,
      });
      const parsed = JSON.parse(result);
      const remoteId: string | null = parsed?.id ?? null;

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, remoteId, status: "processing" as const }
            : t,
        ),
      );

      saveGeneration({
        id: taskId,
        projectId: null,
        model: defaultModel,
        endpoint: "/v1/videos",
        requestJson: JSON.stringify({
          prompt: prompt.trim(),
          model: defaultModel,
          duration,
        }),
        status: "processing",
        mediaPath: null,
        mediaType: "video/mp4",
        parentId: null,
        costRub: null,
        generationId: remoteId,
      }).catch(() => {});
    } catch (e) {
      setError(String(e));
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: "failed" as const, error: String(e) }
            : t,
        ),
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
              value={defaultModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
            >
              <option value={4}>4s</option>
              <option value={8}>8s</option>
              <option value={12}>12s</option>
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

        {error && (
          <div className="mx-4 mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

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
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm text-zinc-300">
                      {task.prompt}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {task.model}
                      {task.duration && (
                        <span className="ml-2">
                          {DURATION_LABELS[task.duration] ?? `${task.duration}s`}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="ml-4 flex shrink-0 items-center gap-3">
                    {task.cost != null && (
                      <span className="text-xs text-zinc-500">
                        {formatCostRub(task.cost)}
                      </span>
                    )}
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
                              ? "animate-pulse bg-amber-400"
                              : "bg-zinc-600",
                      )}
                    />
                  </div>
                </div>

                {task.status === "processing" && (
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800">
                    <div className="animate-progress h-full rounded-full bg-violet-500" />
                  </div>
                )}

                {task.status === "failed" && task.error && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-400">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{task.error}</span>
                  </div>
                )}

                {task.status === "completed" && task.videoUrl && (
                  <div className="mt-3">
                    <video
                      src={task.videoUrl}
                      controls
                      className="w-full rounded-lg"
                      style={{ maxHeight: 400 }}
                    />
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

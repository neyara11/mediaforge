# MediaForge: полный аудит реализации

> **Дата:** 2026-07-23 21:15 MSK
> **Основа:** архитектурный план (P0–P13) + audit subagent report

---

## Сводка по студиям

| Студия | Статус | Деньги? | Результат? |
|---|---|---|---|
| **Image** | Частично работает | Да | Да, но без ошибок в UI |
| **Video** | 💀 Сломан | **Да (65₽)** | **Нет** — вечный «Processing» |
| **Music** | ✅ Работает | Да | Да (текст + аудио) |
| **Speech TTS** | ✅ Работает | Да | Да (MP3 плеер) |
| **Speech STT** | Заглушка | Нет | Нет |

---

## 1. Критические баги (деньги списаны, результата нет)

### 1.1. Video Studio — 65₽ потеряно

**Симптом:** Нажал Generate → списание 65.29₽ (Veo 3.1 Lite) → карточка «Processing» висит бесконечно.

**Причина:** `VideoStudioPage.tsx` вызывает `createVideo()` (POST /v1/videos), получает `{ id: "..." }`, ставит статус `"processing"` — и **останавливается**. `pollVideo()` и `downloadVideo()` существуют в `videos.ts`, но **НИКОГДА НЕ ИМПОРТИРУЮТСЯ** в `VideoStudioPage.tsx`. Нет ни `setInterval`, ни `useEffect` для поллинга.

```ts
// VideoStudioPage.tsx:3 — импортируется ТОЛЬКО createVideo
import { createVideo } from "../../api/endpoints/videos";
// pollVideo и downloadVideo — не импортированы!

// VideoStudioPage.tsx:48-52 — после ответа API только setStatus("processing")
const remoteId = parsed?.id ?? null;
setTasks((prev) => prev.map((t) =>
  t.id === taskId ? { ...t, remoteId, status: "processing" } : t,
));
// ДАЛЕЕ НИЧЕГО. НЕТ ПОЛЛИНГА.
```

**План исправления:**
1. Импортировать `pollVideo`, `downloadVideo`
2. Добавить `useEffect` с `setInterval` (5 сек ожидание, 3 сек processing)
3. При `status === "completed"` → `downloadVideo()` → сохранить как `mediaPath`
4. Добавить `<video>` плеер для просмотра результата
5. Восстановление незавершённых задач из БД при старте

### 1.2. Image Studio — 3 запроса, результат потерян

**Симптом:** Три вызова Flux 2 Klein (0₽ каждый), сообщение «Введите промпт и нажмите Generate».

**Причина:** `ImageStudioPage.tsx` НЕ ИМЕЕТ `error` state. При ошибке API вызывается только `console.error("Generation failed:", e)` — без пользовательского UI. Если ответ API не содержит `data[].b64_json`, results остаётся пустым массивом, и показывается empty state «Введите промпт».

```ts
// ImageStudioPage.tsx:67-69 — catch блок без error state
} catch (e) {
  console.error("Generation failed:", e);
  // НЕТ: setError(...)
  // НЕТ: error UI в JSX
}
```

**План исправления:**
1. Добавить `const [error, setError] = useState<string | null>(null)`
2. Показывать красный баннер ошибки (как в Music Studio и Speech Lab)
3. Логировать полный ответ API при ошибке парсинга

---

## 2. Существенные баги

### 2.1. Модель по умолчанию не сохраняется между перезапусками

**Файл:** `src/shared/useDefaultModel.ts:80`

Хук сохраняет `default_${modality}_model` через `setSetting()`, но при старте **никогда не читает** это значение обратно. Всегда берёт `ids[0]`.

```ts
// useDefaultModel.ts:80
setDefaultModel(ids[0]); // всегда первый в списке, игнорирует сохранённый выбор
```

**План:** При инициализации прочитать `getSetting("default_image_model")` и использовать если есть.

### 2.2. Нет retry на binary/stream запросах

**Файл:** `src-tauri/src/api/client.rs`

`api_post_binary()` и `api_post_stream()` не используют `with_retry()`. Один transient network error → немедленный фейл. Для Video Studio (где один запрос стоит 65₽) это критично.

**План:** Обернуть оба в `with_retry` с осторожностью (повторять только при 5xx, не при 4xx).

### 2.3. Image Studio: нет отображения ошибок

**Файл:** `src/features/image-studio/ImageStudioPage.tsx`

Отсутствует `error` state и error banner. Music Studio и Speech Lab имеют красные баннеры ошибок, Image и Video — нет.

### 2.4. Video Studio: нет отображения ошибок

Аналогично Image Studio — только `console.error`.

### 2.5. Music Studio: costs не трекаются

`costRub: null` при сохранении в БД. Ответ API содержит `usage.cost`, но не извлекается.

---

## 3. Заглушки (не реализовано)

### 3.1. Speech Lab STT — полная заглушка

**Файл:** `src/features/speech-lab/SpeechLabPage.tsx:132-142`

Вкладка «Speech to Text» — только placeholder-текст:
- Нет `<input type="file">`
- Нет drag-and-drop обработчика
- Нет вызова `speechToText()` (функция есть в `speech.ts`, но не импортирована)
- Rust-команда `speech_to_text` существует, но недостижима

### 3.2. Video Studio polling — не реализован

`pollVideo()` и `downloadVideo()` написаны в API слое, но никогда не вызываются.

### 3.3. Image-to-Image / input_references — не реализовано

План (P7) описывает:
- `input_references` для image-to-image
- Canvas overlay для правок
- Comparison slider «было/стало»

Ничего из этого не сделано. Есть только базовая генерация по тексту.

### 3.4. Prompt Builder — частичная заглушка

Компонент существует (`PromptBuilderPanel.tsx`) и открывается из всех студий. Но:
- Для Image Studio: mode="image" — работает
- Для Music Studio: mode="lyrics" — работает
- Для Video Studio: mode НЕ ПЕРЕДАЁТСЯ (нет кнопки Prompt Builder в Video Studio)

### 3.5. Iteration History Tree — не реализовано

План (C7) описывает дерево итераций с parent_id. `parent_id` есть в схеме БД, но нигде не используется.

### 3.6. Cost Tracker — заглушка

Компонент `CostTracker.tsx` существует, но показывает хардкодные значения, не агрегирует из БД.

---

## 4. Уже исправленные ошибки (для истории)

| # | Ошибка | Коммит | Статус |
|---|---|---|---|
| 1 | SQLite: двоеточие в Windows-пути → unable to open database | `a424d62` | ✅ |
| 2 | API-ключ не сохранялся между перезапусками | `4e737d0` | ✅ |
| 3 | Чёрный экран в каталоге моделей (JSON-парсинг) | `389ddcf` | ✅ |
| 4 | Студии не использовали настройки моделей | `b4e34f4` | ✅ |
| 5 | Prompt Builder хардкодил gpt-4o | `0ecbc7d` | ✅ |
| 6 | Music Studio: английские тексты | `342e2d4` | ✅ |
| 7 | Lyria 3: пропущен параметр `audio: {format:"mp3"}` | `07c1881` | ✅ |
| 8 | UTF-8 panic в chat.rs:77 | `07c1881` | ✅ |
| 9 | Object URL'ы удалялись при добавлении трека | `07c1881` | ✅ |
| 10 | Скачивание не работало в Tauri WebView2 | `f8d162d` | ✅ |
| 11 | Текст песни был read-only | `472b786` | ✅ |
| 12 | Image quality: standard/hd → auto/low/medium/high | `3c04125` | ✅ |
| 13 | TTS: голоса хардкодные (eve/alloy/nova/shimmer — только OpenAI) | `46d5e34` | ✅ |
| 14 | TTS: смена модели не меняла список голосов | `46d5e34` | ✅ |
| 15 | TTS: voice обязательный → опциональный в Rust (для моделей без голоса) | `46d5e34` | ✅ |
| 16 | TTS: неверные голоса Grok (adam/sage/lumen → ara/rex/sal/leo) | `53a76be` | ✅ |
| 17 | TTS: Qwen — voice был пустой, но обязателен (loongjohn, longanhuan_v3.6) | `53a76be` | ✅ |

### 4.1. Остающиеся проблемы TTS

| # | Проблема | Симптом | Причина |
|---|---|---|---|
| T1 | Голоса загружаются из хардкодной карты, а не из API | При добавлении новой TTS-модели голоса не появятся | RouterAI не возвращает `voices` в `GET /v1/models`; модель-специфичные голоса только на странице модели |
| T2 | Image Studio: 3 вызова API, результат не показан | Три запроса Flux (0₽), сообщение «Введите промпт» | Нет `error` state — при ошибке парсинга ответа показывается empty state |

### 4.2. Остающиеся проблемы Video Studio

| # | Проблема | Симптом | Причина |
|---|---|---|---|
| V1 | 65₽ списано, результата нет | Карточка «Processing» висит бесконечно | `pollVideo()`/`downloadVideo()` не импортированы и не вызываются |
| V2 | Нет `<video>` плеера | Даже при успешном поллинге негде смотреть | Компонент не содержит video-элемента |
| V3 | Задачи не восстанавливаются после перезапуска | При обновлении страницы список пуст | `tasks` — React state, не загружается из БД |

---

## 5. Приоритетный план исправлений

### P0 — Критическое (деньги теряются / функциональность отсутствует)

| # | Задача | Файлы | Время |
|---|---|---|---|
| **P0.1** | Video Studio: добавить поллинг + video-плеер + восстановление из БД | `VideoStudioPage.tsx`, `videos.ts` | 1.5ч |
| **P0.2** | Image Studio: добавить error state + баннер ошибки | `ImageStudioPage.tsx` | 15м |
| **P0.3** | Video Studio: добавить error state + баннер ошибки | `VideoStudioPage.tsx` | 10м |
| **P0.4** | Speech Lab STT: file input + drag-drop + вызов `speechToText()` | `SpeechLabPage.tsx` | 40м |

### P1 — Существенное (функциональность сломана или неполная)

| # | Задача | Файлы | Время |
|---|---|---|---|
| **P1.1** | Восстановление default model из настроек (useDefaultModel) | `useDefaultModel.ts` | 15м |
| **P1.2** | Retry на api_post_binary и api_post_stream | `client.rs` | 20м |
| **P1.3** | TTS: загружать голоса из `GET /v1/models/{id}` при смене модели | `SpeechLabPage.tsx`, `models.rs` | 30м |
| **P1.4** | Music Studio: cost tracking (извлечение `usage.cost` из ответа) | `chat.rs`, `MusicStudioPage.tsx` | 15м |

### P2 — Новый функционал

| # | Задача | Файлы | Время |
|---|---|---|---|
| **P2.1** | Image-to-Image: загрузка референса, input_references | `ImageStudioPage.tsx`, `images.rs` | 45м |
| **P2.2** | Cost tracking во всех студиях | все `*Page.tsx` | 30м |
| **P2.3** | Prompt Builder для Video Studio | `VideoStudioPage.tsx` | 15м |
| **P2.4** | Music Studio: Phase 2 теги стиля (см. music-studio-full-plan.md) | `MusicStudioPage.tsx` | 1ч |

---

## 6. Полнота реализации против плана

| Модуль | План | Реализовано | % |
|---|---|---|---|
| **P0** Project skeleton | ✅ | ✅ | 100% |
| **P1** Unified API Client | ✅ | ✅ | 100% |
| **P2** SQLite + filesystem | ✅ | ✅ | 100% |
| **P3** Auth & Onboarding | ✅ | ✅ | 100% |
| **P4** Model Catalog & Settings | ✅ | ✅ | 100% |
| **P5** Prompt Builder | ✅ | ⚠️ частично (нет для Video) | 80% |
| **P6** Image Studio: генерация | ✅ | ⚠️ нет error state | 90% |
| **P7** Image Studio: итерации | ✅ | ❌ не реализовано | 0% |
| **P8** Speech Lab: TTS | ✅ | ✅ | 100% |
| **P9** Speech Lab: STT | ✅ | ❌ заглушка | 5% |
| **P10** Video Studio | ✅ | 💀 сломан (нет поллинга, плеера, восстановления) | 15% |
| **P11** Music Studio | ✅ | ✅ (базовый, без тегов/cost tracking) | 85% |
| **P12** Cost Tracker + History | ✅ | ❌ заглушки | 10% |
| **P13** Упаковка | ✅ | ❌ не начато | 0% |

**Общая полнота: ~62%** (с учётом веса критичных модулей)

---

## 7. TTS: таблица голосов (подтверждено из документации RouterAI)

| Модель | Голоса | Источник |
|---|---|---|
| `x-ai/grok-voice-tts-1.0` | eve, ara, rex, sal, leo | https://routerai.ru/models/x-ai/grok-voice-tts-1.0 |
| `qwen/qwen-audio-3.0-tts-flash` | loongjohn, longanhuan_v3.6 | https://routerai.ru/models/qwen/qwen-audio-3.0-tts-flash |
| `openai/tts-1` и аналоги | alloy, echo, fable, onyx, nova, shimmer | Стандарт OpenAI |
| `elevenlabs/...` | rachel, domi, bella, antoni, elli, josh, arnold, adam, sam | Документация ElevenLabs |
| `minimax/...` | male-qn-qingse, female-qn-qingse, male-qn-jingying, presenter_* | Документация MiniMax |

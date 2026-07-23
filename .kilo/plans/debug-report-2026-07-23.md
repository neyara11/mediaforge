# MediaForge: Отчёт о реализации и проблемах

> **Дата:** 2026-07-23 20:16 MSK
> **Последний коммит:** `190fb1d` — fix: Lyria 3 returns text with music notation, not PCM16
> **Ветка:** main

---

## 1. Что реализовано

### Стек
- Tauri v2 + React 19 + TypeScript 6 + Tailwind CSS v4
- Rust backend: reqwest, sqlx (SQLite), tauri-plugin-store, tauri-plugin-sql, tauri-plugin-shell, tauri-plugin-notification
- Frontend: react-router-dom v7, react-i18next, lucide-react
- Инструменты: ESLint 9 (flat config), Prettier, Vitest

### Project skeleton (P0)
- `D:\git\mediaforge\` — корень проекта
- `src/` — React фронтенд
- `src-tauri/` — Rust бэкенд
- `src-tauri/src/lib.rs` — точка входа, `generate_handler![]` со всеми командами
- `src-tauri/src/commands/` — Tauri команды (auth, chat, db_commands, images, models, speech, storage, videos)
- `src-tauri/src/api/` — HTTP клиент (client.rs, retry.rs, types.rs)
- `src-tauri/src/db/` — SQLite schema + утилиты

### Архитектура API
**Все запросы к RouterAI идут через Rust** (Tauri commands → reqwest → RouterAI).
Frontend НЕ делает прямых HTTP-запросов.

```
React UI → invoke("command") → Rust handler → reqwest → RouterAI
```

### Ключевые файлы (текущее состояние)

| Файл | Назначение |
|---|---|
| `src-tauri/src/commands/chat.rs` | `chat_completion`, `chat_audio_generate` (SSE streaming) |
| `src-tauri/src/api/client.rs` | `ApiState`, `api_get`, `api_post`, `api_post_binary`, `api_post_stream` |
| `src-tauri/src/commands/db_commands.rs` | CRUD для SQLite (projects, generations, model_cache, user_settings) |
| `src-tauri/src/db/mod.rs` | SQL schema, `init_dirs()`, `get_db_path()` |
| `src/shared/useDefaultModel.ts` | Хук — загружает сохранённые модели из `user_settings` |
| `src/features/settings/ModelCatalog.tsx` | Каталог моделей + настройка «доступных» для каждого режима |
| `src/features/settings/SettingsPage.tsx` | Страница настроек (General: язык, ffmpeg, сброс ключа; Models: каталог) |
| `src/features/auth/OnboardingPage.tsx` | 5-шаговый онбординг (welcome → API key → models → system/ffmpeg → ready) |
| `src/features/auth/AuthContext.tsx` | Контекст авторизации, `checkAuth()` при старте |
| `src/features/music-studio/MusicStudioPage.tsx` | Музыкальная студия (текст песни → генерация через Lyria 3) |
| `src/features/image-studio/ImageStudioPage.tsx` | Генерация изображений |
| `src/features/speech-lab/SpeechLabPage.tsx` | TTS (озвучка) |
| `src/features/video-studio/VideoStudioPage.tsx` | Async генерация видео |
| `src/features/prompt-builder/PromptBuilderPanel.tsx` | AI-ассистент промптов (image/video/lyrics) |
| `src/components/ErrorBoundary.tsx` | Защита от краша компонентов |
| `src/components/CostTracker.tsx` | Счётчик расходов в сайдбаре |

### i18n (ru/en)
- `src/i18n/locales/{ru,en}/common.json` — общие строки
- `src/i18n/locales/{ru,en}/onboarding.json` — онбординг
- `src/i18n/locales/{ru,en}/models.json` — каталог моделей
- `src/i18n/locales/{ru,en}/settings.json` — настройки

---

## 2. Решённые проблемы

### SQLite: двоеточие в Windows-пути
**Симптом:** `unable to open database file` при старте.
**Причина:** `format!("sqlite:{}", db_path)` → `sqlite:C:\Users\...` — два двоеточия.
**Исправление:** `SqliteConnectOptions::new().filename(&db_path).create_if_missing(true)` (`lib.rs:33`)

### Ключ не сохранялся между перезапусками
**Причина:** `AuthContext` стартовал с `onboardingComplete: false` всегда.
**Исправление:** Добавлен `check_auth` command (проверяет `settings.json`), `AuthProvider` вызывает при mount. Если ключ есть — пропускает онбординг.

### Чёрный экран в каталоге моделей
**Причина:** `pricing_json`/`output_modalities` из SQLite-кеша — JSON-строки, а не объекты/массивы. `cached as RouterAIModel[]` врало о типе.
**Исправление:** `safeJsonParse()` при чтении из кеша (`ModelCatalog.tsx:29`).

### Модели в студиях не использовали настройки
**Причина:** Студии имели хардкодные выпадайки.
**Исправление:** Хук `useDefaultModel(modality)` — читает `user_settings.available_{modality}_models`, возвращает отфильтрованный список. Все студии переписаны на этот хук.

### Двухэтапный выбор моделей
**Причина:** Студии показывали все модели API, а не настроенные пользователем.
**Исправление:**
1. Settings → Models — блок «Доступные модели» (6 карточек). Добавление: кнопка `+` в таблице ИЛИ ручной ввод ID.
2. Студии — выпадайка только из «доступных».

### Prompt Builder хардкодил gpt-4o
**Исправление:** `useDefaultModel("text")` → `model: defaultModel`.

### Music Studio: lyrics на английском
**Исправление:** System prompt указывает язык пользователя (`Russian` при `i18n.language === "ru"`).

### ffmpeg: требовался PATH
**Исправление:** Добавлено поле ввода пути в Settings → General и Onboarding → System Check. Сохраняется в `user_settings.ffmpeg_path`.

---

## 3. Нерешённые проблемы

### 3.1. Music Studio: Lyria 3 возвращает текст, а не аудио
**Симптом:** API-вызов успешен (токены 556/569, 8.16₽), но нет звука.
**Причина:** RouterAI Lyria 3 через `/v1/chat/completions` с `modalities: ["text","audio"]` возвращает текст песни с нотацией (`[[A0]]`, `[[B1]]`, `[12.0:]`), а не PCM16 аудио.
**Формат SSE:**
```
: PROCESSING
data: {"choices":[{"delta":{"content":"[[A0]]\n[[B1]]\n[12.0:] За окном погасли фонари..."}}]}
```
Поле `delta.content`, не `delta.audio`.
**Текущее состояние:** Парсер собирает текст в `lyrics_text`, возвращает как результат. Трек показывается с текстом, но без аудио.
**Что нужно:** Уточнить в документации RouterAI — как получить реальное аудио. Возможные варианты:
- Другой эндпоинт (не `/v1/chat/completions`)
- Другая модель
- Другой параметр (например, `audio: { voice: "...", format: "mp3" }`)
- Использовать TTS для озвучки текста песни (обходной путь)

### 3.2. Tauri IPC: ERR_CONNECTION_REFUSED на ipc.localhost
**Симптом:** В консоли браузера: `POST http://ipc.localhost/chat_audio_generate net::ERR_CONNECTION_REFUSED`
**Причина:** Tauri пробует кастомный IPC-протокол → fail → fallback на postMessage. Это штатное поведение на некоторых системах.
**Влияние:** Команды всё равно работают через fallback. Не блокирует функциональность.
**Исправление:** Не требуется (норма).

---

## 4. Процесс запуска

```powershell
# 1. Перейти в папку проекта
cd D:\git\mediaforge

# 2. Запустить Tauri dev (фронтенд + бэкенд)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
npm run tauri dev

# 3. Для проверки только фронтенда (без Rust)
npm run dev   # → http://localhost:1420
```

### Где смотреть логи
| Тип | Где |
|---|---|
| Rust (`eprintln!`) | Терминал `npm run tauri dev` |
| Frontend (`console.log`) | F12 → Console (в окне Tauri: ПКМ → Inspect) |
| RouterAI запросы | https://routerai.ru/settings/logs |

### Проверка кода
```powershell
# TypeScript
cd D:\git\mediaforge
node node_modules/typescript/bin/tsc --noEmit

# Rust
C:\Users\pechn\AppData\Local\Temp\cargo_check.bat
# (требует vcvars64.bat из VS Build Tools)
```

---

## 5. Зависимости окружения

| Компонент | Версия | Статус |
|---|---|---|
| Node.js | 22.20.0 | ✅ |
| npm | 10.9.3 | ✅ |
| Rust (MSVC) | 1.97.1 | ✅ |
| VS Build Tools 2022 | 14.44 | ✅ (C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools) |
| vcvars64.bat | — | Требуется для cargo (лежит в C:\Users\pechn\AppData\Local\Temp\cargo_check.bat) |
| ffmpeg | не установлен | Нужен для конвертации аудио/видео |
| WebView2 | встроен в Windows 10+ | Для Tauri |
| Git | — | Remote: https://github.com/neyara11/mediaforge.git |

---

## 6. Структура БД (SQLite)

Файл: `{app_data_dir}/mediaforge.db` (обычно `%APPDATA%/com.mediaforge.app/mediaforge.db`)

```sql
projects (id TEXT PK, name, type, created_at, updated_at)
generations (id TEXT PK, project_id FK, model, endpoint, request_json, response_json, status, media_path, media_type, thumbnail_path, parent_id FK, cost_rub, generation_id, created_at, completed_at)
model_cache (id TEXT PK, name, provider, input_modalities, output_modalities, pricing_json, supported_params, cached_at)
user_settings (key TEXT PK, value, updated_at)
```

Ключи `user_settings`:
- `api_key` — в `settings.json` (tauri-plugin-store)
- `available_{image,video,audio,stt,tts,text}_models` — JSON-массив ID моделей
- `default_{image,video,audio,stt,tts,text}_model` — ID модели по умолчанию
- `ffmpeg_path` — путь к ffmpeg.exe
- `monthly_spending_limit` — лимит расходов

---

## 7. План дальнейшей отладки

### Приоритет 1: Аудио-генерация
1. Открыть https://routerai.ru/models — найти доступные audio-модели
2. Проверить документацию RouterAI по audio-генерации (формат ответа)
3. Если модель возвращает текст — интегрировать TTS для озвучки
4. Если нужен другой эндпоинт — добавить его в API-клиент

### Приоритет 2: Проверка работоспособности
- [ ] Image Studio: проверить генерацию с реальным API-ключом
- [ ] Speech Lab TTS: проверить озвучку
- [ ] Speech Lab STT: реализовать drag-and-drop + вызов API
- [ ] Video Studio: проверить полный цикл (create → poll → download)

### Приоритет 3: Улучшения
- [ ] Добавить `tauri-plugin-dialog` для выбора файлов (ffmpeg, загрузка медиа)
- [ ] CostTracker: агрегация из generations + лимиты
- [ ] History tree (дерево итераций)
- [ ] Export/sharing

---

## 8. История коммитов (сегодня)

```
190fb1d fix: Lyria 3 returns text with music notation, not PCM16 — corrected SSE parser for delta.content
7567e31 debug: improved SSE audio logging — show JSON keys when audio field not found
8862041 debug: add SSE audio format logging to identify RouterAI response structure
afe45ac feat: streaming audio generation for Music Studio — SSE PCM16 → WAV assembly + playback
0ecbc7d fix: PromptBuilder uses text model from settings, add ffmpeg path config in Settings + Onboarding
342e2d4 fix: Music Studio uses text model from settings, i18n labels, language-aware lyrics, real API call
3a5c8c4 feat: two-step model selection — configure available models in Settings, then pick from them in Studios. Removed 200-model limit.
b4e34f4 feat: useDefaultModel hook - studios now use saved default models from settings + audio detection fix
4e737d0 fix: persist auth across restarts + robust modality detection + audio filter
389ddcf fix: onboarding models count, ffmpeg instructions, model cache parsing + ErrorBoundary
2eda68c fix: show error details in onboarding + console.error logging
a424d62 fix: use SqliteConnectOptions builder to avoid Windows path colon issue
10e9367 feat: initial MediaForge implementation (P0-P12)
```

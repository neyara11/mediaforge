# MediaForge: Локальный мультимедийный инструмент на RouterAI API — Исследовательский отчёт

> **Дата:** 2026-07-23
> **Статус:** Research complete, implementation-ready
> **Цель:** Ответить на вопрос «Как разбить задачу на промпты к LLM, чтобы она написала рабочий инструмент, не галлюцинируя API и не теряя контекст?» и предоставить архитектурный фундамент.

---

## 5.1. Executive Summary

### Ключевые рекомендации

1. **Стек: Tauri v2 + React 19 + TypeScript + SQLite + ffmpeg sidecar.** Tauri даёт ~5MB bundle против 150MB у Electron, нативную безопасность ключей через OS keystore, встроенную поддержку sidecar-бинарников (ffmpeg) и SQL-плагин для SQLite. React 19 + TypeScript — стандарт, совместимый с shadcn/ui для UI-компонентов.

2. **Промпт-стратегия: «Спецификация каждого модуля → изолированный промпт на модуль».** Монопромпт неработоспособен для проекта такого масштаба. Каждый модуль (API-клиент, Image Studio, Video Studio, Music Studio, Speech Lab) получает отдельный промпт с: (а) спецификацией эндпоинтов RouterAI, затрагиваемых модулем, (б) структурой данных запросов/ответов, (в) ссылкой на готовый код соседних модулей.

3. **API-ключ хранить в OS keystore (DPAPI/Keychain/libsecret), НЕ в plaintext.** Tauri предоставляет `tauri-plugin-store` с secure storage. Ключ никогда не должен быть доступен из фронтенд-рендерера — все API-вызовы идут через Rust main process либо через Tauri commands.

4. **Мультиязычный интерфейс (русский/английский) на react-i18next.** Все строки внешние в JSON locale-файлах. Переключение языка в Settings без перезагрузки.

5. **Priority order для реализации:** (1) API-client unified layer + auth/onboarding + i18n scaffold, (2) Model configuration & pricing browser, (3) Prompt Builder Assistant, (4) Image Studio, (5) Speech Lab, (6) Video Studio, (7) Music Studio. Первые три модуля создают фундамент, используемый всеми остальными.

### Критические риски

- **RouterAI меняет API без предупреждения** — необходима абстракция model-capability-registry, программно получаемая из `GET /api/v1/models`.
- **SSE-потоки обрываются** — нужна буферизация PCM16 чанков с возобновлением.
- **Async video polling не защищён от краша приложения** — задачи должны сохраняться в SQLite и восстанавливаться при перезапуске.
- **ffmpeg sidecar ~80MB** (даже stripped) увеличивает bundle — приемлемо для десктоп-приложения.

### Рекомендуемый порядок действий

```
Phase 1: Скелет проекта (Tauri + React + SQLite + unified API client + i18n + auth flow)
Phase 2: Model Catalog & Settings (просмотр моделей, цены, выбор по умолчанию, настройки)
Phase 3: Prompt Builder Assistant (AI-ассистент построения промптов для всех модальностей)
Phase 4: Image Studio (генерация, streaming preview, image-to-image, итерации)
Phase 5: Speech Lab (TTS + STT, выбор модели, A/B голосов)
Phase 6: Video Studio (async generation, polling queue, image-to-video pipeline)
Phase 7: Music Studio (Lyria 3, song structure, STT+переозвучка, генерация текстов песен)
Phase 8: Полировка (cost tracking, history tree, error handling, packaged distribution)
```

---

## 5.2. Prompt Engineering Strategy (Блок A)

### A1: Стратегия разбиения на промпты

**Решение: «Спецификация → модуль за модулем» с фиксированным контекстом-преамбулой.**

Сравнение подходов:

| Подход | Плюсы | Минусы | Вердикт |
|---|---|---|---|
| Монопромпт (весь проект) | Нет потери контекста | 128K недостаточно для 7 эндпоинтов + UI + архитектуры. Галлюцинации растут экспоненциально с длиной промпта | ❌ |
| 20+ микро-промптов | Проще отладка каждого | Потеря связности между модулями, дублирование кода, стиль дрифтует | ❌ |
| Спецификация → модуль за модулем | Контекст изолирован, связность через артефакты (интерфейсы), каждый промпт самодостаточен | Требует дисциплины в проектировании интерфейсов заранее | ✅ |

**План промптов (14 промптов):**

```
P0:  Создание проекта Tauri v2 + React 19 + TypeScript + настройка инструментов + i18n scaffold (react-i18next)
P1:  Unified API Client (типы для всех эндпоинтов, HTTP-обёртка с retry, auth-токен из keystore)
P2:  Локальное хранилище (SQLite schema, CRUD для проектов/итераций, filesystem layout для медиа)
P3:  Auth & Onboarding flow (ввод ключа, тестовый запрос, загрузка каталога моделей)
P4:  Model Catalog & Settings (просмотр моделей с ценами, фильтрация, сравнение, модель по умолчанию)
P5:  Prompt Builder Assistant (AI-ассистент: image prompt, lyrics/poetry, video prompt, refinement)
P6:  Image Studio — генерация и streaming (POST /v1/images, SSE preview, grid выбора)
P7:  Image Studio — итеративные правки (input_references, canvas overlay, comparison slider)
P8:  Speech Lab — TTS (POST /v1/audio/speech, выбор модели/голоса, PCM→MP3 конвертация)
P9:  Speech Lab — STT (POST /v1/audio/transcriptions, verbose_json, таймстемпы)
P10: Video Studio — async generation (POST /v1/videos, polling queue, webhook-приёмник)
P11: Music Studio (POST /v1/chat/completions с modalities: audio, PCM16 сборка, lyrics, Prompt Builder)
P12: Общие компоненты (Cost tracker, History tree, Media viewer, Settings, ErrorBoundary)
P13: Упаковка и дистрибуция (ffmpeg sidecar, installer, автообновление)
```

Каждый промпт P1–P10 включает контекст-преамбулу (см. A3).

### A2: Предотвращение галлюцинаций о несуществующих параметрах API

**Решение: Включать в промпт ТОЛЬКО фактическую документацию эндпоинта RouterAI (из llms-full.txt), а не полагаться на «знания» LLM об OpenAI API.**

Причина: RouterAI имеет специфические отличия от OpenAI:
- TTS ответ — бинарный blob, не JSON; заголовок `X-Generation-Id`
- Video через `POST /v1/videos` (асинхронный), не через chat completions
- Audio generation через `/v1/chat/completions` с `modalities: ["text","audio"]`, только stream
- `input_references` для image-to-image
- `input_audio` — base64 строка, не data URI
- `usage.cost` в рублях во всех ответах
- `provider` объект для маршрутизации (специфично для RouterAI)

Метод: в каждом модульном промпте ВСТРАИВАТЬ релевантный фрагмент из документации RouterAI (взят из llms-full.txt или .md страниц), а не просто ссылаться на docs URL.

### A3: Минимальный контекст для каждого промпта (шаблон)

```markdown
## Project: MediaForge — локальный мультимедийный инструмент на RouterAI API
- Stack: Tauri v2, React 19, TypeScript, Tailwind CSS, shadcn/ui
- i18n: react-i18next, locale files in src/i18n/locales/{ru,en}/, useTranslation() hook
- API base URL: https://routerai.ru/api/v1
- Auth: Bearer token, хранится в OS keystore через tauri-plugin-store

## Relevant RouterAI API Spec (для этого модуля):
[ТОЧНАЯ спецификация эндпоинта — методы, параметры, формат ответа, ограничения]

## Existing code you can reference:
- src/shared/types.ts — общие типы
- src/api/client.ts — HTTP client с retry
- src/db/schema.ts — SQLite schema
- [файлы соседних модулей]

## Task: [конкретная задача]

## Constraints:
- Не выдумывай параметры API, которых нет в спецификации выше
- API-ключ недоступен на фронтенде, все запросы — через Tauri commands
- Используй существующие shared-типы из src/shared/types.ts
- Медиафайлы храни локально: пути в SQLite, контент в filesystem
```

### A4: Управление версионированием кода

**Решение: Git-based flow. После каждого промпта — git commit.**

Процесс:
1. P0 → коммит `feat: project skeleton`
2. P1 → коммит `feat: unified api client`
3. ...
4. Каждый промпт получает ссылки на файлы из предыдущих коммитов (ключевые интерфейсы)

LLM-агент не должен делать коммиты сам — агент пишет код, разработчик проверяет и коммитит. Но если агент способен на автономную работу (как Kilo), то `git commit` после каждого завершённого модуля.

### A5: Борьба с деградацией качества

**Проблема:** После 5–7 промптов LLM начинает «забывать» контекст ранних решений, дублировать код, нарушать установленный стиль.

**Решение:**
1. **«Контекст-инъекция»:** Каждый промпт содержит секцию «Existing code you can reference» с ПУТЯМИ к ключевым файлам и кратким описанием их API.
2. **Shared types — единый source of truth:** `src/shared/types.ts` содержит ВСЕ интерфейсы API-запросов/ответов. Если LLM галлюцинирует тип — достаточно направить в этот файл.
3. **Линтер как страж:** ESLint + Prettier + TypeScript strict mode выявляют ошибки немедленно. Агент должен запускать `npm run lint && npm run typecheck` после каждого промпта.
4. **«Перезагрузка контекста» каждый 3-й промпт:** начинать промпт с SUMMARY предыдущих промптов (2–3 предложения) плюс список созданных файлов.

### A6: Какие части LLM пишет хорошо, а какие требуют ручного вмешательства

| Тип кода | Качество LLM | Комментарий |
|---|---|---|
| API-клиент, HTTP-обёртки | ⭐⭐⭐⭐⭐ | Отлично, если дана спецификация эндпоинта |
| SQLite schema, CRUD | ⭐⭐⭐⭐ | Хорошо, но нужно явно указать `tauri-plugin-sql` вместо `better-sqlite3` |
| React-компоненты с shadcn/ui | ⭐⭐⭐⭐ | Хорошо, стандартные паттерны |
| SSE-стриминг парсинг | ⭐⭐⭐ | Требует точной спецификации формата: `data: {...}\n\n` |
| PCM16 → MP3 конвертация (ffmpeg) | ⭐⭐⭐ | Нужно указать точные параметры ffmpeg: `-f s16le -ar 24000 -ac 1` |
| Canvas/изображения манипуляции | ⭐⭐ | Сложный код, часто галлюцинирует Canvas API. Нужны библиотеки: `fabric.js` или `konva` |
| Async polling с восстановлением | ⭐⭐ | Требует явной спецификации конечного автомата состояний |
| Webhook приёмник на localhost | ⭐⭐ | RouterAI требует HTTPS для callback_url; нужно решение (ngrok/localtunnel или polling-only) |

### Пример первого промпта (P0)

```markdown
Создай проект MediaForge — desktop-приложение на Tauri v2 с React 19 и TypeScript.

Шаги:
1. `npm create tauri-app@latest mediaforge -- --template react-ts`
2. Установи зависимости: tailwindcss @tailwindcss/vite, shadcn/ui (button, card, input, select, tabs, dialog, scroll-area, toast, table), react-i18next i18next i18next-browser-languagedetector
3. Настрой ESLint (flat config), Prettier, Vitest
4. Установи tauri plugins: tauri-plugin-sql (sqlite feature), tauri-plugin-store, tauri-plugin-shell (для sidecar), tauri-plugin-notification
5. Настрой i18n:
   - src/i18n/index.ts — инициализация i18next с language detector
   - src/i18n/locales/ru/common.json — русские строки (nav: "Навигация", settings: "Настройки", ...)
   - src/i18n/locales/en/common.json — английские строки
   - LanguageSwitcher компонент (toggle RU/EN)
6. Создай базовую структуру:
   - src/api/          — API client (пока пустой)
   - src/db/           — SQLite access (пока пустой)
   - src/components/   — общие UI компоненты
   - src/features/     — фичи: image-studio/, speech-lab/, video-studio/, music-studio/
   - src/shared/       — types.ts, constants.ts, utils.ts
   - src/lib/          — shadcn/ui компоненты
6. Создай базовый Layout: сайдбар с навигацией (Image Studio, Speech Lab, Video Studio, Music Studio, Settings) и основной контент с React Router.

Не пиши код фич — только скелет.
После завершения запусти `npm run lint` и `npm run typecheck`.
```

---

## 5.3. Architecture Decision Record (Блок B)

### B1: Tauri v2 vs Electron vs Pure Web

| Критерий | Tauri v2 | Electron | Pure Web (Next.js localhost) |
|---|---|---|---|
| Размер бандла | 3–5 MB | 150 MB | N/A (браузер) |
| Потребление RAM (idle) | 20–100 MB | 150–300 MB | ~100 MB (браузер) |
| Доступ к ffmpeg | Sidecar (native binary) | Child process (native binary) | WASM-ffmpeg (ограничен) |
| SSE/WebSocket | Через фронтенд fetch | Через фронтенд fetch | Через фронтенд fetch |
| Безопасность ключа | OS keystore (DPAPI/Keychain/libsecret) | electron safeStorage | LocalStorage (НЕбезопасно) |
| Кроссплатформенность | Windows + macOS + Linux + iOS/Android (v2) | Windows + macOS + Linux | Любая (через браузер) |
| Мобильная поддержка | Да (Tauri v2 mobile, бета) | Нет | Да (PWA) |
| Сложность сборки | Средняя (Rust toolchain) | Низкая (Node.js) | Минимальная |
| Rust backend | Встроен (нативный) | Нет (только Node) | Нет |
| Зрелость экосистемы | Растёт быстро | Максимальная | Максимальная (web) |
| Плагины для SQLite | tauri-plugin-sql (встроен) | better-sqlite3 (native addon) | sql.js (WASM) |

**Решение: Tauri v2.**

**Обоснование:**
- Безопасность API-ключа — ключевое требование. Tauri позволяет хранить ключ в OS keystore и делать запросы из Rust main process, где ключ недоступен JS-рендереру.
- Sidecar-поддержка для ffmpeg встроена и документирована.
- SQLite через tauri-plugin-sql работает из коробки без native addon проблем.
- Размер 5MB vs 150MB критичен для «лёгкого инструмента».
- Будущая мобильная поддержка (Tauri v2 mobile) — потенциальный бонус.
- Единственный минус: требуется Rust toolchain, но для LLM-агента это не проблема — cargo и rustup ставятся одной командой.

**Отвергнутые альтернативы:**
- Electron: 150MB bundle избыточен для утилиты. Безопасность ключа сложнее (electron safeStorage работает только на macOS, на Windows/Linux — проблемы).
- Pure Web: Нет безопасного хранения API-ключа в браузере. Нет доступа к native ffmpeg. Нельзя слушать webhook на localhost без туннеля.

### B2: Unified API-client слой

**Решение: Adapter pattern с тремя стратегиями ответа.**

RouterAI имеет 7 эндпоинтов с 4 разными паттернами ответа:

| Эндпоинт | Тип ответа | Парсинг |
|---|---|---|
| `/v1/chat/completions` | sync JSON или SSE stream | `response.json()` или SSE-парсер |
| `/v1/images` | sync JSON (b64_json) или SSE (stream: true) | `response.json()` или SSE-парсер |
| `/v1/audio/speech` | binary blob (mp3/pcm) | `response.arrayBuffer()` |
| `/v1/audio/transcriptions` | sync JSON | `response.json()` |
| `/v1/videos` (POST) | sync JSON (202 с id/polling_url) | `response.json()` |
| `/v1/videos/:id` (GET) | sync JSON (статус) | `response.json()` |
| `/v1/videos/:id/content` (GET) | binary blob (mp4) | `response.arrayBuffer()` |

**Архитектура API-клиента:**

```
src/api/
  client.ts          — Base HTTP client (fetch wrapper, auth header, retry, error handling)
  endpoints/
    chat.ts          — /v1/chat/completions (text, image analysis, audio analysis, video analysis, music gen)
    images.ts        — /v1/images (generate, image-to-image, stream preview)
    speech.ts        — /v1/audio/speech (TTS)
    transcription.ts — /v1/audio/transcriptions (STT)
    videos.ts        — /v1/videos (create, poll, download)
    models.ts        — /v1/models (model catalog)
  sse-parser.ts      — SSE stream parser (for images stream, audio stream)
  retry.ts           — Exponential backoff, rate-limit handling
```

**Принципы:**
- Все эндпоинты используют один и тот же `baseClient(baseURL, apiKey)` с автоматическим добавлением `Authorization: Bearer`.
- SSE-парсер универсален для всех streaming-эндпоинтов (images SSE, audio SSE, chat SSE).
- Retry с exponential backoff на 429/503/5xx. На 402 (недостаточно средств) — пробрасывается как ошибка, не retry.
- `X-Generation-Id` из заголовков ответа сохраняется для cost tracking.

**SDK вопрос:** OpenAI Node.js SDK работает только для `/v1/chat/completions` и `/v1/audio/speech` и `/v1/audio/transcriptions`. Для `/v1/images` и `/v1/videos` RouterAI имеет собственные эндпоинты, несовместимые с OpenAI SDK. Поэтому используем fetch-based клиент, НЕ openai npm пакет.

### B3: Локальное хранение медиафайлов

**Решение: SQLite + filesystem (гибрид).**

```
{app_data_dir}/
  mediaforge.db               — SQLite: метаданные, история, проекты
  media/
    images/                   — .png/.jpg файлы (из b64_json)
    audio/
      raw/                    — PCM16 сырые файлы
      mp3/                    — Конвертированные MP3
    video/
      mp4/                    — Скачанные видео
    exports/                  — Экспортированные результаты (склеенные видео+аудио)
  thumbnails/                 — .webp миниатюры для UI
```

**SQLite schema (ключевые таблицы):**

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('image','music','video','speech')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE generations (
  id TEXT PRIMARY KEY,             -- UUID v4
  project_id TEXT REFERENCES projects(id),
  model TEXT NOT NULL,             -- 'openai/gpt-image-1'
  endpoint TEXT NOT NULL,          -- '/v1/images'
  request_json TEXT NOT NULL,      -- Исходный запрос (для повтора)
  response_json TEXT,              -- Ответ API (usage, metadata)
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
  media_path TEXT,                 -- Путь к файлу в filesystem
  media_type TEXT,                 -- 'image/png', 'audio/mp3', 'video/mp4'
  thumbnail_path TEXT,
  parent_id TEXT REFERENCES generations(id), -- Для дерева итераций
  cost_rub REAL,
  generation_id TEXT,              -- X-Generation-Id от RouterAI
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE model_cache (
  id TEXT PRIMARY KEY,             -- 'openai/gpt-image-1'
  name TEXT,
  provider TEXT,
  input_modalities TEXT,           -- JSON array
  output_modalities TEXT,          -- JSON array
  pricing_json TEXT,               -- JSON с ценами
  supported_params TEXT,           -- JSON array допустимых параметров
  cached_at TEXT DEFAULT (datetime('now'))
);
```

**Плюсы гибридного подхода:**
- SQLite для структурированных данных: поиск, фильтрация, связи
- Filesystem для бинарных блобов: не раздувает БД, можно открыть в проводнике
- `.db` файл легко скопировать для бэкапа
- Пути в БД относительные → перенос между машинами работает

**Отвергнутые альтернативы:**
- IndexedDB: только в браузере, не подходит для десктопа
- Чистый SQLite с BLOB: бинарные данные в БД делают её огромной и медленной при бэкапе
- JSON-файлы: нет транзакций, нет связей, плохой поиск

### B4: Интеграция ffmpeg

**Решение: Bundled ffmpeg как Tauri sidecar.**

| Подход | Размер | Кроссплатформенность | Лицензия | Производительность |
|---|---|---|---|---|
| **Bundled binary (sidecar)** | ~80MB | ✅ (платформо-специфичный бинарник) | GPL или LGPL | Полная нативная |
| System dependency | 0MB | ❌ (нет на Windows по умолчанию) | N/A | Полная нативная |
| WASM-ffmpeg | ~31MB | ✅ | LGPL | Медленнее в 3–10x |

**Решение: Bundled ffmpeg sidecar.**

**Обоснование:**
- Tauri имеет первоклассную поддержку sidecar-бинарников (`externalBin` в конфиге, `Command::new_sidecar`).
- На Windows пользователи не имеют ffmpeg установленным системно.
- WASM-ffmpeg слишком медленный для конвертации PCM16→MP3 и склейки видео+аудио на больших файлах.
- ~80MB увеличение bundle приемлемо для десктопного инструмента (суммарно ~100MB — всё ещё в 5 раз меньше Electron).

**Конфигурация sidecar:**
```
src-tauri/bin/
  ffmpeg-x86_64-pc-windows-msvc.exe
  ffmpeg-x86_64-apple-darwin
  ffmpeg-x86_64-unknown-linux-gnu
  ffprobe-x86_64-pc-windows-msvc.exe   (для анализа медиа)
  ffprobe-x86_64-apple-darwin
  ffprobe-x86_64-unknown-linux-gnu
```

**Лицензионное замечание:** Использовать сборку ffmpeg под LGPL (без `--enable-gpl` кодеков) для минимизации юридических рисков. Для MP3-кодирования (`libmp3lame`) — LGPL достаточно. Для промышленного использования — проконсультироваться с юристом.

### B5: Async Video Generation в UI

**Решение: Polling-based с сохранением задач в SQLite + optimistic UI.**

RouterAI video generation flow:
1. `POST /v1/videos` → `202 Accepted` с `{id, status: "pending", polling_url}`
2. `GET /v1/videos/{id}` → `{status: "pending"|"processing"|"completed"|"failed", ...}`
3. `GET /v1/videos/{id}/content` → binary mp4 (только когда `completed`)

**Polling стратегия:**
- Интервал: 5 секунд для "pending", 3 секунды для "processing"
- Экспоненциальный backoff при ошибках polling: 5s → 10s → 20s → 30s (max)
- Задачи сохраняются в таблицу `generations` с `status='pending'`
- При старте приложения — загрузить все незавершённые задачи и возобновить polling
- При шатдауне — polling останавливается, задачи остаются в БД

**Webhook vs Polling:**
- RouterAI требует `callback_url` с HTTPS (не http://localhost).
- Варианты приёма webhook на localhost: ngrok, localtunnel, Cloudflare Tunnel.
- **Решение:** Polling как primary, webhook как optional (для продвинутых пользователей, готовых поднять туннель).

**UI паттерн:**
- Компонент `VideoTaskCard`: статус-бар (pending → processing → completed), прогресс-бар, превью по готовности
- Компонент `VideoQueue`: список активных задач, история завершённых
- Уведомление через Tauri notification API при завершении
- Задача остаётся в UI даже при перезапуске приложения (восстановление из БД)

### B6: Локальный прокси/бэкенд или прямые запросы из фронтенда

**Решение: Все запросы из Tauri Rust main process (Tauri commands), НЕ из фронтенд-рендерера.**

```
User → React UI → invoke Tauri command → Rust handler → fetch() to RouterAI → response → Rust → React UI
```

**Обоснование:**
- **Безопасность:** API-ключ хранится в OS keystore, извлекается только в Rust-контексте. JS-рендерер НИКОГДА не видит ключ.
- **CORS:** Tauri WebView не имеет CORS-ограничений (используется системный WebView2, а не браузерный контекст). Но запросы из Rust через `reqwest` — ещё надёжнее.
- **Переупаковка PCM16→MP3:** Может делаться либо в Rust (через ffmpeg sidecar), либо через Tauri command, которая вызывает ffmpeg. Результат сохраняется в filesystem.
- **Webhook receiver:** Для опционального приёма webhook можно запустить локальный HTTP-сервер в Rust (tiny_http или warp) на `127.0.0.1:{port}`. Но это требует туннеля для HTTPS → менее приоритетно.

**Архитектура Tauri commands:**

```
src-tauri/src/
  commands/
    mod.rs
    images.rs       — generate_image, edit_image, stream_image_preview
    speech.rs       — text_to_speech, speech_to_text
    videos.rs       — create_video, poll_video, download_video
    chat.rs         — chat_completion, analyze_media
    models.rs       — fetch_models, get_model_info
    auth.rs         — set_api_key, test_connection, get_balance
    storage.rs      — save_media, load_media, list_generations
  api/
    client.rs       — reqwest-based HTTP client with retry
    types.rs        — Serde-совместимые структуры для API
  db/
    mod.rs          — SQLite access через sqlx или tauri-plugin-sql
```

### B7: Мультиязычность (i18n)

**Решение: react-i18next с JSON namespace-файлами, язык по умолчанию — русский.**

**Архитектура:**

```
src/i18n/
  index.ts              — инициализация i18next, определение языка (localStorage → ОС → ru)
  locales/
    ru/
      common.json       — общие строки (кнопки, навигация, ошибки)
      image-studio.json — интерфейс Image Studio
      speech-lab.json   — интерфейс Speech Lab
      video-studio.json — интерфейс Video Studio
      music-studio.json — интерфейс Music Studio
      prompt-builder.json — Prompt Builder Assistant
      models.json       — названия параметров моделей
      settings.json     — настройки, cost tracker
      onboarding.json   — onboarding flow
    en/
      (аналогичная структура)
```

**Ключевые решения:**
- **Namespace-разделение по фичам**: каждый фича-модуль имеет свой locale-файл, что упрощает параллельную разработку
- **Определение языка**: (1) сохранённый выбор в localStorage, (2) `navigator.language`, (3) fallback `ru`
- **Language switcher**: в Settings, переключение без перезагрузки (react-i18next реактивно)
- **Форматирование цен**: 1 234,56 ₽ (ru) vs 1,234.56 RUB (en) — через `Intl.NumberFormat`
- **Форматирование дат**: `Intl.DateTimeFormat` с учётом локали

**UI-компонент `LanguageSwitcher`:**
```
Settings → Interface → Language: [Русский ▾ | English]
```
Хранится в localStorage с ключом `i18nextLng` (стандарт react-i18next).

**Поддержка в P0:** Скелет проекта включает `react-i18next`, базовую конфигурацию и по одному namespace-файлу на язык (`common.json`). Остальные locale-файлы создаются в соответствующих промптах (P4–P11).

### B8: Model Catalog & Settings — настройка и выбор моделей с ценами

**Решение: Settings-страница с табличным browser'ом моделей, фильтрацией по модальности, сортировкой по цене, возможностью установки моделей по умолчанию.**

**Wireframe-описание:**

```
+--------------------------------------------------+
| SETTINGS → Models                                 |
|                                                   |
| FILTERS:                                          |
| Modality: [All ▾] [Image Gen] [TTS] [STT] [Video] |
| Provider: [All ▾]  Sort by: [Price (low) ▾]       |
| Search: [________________________]                |
| [Refresh from RouterAI]  Last updated: 14:02       |
|                                                   |
| +---+----------+--------+----------+------+------+ |
| | ★ | Model    | Type    | Provider | Price|Params| |
| +---+----------+--------+----------+------+------+ |
| | ○ | gpt-im.. | Image  | OpenAI   |3.40₽ |2K,4K | |
| | ◉ | flux.2.. | Image  | BFL      |2.10₽ |4K    | |
| | ○ | seedre.. | Image  | Bytedance|1.80₽ |2K,4K | |
| | ○ | whisper..| STT    | OpenAI   |0.07₽ | -    | |
| | ○ | grok-v.. | TTS    | xAI      |0.15₽ |mp3   | |
| +---+----------+--------+----------+------+------+ |
|                                                    |
| DEFAULT MODELS (per modality):                     |
| Image Gen: [flux.2-pro ▾]  4.50₽/image             |
| TTS:       [grok-voice ▾]  0.15₽/char              |
| STT:       [whisper-v3 ▾]  0.07₽/min               |
| Video:     [seedance-2.0 ▾] 45.00₽/video           |
| Text LLM:  [gpt-4o ▾]      0.31₽/1K tokens         |
|                                                    |
| MODEL DETAIL (selected row):                       |
| Name: black-forest-labs/flux.2-pro                 |
| Provider: Black Forest Labs                        |
| Input:  text                                      |
| Output: image (png, jpeg, webp)                    |
| Supported params: aspect_ratio, resolution,        |
|   quality, seed, output_format, output_compression |
| Max resolution: 4K                                 |
| Pricing: 2.10 ₽ per image (base)                   |
| Status: ✅ Online                                  |
+--------------------------------------------------+
```

**Обязательные UI-компоненты:**
- `ModelTable` — таблица моделей с сортируемыми колонками (name, provider, price, resolution, supported params)
- `ModelFilterBar` — фильтры по `output_modalities`, `provider`, поиск по названию
- `DefaultModelSelector` — выпадающие списки для каждой модальности (image, tts, stt, video, text)
- `ModelDetailPanel` — карточка с полной информацией о модели
- `RefreshButton` — перезагрузка каталога с RouterAI
- `PriceDisplay` — унифицированный компонент для отображения цены в зависимости от типа тарификации (за изображение, за символ, за секунду, за токен)

**Источник данных:**
- `GET /v1/models` — полный каталог (архитектура модели, провайдеры)
- `GET /v1/models/{author}/{slug}/endpoints` — детальная информация о провайдерах и ценах
- Кеширование в SQLite (`model_cache` таблица)

**SQLite schema дополнение:**

```sql
CREATE TABLE user_settings (
  key TEXT PRIMARY KEY,         -- 'default_image_model', 'default_tts_model', ...
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Примеры ключей:
-- 'default_image_model' → 'openai/gpt-image-1'
-- 'default_tts_model'    → 'x-ai/grok-voice-tts-1.0'
-- 'default_stt_model'    → 'openai/whisper-large-v3'
-- 'default_video_model'  → 'bytedance/seedance-2.0'
-- 'default_text_model'   → 'openai/gpt-4o'
-- 'language'             → 'ru'
-- 'monthly_spending_limit' → '5000'
```

**Ценообразование и отображение:**
Модели RouterAI тарифицируются по-разному. Из `GET /v1/models/{author}/{slug}/endpoints` получаем `pricing` объект. Компонент `PriceDisplay` умеет форматировать:
- `pricing.per_image` → "₽/изображение"
- `pricing.per_character` → "₽/символ" (TTS)
- `pricing.per_second` → "₽/сек" (STT)
- `pricing.prompt` + `pricing.completion` → "₽/1K токенов" (LLM)
- `pricing.per_video` → "₽/видео"

### B9: Prompt Builder Assistant — AI-помощник построения промптов

**Решение: Floating side-panel, доступная из любого Studio. Использует текстовые модели RouterAI (`/v1/chat/completions`) для генерации/улучшения промптов под конкретную модальность.**

**Архитектура:**

```
src/features/prompt-builder/
  PromptBuilderPanel.tsx    — UI панели (floating, resizeable)
  usePromptBuilder.ts       — хук: отправка запроса, стриминг ответа, сохранение истории
  prompts/
    image-prompt.ts         — System prompt для генерации image-промптов
    lyrics-prompt.ts        — System prompt для генерации текстов песен/стихов
    video-prompt.ts         — System prompt для генерации video-промптов
    prompt-refiner.ts       — System prompt для улучшения/рефакторинга промптов
  templates/
    image-styles.ts         — Предустановленные стили (cinematic, watercolor, etc.)
    music-genres.ts         — Жанры и структуры песен
```

**Wireframe-описание (открыт в Image Studio):**

```
+-- MAIN CANVAS ---------------------+--- PROMPT BUILDER (350px) ----------+
|                                     |                                    |
|  [изображение]                      | AI Prompt Assistant                 |
|                                     | [x]                                |
|  VARIATION GRID                     |                                    |
|  +----+----+----+----+             | Describe what you want:             |
|  |    |    |    |    |             | [Кот в скафандре плывёт в         |
|  +----+----+----+----+             |  невесомости, вид снизу...     ]   |
|                                     |                                    |
|                                     | Style: [Cinematic ▾]               |
|                                     | Aspect: [16:9 ▾]  Quality: [High]  |
|                                     | [✨ Generate Prompt]               |
|                                     |                                    |
|                                     | GENERATED PROMPT:                  |
|                                     | A cinematic wide-angle shot of a   |
|                                     | ginger cat in a white NASA         |
|                                     | spacesuit floating in zero         |
|                                     | gravity inside the ISS. Earth      |
|                                     | visible through the large          |
|                                     | observation window. Dramatic       |
|                                     | lighting, 8K, photorealistic...    |
|                                     |                                    |
|                                     | [Use this prompt →] [Refine...]    |
|                                     |                                    |
|                                     | HISTORY                            |
|                                     | +-- "Кот в скафандре" (cinematic) |
|                                     | +-- "Закат на море" (watercolor)  |
+-------------------------------------+------------------------------------+
```

**System prompts для каждой модальности:**

**1. Image Prompt Builder (`image-prompt.ts`):**
```
Ты — эксперт по созданию промптов для AI-генерации изображений.
Пользователь описывает желаемое изображение простыми словами.
Твоя задача — превратить это в детальный, структурированный промпт на русском или английском (по выбору пользователя).

В промпт включи:
- Основной объект/субъект (детальное описание)
- Окружение, фон, атмосфера
- Освещение (источник, направление, цветовая температура)
- Стиль (cinematic, watercolor, photorealistic, anime, 3D render, etc.)
- Композиция и ракурс камеры
- Цветовая палитра и настроение
- Технические параметры (8K, detailed, sharp focus, etc.)

Если пользователь указывает style reference — адаптируй промпт под этот стиль.
Ответь ТОЛЬКО готовым промптом, без пояснений.
```

**2. Lyrics/Poetry Builder (`lyrics-prompt.ts`):**
```
Ты — поэт-песенник и AI-ассистент для создания текстов песен.
Пользователь описывает тему, настроение, жанр музыки.

Создай текст песни со структурой:
[Intro] — инструментальное вступление, атмосфера
[Verse 1] — первый куплет (4-8 строк)
[Chorus] — припев (4 строки, запоминающийся)
[Verse 2] — второй куплет
[Chorus] — повтор припева
[Bridge] — бридж/смена настроения
[Chorus] — финальный припев
[Outro] — завершение

Текст должен быть на языке пользователя (русский или английский).
Рифма, ритм, размер должны подходить под указанный жанр.
После текста — предложи теги стиля для Lyria 3: жанр, tempo, mood.
```

**3. Video Prompt Builder (`video-prompt.ts`):**
```
Ты — эксперт по AI-генерации видео.
Преврати описание пользователя в детальный видеопромпт.

Включи:
- Сцену и действие (что происходит)
- Движение камеры (pan left, zoom in, tracking shot, static)
- Освещение и время суток
- Стиль (cinematic, animation, realistic)
- Длительность в секундах (если указана моделью)
- Первый/последний кадр (если есть референсы)
```

**4. Prompt Refiner (`prompt-refiner.ts`):**
```
Пользователь предоставляет существующий промпт и просит его улучшить.
Проанализируй промпт и предложи улучшенную версию.
Добавь недостающие детали, исправь структуру, усиль ключевые элементы.
```

**Интеграция со Studios:**
- Image Studio: AI Assist открывает Prompt Builder в режиме "Image Prompt". После генерации промпта — кнопка "Use this prompt" вставляет результат в поле ввода Image Studio.
- Music Studio: AI Assist открывает Prompt Builder в режиме "Lyrics". Генерирует текст песни → пользователь правит → отправляет в Lyria 3.
- Video Studio: аналогично Image Studio.

**Сохранение истории промптов:**
- Промпты сохраняются в таблицу `generations` с `endpoint='/v1/chat/completions'` и `type='prompt'`
- Возможность повторного использования и редактирования

**Модель для Prompt Builder:** Используется `default_text_model` из настроек пользователя (например, `openai/gpt-4o`).

---

## 5.4. UI/UX Patterns Catalogue (Блок C)

### C1: Image Studio — Итеративные правки

**Wireframe-описание:**

```
+------------------+------------------------------------------+
| LEFT PANEL       | MAIN CANVAS                              |
| (300px)          |                                          |
|                  |   +------------------------------+       |
| PROMPT           |   |                              |       |
| [____________]   |   |     Current Image            |       |
| [Generate (4)]   |   |     (zoomable canvas)        |       |
|                  |   |                              |       |
| PARAMETERS       |   +------------------------------+       |
| Model: [dropdown]|                                          |
| Aspect: [1:1]    |   VARIATION GRID (below canvas)           |
| Quality: [high]  |   +--------+--------+--------+--------+  |
| [Advanced...]    |   | Gen 1  | Gen 2  | Gen 3  | Gen 4  |  |
|                  |   | [img]  | [img]  | [img]  | [img]  |  |
| EDIT MODE        |   +--------+--------+--------+--------+  |
| [x] Prompt-based |                                          |
| [ ] Canvas mask  |   COMPARISON MODE (toggle)               |
|                  |   [Before] ←→ [After] (slider)           |
| Similarity: [==o]|                                          |
|                  |   ITERATION HISTORY (right sidebar)      |
|                  |   +-- Generation 1 (2026-07-23 14:02)   |
|                  |   +-- Generation 2 (2026-07-23 14:05)   |
|                  |       +-- Edit: added sunset            |
+------------------+------------------------------------------+
```

**Обязательные UI-компоненты:**
- `PromptEditor` — textarea с автокомплитом стилей, history
- `ParameterPanel` — model selector, aspect ratio, quality, resolution (сверяется с supported_params модели)
- `VariationGrid` — сетка 2×2 или 1×N для показа сгенерированных вариантов
- `ImageCanvas` — zoom, pan, сравнение «было/стало» (slider overlay) — использовать `react-zoom-pan-pinch` или canvas-based
- `IterationTree` — сворачиваемое дерево (parent→child связь), клик по узлу — показать ту версию
- `SSEProgressIndicator` — прогрессивное превью при `stream: true`

**Референсы:**
- Midjourney: variation grid, upscale controls, permutation
- Photoshop AI (Generative Fill): canvas mask для правок
- ComfyUI: node-based workflow (overkill для MVP, возможно в v2)

### C2: Image Studio — Streaming Preview через SSE

**Паттерн:**
1. Пользователь нажимает "Generate"
2. Отправляется `POST /v1/images` с `stream: true`
3. SSE events: `image_generation.partial_image` (base64 превью низкого разрешения) → показываем размытое превью, которое становится чётче с каждым событием
4. Финальное событие: `image_generation.completed` с полным `b64_json` + `usage`
5. Картинка рендерится в canvas и сохраняется локально

**Компонент `StreamingImagePreview`:**
- Принимает SSE event source
- Накладывает каждое новое превью поверх предыдущего (как прогрессивный JPEG)
- Показывает спиннер во время ожидания
- При `[DONE]` — финализирует изображение

### C3: Music Studio — Сравнение превью-клипов

**Wireframe-описание:**

```
+--------------------------------------------------+
| MUSIC STUDIO                                      |
|                                                   |
| SONG PROMPT: [Напиши поп-песню про лето...]       |
| Style: [pop]  Tempo: [120]  Model: [Lyria 3 Clip] |
| [Generate Previews (4)]                           |
|                                                   |
| PREVIEW PLAYLIST                                  |
| +---+------------------------------------------+  |
| | ▶ | Preview 1 — "Summer Pop #1"    0:30      |  |
| | ⏸ | Preview 2 — "Summer Pop #2"    0:30      |  |
| | ▶ | Preview 3 — "Summer Pop #3"    0:30      |  |
| | ▶ | Preview 4 — "Summer Pop #4"    0:30      |  |
| +---+------------------------------------------+  |
|                                                   |
| WAVEFORM VIEW                                     |
| ========¯¯¯¯=======¯¯¯¯¯========== (selected track)|
|                                                   |
| SELECTED: Preview 2 → [Promote to Full Song]      |
|                                                   |
| LYRICS (after STT or from generation)             |
| [Verse 1] Мы встретились на пляже...              |
| [Chorus]  Лето, лето, жаркое лето...              |
| [Verse 2] Волны шепчут имена...                   |
|                                                   |
| RE-VOICE: [Select TTS model] [voice] [Apply]      |
+--------------------------------------------------+
```

**Обязательные компоненты:**
- `AudioPlaylist` — список треков с inline play/pause (как в Suno)
- `WaveformViewer` — визуализация waveform через `wavesurfer.js`
- `LyricsEditor` — текст песни с разбивкой по секциям (verse/chorus/bridge). Получается либо из ответа API (если модель возвращает), либо через STT с `verbose_json` для таймстемпов
- `VoiceReplacementPanel` — выбор TTS модели и голоса для переозвучки отдельных строк
- `ABComparison` — переключение между двумя треками для сравнения

**Референсы:** Suno, Udio (структура песни, preview clips, жанровые теги)

### C4: Music Studio — Визуализация структуры песни

**Решение:** STT с `response_format: "verbose_json"` и `timestamp_granularities: ["segment", "word"]`.

Процесс:
1. Генерируем песню через Lyria 3 Clip/Pro
2. Прогоняем аудио через STT (`/v1/audio/transcriptions`, `verbose_json`)
3. Получаем `segments` с таймстемпами `{start, end, text}`
4. LLM (через `/v1/chat/completions`) анализирует текст и классифицирует сегменты: verse, chorus, bridge, intro, outro
5. UI: Waveform с цветными регионами, подписанными секциями
6. Пользователь может кликнуть на регион и заменить голос (повторный TTS для этого текста)

### C5: Video Studio — Async Generation UI

**Wireframe-описание:**

```
+--------------------------------------------------+
| VIDEO STUDIO                                      |
|                                                   |
| [New Generation]  |  ACTIVE TASKS (2)             |
|                   |                               |
| +----------------------------------------------+ |
| | TASK QUEUE                                    | |
| |                                               | |
| | #1 "Кот в космосе"        [processing ████░░] | |
| |    Model: Seedance 2.0     Elapsed: 3:42      | |
| |    Resolution: 1080p        Est: ~2 min        | |
| |                                               | |
| | #2 "Закат на море"        [pending ......]    | |
| |    Model: Veo 3.1          Queued             | |
| |                                               | |
| | COMPLETED                                     | |
| | #3 "Город будущего"    ✅  [Play] [Download]  | |
| +----------------------------------------------+ |
|                                                   |
| GENERATION FORM (collapsible)                     |
| Prompt: [____________________________________]   |
| Model: [Seedance 2.0 ▾] Duration: [8s ▾]        |
| Images: [Drag first frame here] (optional)       |
| Audio: [x] Generate audio track                  |
| [Create Video Task]                              |
+--------------------------------------------------+
```

**Обязательные компоненты:**
- `VideoTaskCard` — статус-индикатор, прогресс-бар (анимированный), elapsed time, модель
- `VideoQueue` — список активных/завершённых задач с автообновлением
- `VideoPlayer` — встроенный плеер для просмотра результатов
- `ImageDropZone` — drag-and-drop первого/последнего кадра для image-to-video
- `ModelParameterSelector` — динамически подстраивается под модель (duration, resolution, aspect_ratio зависят от модели)

**Polling логика:**
1. Компонент `useVideoTask(taskId)` хук:
   - При монтировании: загружает статус из БД
   - Если статус не `completed`/`failed`: запускает `setInterval(poll, interval)`
   - Интервал: 5s (pending), 3s (processing)
   - При размонтировании: очищает интервал
   - При обновлении статуса: обновляет БД и UI

**Референсы:** Runway (задачи, статус), Pika (prompt-based video gen)

### C6: Speech Lab — Объединённый TTS/STT интерфейс

**Wireframe-описание:**

```
+--------------------------------------------------+
| SPEECH LAB                          [TTS | STT]  |
+--------------------------------------------------+
|                                                    |
| [TAB: Text-to-Speech]                              |
|                                                    |
| Text: [Многострочный ввод текста...]               |
| Model: [Grok Voice TTS 1.0 ▾]  Voice: [eve ▾]     |
| Format: (•) MP3  ( ) PCM       Speed: [1.0x]      |
| [Generate Speech]                                  |
|                                                    |
| HISTORY                                           |
| +-- "Привет, мир" — Grok Voice, alloy — 0.12₽    |
| +-- "Длинный рассказ..." — MS MAI-Voice-2 — 0.45₽ |
|                                                    |
+--------------------------------------------------+

+--------------------------------------------------+
| [TAB: Speech-to-Text]                             |
|                                                    |
| [Drop audio file here] or [Record from mic]       |
| Format: WAV (auto-detected)                       |
| Model: [Whisper Large v3 ▾]  Language: [ru ▾]    |
| [x] Verbose output (timestamps)                   |
| [Transcribe]                                       |
|                                                    |
| RESULT                                            |
| +-- Распознанный текст...                         |
| +-- Duration: 9.2s | Cost: 0.19₽                  |
|                                                    |
| SEGMENTS (with verbose)                           |
| [0:00–4:50] Привет, это тест...                   |
| [4:50–9:20] преобразования речи в текст.          |
|                                                    |
| ACTIONS: [Copy] [Export .txt] [Send to TTS]       |
+--------------------------------------------------+
```

**Обязательные компоненты:**
- `ModelVoiceSelector` — двойной dropdown: модель → голоса (голоса зависят от модели!)
- `AudioDropZone` — drag-and-drop аудиофайлов, автоопределение формата
- `MicRecorder` — запись с микрофона через Web Audio API (MediaRecorder)
- `TranscriptionResult` — текст, usage, segments с таймстемпами (если verbose)
- `ABVoiceComparison` — сгенерировать один и тот же текст с двумя разными голосами, сравнить

**Особенность:** Список голосов (`voice`) ЗАВИСИТ от модели. Это нужно загружать из модельного каталога (`GET /v1/models`) или страницы модели.

### C7: История итераций для всех типов контента

**Решение: Единый компонент `IterationHistory` с разными рендерерами в зависимости от media_type.**

```
+-- Project: "Летний клип"
    +-- Image: "Закатный пляж" (Flux Pro, 14:02, 3.40₽)
    |   +-- Edit: "Добавить пальмы" (GPT-Image-1, 14:05, 1.20₽)
    |   +-- Edit: "Ярче цвета" (Seedream 4.5, 14:08, 0.80₽)
    +-- Video: "Волны" (Seedance 2.0, 14:15, 45.00₽) [from: Закатный пляж]
    +-- Music: "Пляжная мелодия" (Lyria 3 Clip, 14:20, 4.00₽)
```

**Реализация через `parent_id` в таблице `generations`.**

**UI:**
- Дерево (сворачиваемое) с индикаторами типов (иконки: image, video, music, speech)
- Клик по узлу → показать media в соответствующем viewer
- Контекстное меню: "Use as input for...", "Delete", "Export"
- Diff для изображений: наложение двух картинок с ползунком (slider comparison)
- Diff для аудио: синхронизированное A/B воспроизведение

### C8: Мониторинг стоимости

**Решение: Компонент `CostTracker` в нижней части сайдбара + детальная страница в Settings.**

```
Cost today: 124.50₽ | This month: 1,240.00₽
[==========|          ] 24% of monthly limit (5,000₽)
```

**Источник данных:**
- `usage.cost` в каждом ответе RouterAI
- `GET /v1/generation?id={X-Generation-Id}` для постфактум проверки
- Локальная агрегация в SQLite: `SELECT SUM(cost_rub) FROM generations WHERE date(created_at) = date('now')`

**UI:**
- Счётчик в реальном времени (обновляется после каждого запроса)
- Лимиты и предупреждения: пользователь задаёт месячный лимит в Settings
- При превышении 80% — warning toast
- При превышении 100% — блокировка запросов с уведомлением
- Статистика по моделям: круговая диаграмма "На что ушли деньги"

---

## 5.5. Risk Register (Блок D)

| # | Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|---|
| D1 | **API ошибки (429, 503, timeout)** | Высокая | Среднее | Exponential backoff с jitter (1s→2s→4s→8s→16s max). Разные стратегии для разных ошибок: 429 — ждать Retry-After; 5xx — до 3 попыток; 402 (баланс) — информировать пользователя и остановить. |
| D2 | **Обрыв SSE-потока** | Средняя | Среднее | Буферизация полученных PCM16 чанков в памяти. При обрыве: сохранить частичный результат, показать ошибку. Для image SSE — показывать последнее полученное превью. Retry всего запроса при обрыве (если модель идемпотентна). |
| D3 | **Невалидный base64/PCM16** | Низкая | Низкое | Валидация перед отправкой: проверка MIME-префикса для изображений, проверка размера (<32MB для аудио/STT), проверка magic bytes для PCM16 (должен быть кратен 2 байтам). |
| D4 | **Очень большие файлы (видео 4K, long audio)** | Средняя | Высокое | Сжатие перед отправкой: изображения — resize до разумного разрешения (<2048px), видео — предупреждение о лимитах провайдера. Прогресс-бар загрузки. Для STT: разбиение длинного аудио на чанки с перекрытием. |
| D5 | **Модель удалена/сменила API** | Средняя | Среднее | **Model Capability Registry** — при старте приложения выполняется `GET /v1/models`, кешируется в SQLite. UI показывает только актуальные модели. При выборе сохранённой (но удалённой) модели — показать предупреждение и предложить замену. Обновление кеша — раз в час или по кнопке "Refresh models". |
| D6 | **API-ключ скомпрометирован** | Низкая | Критическое | Tauri secure storage (DPAPI на Windows, Keychain на macOS, libsecret на Linux). Ключ НИКОГДА не передаётся в JS-контекст. Все запросы — через Rust commands. При вводе ключа — маскированный input. Возможность "Reset API Key" в Settings. |
| D7 | **ffmpeg sidecar не запускается** | Низкая | Среднее | Проверка при старте: `ffmpeg -version`. Если не найден — показать понятную ошибку с инструкцией. Fallback: возможность указать путь к системному ffmpeg. |
| D8 | **SQLite блокировки ( concurrent writes )** | Низкая | Низкое | SQLite в WAL mode. Все writes через менеджер очереди в Rust (один writer за раз). |
| D9 | **Потеря данных при краше** | Низкая | Высокое | Автосохранение промптов в localStorage. SQLite транзакции. Восстановление незавершённых video-задач при старте. |

---

## 5.6. Packaging & Distribution (Блок E)

### E1: Стек упаковки

**Решение: Tauri bundler (встроен) + GitHub Releases + автообновление через tauri-plugin-updater.**

Tauri bundler генерирует:
- Windows: `.msi` installer (рекомендуется) или `.exe` installer
- macOS: `.dmg`
- Linux: `.deb`, `.rpm`, AppImage

Размеры:
- Само приложение (React + Rust): ~5 MB
- ffmpeg sidecar: ~80 MB (на платформу)
- СУММАРНО: ~85–100 MB (всё ещё в 1.5 раза легче Electron hello-world)

**Автообновление:** `tauri-plugin-updater` проверяет GitHub Releases на наличие новых версий, скачивает и устанавливает.

### E2: Нужен ли Python-бэкенд

**Решение: НЕТ. Всё делается на Rust (Tauri main process) + Node.js/TypeScript (фронтенд).**

| Задача | Решение |
|---|---|
| HTTP-запросы к RouterAI | Rust `reqwest` crate |
| SSE-парсинг | Rust `eventsource-stream` crate ИЛИ JS `fetch` с `ReadableStream` |
| SQLite | `tauri-plugin-sql` (sqlx) |
| ffmpeg | Sidecar binary, вызывается через `std::process::Command` |
| Media manipulation | ffmpeg (все операции) |
| Криптография (для keystore) | `tauri-plugin-store` с secure storage |

**Почему не Python:**
- Добавляет ещё один рантайм (~50–100MB)
- Усложняет упаковку (нужно bundled Python или PyInstaller)
- Усложняет коммуникацию (Tauri ↔ Python через sidecar/HTTP)
- Никаких операций, которые нельзя сделать на Rust/ffmpeg

### E3: Onboarding Flow

```
Шаг 1: Welcome screen
  "MediaForge — ваш локальный инструмент для работы с AI-медиа"
  [Get Started]

Шаг 2: API Key
  Input: [Вставьте API-ключ RouterAI...] (masked)
  Link: "Где взять ключ?" → открывает https://routerai.ru/settings/keys
  [Test Connection] → делает GET /v1/models, проверяет 200 OK
  Результат: ✅ "Баланс: 1,234.56 ₽" или ❌ "Неверный ключ"

Шаг 3: Model Catalog
  Загружается список моделей из GET /v1/models
  Кешируется в SQLite
  Показывается краткая сводка:
    - 37 моделей изображений
    - 17 моделей видео
    - 12 моделей TTS
    - 11 моделей STT
    - 3 модели аудио-генерации
  [Continue]

Шаг 4: ffmpeg check
  В фоне: проверка `ffmpeg -version` через sidecar
  Если не найден: предупреждение "ffmpeg не обнаружен, некоторые функции будут недоступны"
  [Continue]

Шаг 5: Main Interface
  Сайдбар с навигацией + Image Studio (активный по умолчанию)
```

---

## 5.7. Open Questions

### Что требует уточнения у пользователя

1. **Музыка через Lyria 3:** Документация RouterAI упоминает модели Lyria 3 Pro/Clip (8₽/4₽), но не детализирует эндпоинт. Нужно уточнить:
   - Использует ли Lyria 3 стандартный `/v1/chat/completions` с `modalities: ["text","audio"]` (как GPT Audio)?
   - Или отдельный эндпоинт для генерации музыки?
   - В каком формате приходит аудио (PCM16 или сразу MP3)?

2. **Диалоговая генерация изображений (Gemini Flash Image):** Документирована (`/v1/chat/completions` + `modalities: ["image","text"]`), но нужно уточнить:
   - Поддерживает ли она `input_references` для image-to-image через диалог?
   - Как работает `image_config` параметр?

3. **Webhook HMAC-подпись:** Документация RouterAI упоминает HMAC-подпись для верификации webhook. Нужно уточнить алгоритм и заголовки.

4. **Целевые модели по умолчанию:** Какие модели пользователь считает приоритетными? Это влияет на UX (какие параметры показывать в первую очередь).

5. **Приоритет платформ:** Windows — основная. Нужно ли сразу делать macOS/Linux сборки или можно отложить?

### Что требует экспериментов

1. **SSE streaming для image preview:** Подтвердить, что RouterAI действительно отправляет прогрессивные превью (разной степени детализации) или просто несколько одинаковых изображений.

2. **PCM16 → MP3 latency на больших файлах:** Измерить время конвертации через ffmpeg sidecar для аудиофайлов >5 минут. Возможно, нужен стриминг-пайплайн вместо буферизации.

3. **Video polling latency:** Измерить реальное время генерации видео для разных моделей (Seedance vs Veo vs Sora) чтобы настроить polling-интервалы.

4. **Tauri plugin-sql performance:** Проверить скорость SQLite-запросов через tauri-plugin-sql при большом количестве generations (>1000). Возможно, понадобятся индексы.

5. **Canvas-based image comparison slider:** Протестировать производительность наложения двух изображений 4K с ползунком. Возможно, понадобится downscaling для UI.

---

## Приложение: Сводка ключевых технологий и версий

| Технология | Версия | Назначение |
|---|---|---|
| Tauri | v2.x | Desktop framework |
| React | 19 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| shadcn/ui | latest | UI components |
| React Router | 7.x | Routing |
| react-i18next | latest | Internationalization (ru/en) |
| i18next-browser-languagedetector | latest | Auto-detect browser language |
| tauri-plugin-sql | latest | SQLite |
| tauri-plugin-store | latest | Secure storage (API key) |
| tauri-plugin-shell | latest | ffmpeg sidecar |
| tauri-plugin-notification | latest | Desktop notifications |
| tauri-plugin-updater | latest | Auto-update |
| reqwest | 0.12 | HTTP client (Rust) |
| serde / serde_json | latest | Serialization (Rust) |
| sqlx | 0.8 | SQLite driver (Rust, used by plugin) |
| wavesurfer.js | 7.x | Audio waveform |
| react-zoom-pan-pinch | 3.x | Image canvas zoom/pan |
| ffmpeg | 7.x | Media processing (sidecar) |
| Vitest | latest | Testing |
| ESLint | 9.x (flat config) | Linting |
| Prettier | 3.x | Formatting |

---

## Приложение: Итоговый промпт-план для LLM-агента

```
P0  → Скелет проекта (Tauri + React + Tailwind + shadcn/ui + i18n + ESLint + Prettier + Vitest)
P1  → Unified API Client (reqwest-based, все 7 эндпоинтов, типы, retry, SSE parser)
P2  → Локальное хранилище (SQLite schema, CRUD для generations, filesystem layout, user_settings)
P3  → Auth & Onboarding (ввод ключа, тестовый запрос, загрузка каталога моделей, ffmpeg check)
P4  → Model Catalog & Settings (таблица моделей с ценами, фильтры, default model per modality)
P5  → Prompt Builder Assistant (floating panel, 4 system prompts, lyrics generator, history)
P6  → Image Studio: генерация + streaming (POST /v1/images, SSE preview, VariationGrid)
P7  → Image Studio: итеративные правки (input_references, canvas comparison, IterationTree)
P8  → Speech Lab: TTS (POST /v1/audio/speech, выбор модели/голоса, PCM→MP3, A/B сравнение)
P9  → Speech Lab: STT (POST /v1/audio/transcriptions, verbose_json, MicRecorder, segments)
P10 → Video Studio (POST /v1/videos, polling queue, VideoTaskCard, ImageDropZone)
P11 → Music Studio (POST /v1/chat/completions с modalities:audio, PCM16 сборка, lyrics, Prompt Builder integration)
P12 → Общие компоненты (CostTracker, IterationHistory, Settings, Export, ErrorBoundary)
P13 → Упаковка и дистрибуция (ffmpeg sidecar, installer, автообновление)
```

Каждый промпт включает в себя шаблон контекста из раздела A3.

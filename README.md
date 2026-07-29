# MediaForge

AI-креативная студия для генерации изображений, музыки, речи и видео. Десктопное приложение на Tauri + React + TypeScript.

## Возможности

- **Image Studio** — генерация изображений по текстовому описанию, с референсами, редактором на canvas (fabric.js) и историей
- **Music Studio** — генерация музыки двумя провайдерами:
  - **RouterAI** (облако, Lyria) — генерация текстов песен и аудио, настройка структуры (куплеты, припев, бридж), жанра и темпа
  - **ACE-Step 1.5** (локальный сервер) — text2music, cover, repaint, извлечение стемов (extract), догенерация аранжировки (complete); AI-планировщик промптов переводит описание на английский и заполняет BPM/тональность/размер (для всех режимов с caption), авто-улучшение отключается чекбоксом для ручного промпта
- **Speech Lab** — синтез речи (TTS) и распознавание (STT)
- **Video Studio** — генерация видео по промпту
- **Prompt Builder** — конструктор промптов с шаблонами для разных модальностей; в режиме ACE-Step генерирует полный музыкальный план: английский caption, стихи с секционными тегами и вокальными директивами, BPM/тональность/язык — одним кликом заполняет всю форму
- **Cost Tracker** — учёт стоимости генераций и месячный лимит расходов
- **Локальное медиахранилище** — аудио хранится файлами на диске (не раздувает БД), миграция старых записей — автоматически
- **Локализация** — русский и английский (i18next)

### ACE-Step (локальная генерация музыки)

1. Установите и запустите сервер [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) (`start_api_server.bat`, по умолчанию `http://localhost:8001`)
2. В настройках MediaForge укажите **ACE-Step URL** и при необходимости **API-ключ** (для удалённых серверов с `ACESTEP_API_KEY`)
3. В Music Studio выберите провайдер **ACE-Step**
4. Для режимов extract/complete на сервере нужна base-модель (`ACESTEP_CONFIG_PATH=acestep-v15-base`)

## Стек

| Слой       | Технологии                                      |
| ---------- | ----------------------------------------------- |
| Фреймворк  | [Tauri 2](https://tauri.app)                    |
| Фронтенд   | React 19, TypeScript, Vite                      |
| Стили      | Tailwind CSS 4                                  |
| Роутинг    | React Router 7                                  |
| Canvas     | Fabric.js 6                                     |
| Хранилище  | SQLite (tauri-plugin-sql + SQLx)                |
| Настройки  | tauri-plugin-store                              |
| API        | [RouterAI](https://routerai.ru), [ACE-Step](https://github.com/ace-step/ACE-Step-1.5) (опционально) |
| Локализация| i18next + react-i18next                          |
| Линтинг    | ESLint 9 + Prettier + prettier-plugin-tailwindcss |
| Тесты      | Vitest                                          |

## Требования

- [Node.js](https://nodejs.org/) >= 20
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri CLI](https://tauri.app/start/prerequisites/) (Windows: WebView2; macOS/Linux: системные зависимости Tauri)

## Разработка

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки (Vite dev server + Tauri)
npm run tauri dev

# Только Vite (без Tauri-окна)
npm run dev
```

## Сборка

```bash
npm run tauri build
```

Готовый установщик появится в `src-tauri/target/release/bundle/`.

## Структура проекта

```
├── src/
│   ├── api/            # HTTP-клиент RouterAI, эндпоинты
│   ├── components/     # Общие компоненты (Layout, ErrorBoundary, CostTracker)
│   ├── db/             # Локальная БД: сохранение генераций, настроек
│   ├── features/       # Feature-sliced модули
│   │   ├── auth/       # Онбординг и контекст аутентификации
│   │   ├── image-studio/   # Студия изображений + редактор
│   │   ├── music-studio/   # Студия музыки
│   │   ├── speech-lab/     # Озвучка и распознавание речи
│   │   ├── video-studio/   # Студия видео
│   │   ├── prompt-builder/ # Конструктор промптов
│   │   └── settings/       # Настройки
│   ├── i18n/           # Локализация (ru/en)
│   └── shared/         # Типы, константы, утилиты
├── src-tauri/
│   ├── src/
│   │   ├── commands/   # Tauri-команды (чат, генерация)
│   │   ├── api/        # HTTP-клиент на Rust (reqwest)
│   │   └── db/         # SQLite (SQLx)
│   └── tauri.conf.json # Конфигурация Tauri (окно, апдейтер, CSP)
└── vite.config.ts
```

## Скрипты

| Команда             | Описание                          |
| ------------------- | --------------------------------- |
| `npm run dev`       | Vite dev server (порт 1420)       |
| `npm run build`     | Сборка фронтенда                  |
| `npm run preview`   | Предпросмотр собранного фронтенда |
| `npm run tauri`     | Tauri CLI                         |
| `npm run lint`      | ESLint                            |
| `npm run typecheck` | Проверка типов TypeScript         |
| `npm run format`    | Форматирование Prettier           |

## Лицензия

MIT

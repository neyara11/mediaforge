# MediaForge

AI-креативная студия для генерации изображений, музыки, речи и видео. Десктопное приложение на Tauri + React + TypeScript.

## Возможности

- **Image Studio** — генерация изображений по текстовому описанию, с референсами, редактором на canvas (fabric.js) и историей
- **Music Studio** — генерация текстов песен и аудио (Lyria), настройка структуры (куплеты, припев, бридж), жанра и темпа
- **Speech Lab** — синтез речи (TTS) и распознавание (STT)
- **Video Studio** — генерация видео по промпту
- **Prompt Builder** — конструктор промптов с шаблонами для разных модальностей
- **Cost Tracker** — учёт стоимости генераций и месячный лимит расходов
- **Локализация** — русский и английский (i18next)

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
| API        | [RouterAI](https://routerai.ru)                 |
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

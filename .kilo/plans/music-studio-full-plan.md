# Music Studio: план полного функционала

> **Дата:** 2026-07-23 21:07 MSK
> **Статус:** План
> **Основа:** Разделы C3, C4, P11 архитектурного отчёта

---

## Текущее состояние (Phase 1 ✅)

| Компонент | Статус | Файл |
|---|---|---|
| Генерация текста (LLM) | ✅ | `MusicStudioPage.tsx → handleGenerateLyrics()` |
| Генерация музыки (Lyria 3) | ✅ | `chat.rs → chat_audio_generate()` |
| SSE-парсер (delta.content + delta.audio.data) | ✅ | `chat.rs` |
| Воспроизведение (play/pause/seek) | ✅ | `MusicStudioPage.tsx` — Audio элемент + seek bar |
| Скачивание MP3 (диалог сохранения) | ✅ | `save_base64_file` Rust command + plugin-dialog |
| Редактируемый текст песни | ✅ | `<textarea>` вместо `<pre>` |
| Плейлист (история треков) | ✅ | Sidebar с переключением |

**Проблемы текущего состояния:**
- Lyria 3 игнорирует указания типа вокала в промпте (нет API-параметра `voice`)
- Нельзя исправить произношение отдельных слов
- Нельзя изменить тональность/темп существующей песни
- Нельзя заменить вокал, сохранив мелодию

---

## Phase 2: Prompt-based refinement

### 2.1. Расширенные теги стиля в UI
Заменить простые `<select>` (genre, tempo) на систему тегов.

**Файл:** `src/features/music-studio/MusicStudioPage.tsx`

```
Genre: [pop] [rock] [electronic] [+]
Mood:  [sad] [energetic] [dreamy] [+]
Vocals: [female] [male] [child] [choir]
Instruments: [piano] [guitar] [synth] [drums]
Key: [C major] [A minor] [+]
Tempo: [slow 80] [medium 120] [fast 160]
```

Каждый тег — кнопка-чип, добавляется в промпт. Теги собираются в структурированную строку:

```
Style: pop, electronic | Mood: sad, dreamy | Vocals: female, soft
Instruments: piano, synth pads | Key: A minor | Tempo: 120 BPM
Lyrics theme: расставание, дождь, ночной город
```

### 2.2. Prompt templates
Предустановленные комбинации тегов для быстрого старта.

**Файл:** `src/features/music-studio/promptTemplates.ts`

```ts
export const PROMPT_TEMPLATES = [
  {
    name: "Грустная баллада",
    genre: "pop", mood: "sad", vocals: "female",
    instruments: "piano, strings",
    key: "A minor", tempo: "72",
  },
  {
    name: "Энергичный рок",
    genre: "rock", mood: "energetic", vocals: "male",
    instruments: "electric guitar, drums, bass",
    key: "E minor", tempo: "140",
  },
  // ... ещё 10-15 шаблонов
];
```

### 2.3. Quick actions для перегенерации
После генерации — кнопки быстрого повтора с вариациями:

```
[↻ Так же]  [👩 Женский вокал]  [👨 Мужской вокал]  
[🔽 Ниже тон]  [🔼 Выше тон]  [🐢 Медленнее]  [🐇 Быстрее]
```

Каждая кнопка добавляет/меняет соответствующий тег и отправляет новый запрос.

---

## Phase 3: STT + TTS re-voicing pipeline

Это **ключевая фича** для решения проблем с произношением и типом голоса.

### Архитектура пайплайна

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Lyria 3 │ →  │   STT    │ →  │  Segment │ →  │   TTS    │
│  (песня) │    │ (Whisper)│    │  Editor  │    │ (Grok…)  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                       │               │
                                       ▼               ▼
                                  ┌──────────────────────┐
                                  │  ffmpeg: склейка     │
                                  │  инструментал + TTS  │
                                  └──────────────────────┘
```

### 3.1. Команда STT (Rust)

**Файл:** `src-tauri/src/commands/speech.rs` (добавить)

```rust
#[tauri::command]
pub async fn transcribe_audio(
    state: State<'_, ApiState>,
    file_path: String,      // путь к сгенерированному аудио
    model: String,           // openai/whisper-large-v3
    language: Option<String>,
) -> Result<String, String>
```

**Что делает:**
1. Читает аудиофайл с диска
2. Отправляет `POST /v1/audio/transcriptions` с `response_format: "verbose_json"` и `timestamp_granularities: ["word"]`
3. Возвращает JSON с `{ text, segments: [{ start, end, text, words: [{ word, start, end }] }] }`

### 3.2. Segment Editor (React)

**Новый компонент:** `src/features/music-studio/SegmentEditor.tsx`

```
┌── Segment Editor ──────────────────────────────┐
│                                                  │
│  #   Start   End     Text                   TTS  │
│  ─────────────────────────────────────────────── │
│  1   0:00    0:04    За окном погасли фонари  ▶  │
│  2   0:04    0:08    Город спит, а я не сплю   ▶  │
│  3   0:08    0:12    В кармане мелочь от зари  ▶  │
│  4   0:12    0:16    Я ничего не продаю         ▶  │
│  ─────────────────────────────────────────────── │
│                                                  │
│  Voice: [Eve (Grok Voice) ▾]                     │
│  Speed: [1.0x]  Pitch: [0]                       │
│                                                  │
│  [▶ Preview selected]  [🔄 Replace all vocals]   │
│  [💾 Export mixed audio]                         │
└──────────────────────────────────────────────────┘
```

**Функции:**
- Каждая строка — редактируемая (исправить неправильно распознанное слово)
- Временные границы можно двигать (drag start/end)
- Выбор TTS-голоса для всего трека или отдельных строк
- Предпрослушивание одной строки через TTS
- Массовая замена всех строк выбранным голосом

### 3.3. TTS per-line (Rust + фронтенд)

**API вызов (фронтенд):**
```ts
// src/api/endpoints/speech.ts — уже существует textToSpeech()
const audioBytes = await textToSpeech({
  text: segment.text,
  model: ttsModel,       // "x-ai/grok-voice-tts-1.0"
  voice: selectedVoice,  // "eve"
  format: "mp3",
  speed: 1.0,
});
```

**Rust команда для склейки аудио (новая):**

```rust
// src-tauri/src/commands/audio.rs (новый файл)
#[tauri::command]
pub async fn mix_audio_segments(
    segments_json: String,  // [{ start_sec, end_sec, wav_path }]
    original_audio: String, // путь к исходному файлу
    output_path: String,
) -> Result<String, String>
```

Использует **ffmpeg sidecar** для:
1. Извлечения инструментала из оригинала (voice isolation — сложно) **ИЛИ**
2. Замены сегментов: вырезать оригинальный вокал по таймстемпам, вставить TTS-аудио

**Упрощённый подход (без voice isolation):**
- Сгенерировать TTS-аудио для каждой строки
- Склеить TTS-сегменты в правильном порядке с оригинальной длительностью
- Результат: чистый TTS-вокал с правильным произношением (но без оригинальной мелодии)

### 3.4. ffmpeg sidecar setup

**Требуется:** ffmpeg в `src-tauri/bin/` или указанный пользователем в Settings.

**Базовые команды ffmpeg для пайплайна:**

```bash
# Склеить TTS-сегменты с паузами
ffmpeg -i segment1.mp3 -i segment2.mp3 -filter_complex "
  [0:a]adelay=0|0[s1];
  [1:a]adelay=4000|4000[s2];
  [s1][s2]amix=inputs=2:duration=longest
" output.mp3

# Наложение TTS на инструментал (если есть разделение)
ffmpeg -i instrumental.wav -i tts_vocals.mp3 \
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.8" \
  output.mp3
```

---

## Phase 4: Audio visualization & advanced editing

### 4.1. Waveform viewer

**Библиотека:** `wavesurfer.js` (упомянута в плане, раздел C3)

**Новый компонент:** `src/features/music-studio/WaveformViewer.tsx`

```
┌── Waveform ───────────────────────────────────────┐
│  ▁▂▃▄▅▆▇██▇▆▅▄▃▂▁▁▂▃▄▅▆▇█▇▆▅▄▃▂▁                   │
│  ├──────Verse 1──────┤├─Chorus─┤├──Verse 2──────┤  │
│  pink                 blue       pink              │
│                                                    │
│  ◄───────[===========]───────────────────►         │
│         0:08                                       │
└────────────────────────────────────────────────────┘
```

Цветные регионы для разных секций песни. Клик по региону → выбрать для редактирования.

### 4.2. Section classification (LLM)

**API-вызов:** отправляет текст песни в текстовую LLM с промптом:

```
Классифицируй строки песни по секциям:
intro, verse, chorus, bridge, outro.
Верни JSON: [{ "line": "...", "section": "verse" }, ...]
```

**Результат:** каждая строка получает метку секции → раскраска waveform + отдельные настройки TTS-голоса для каждой секции.

### 4.3. Per-section voice settings

```
┌── Section Settings ──────────────────────────────┐
│                                                    │
│  [Verse 1]  Voice: [Eve ▾]  Emotion: [sad ▾]      │
│  [Chorus]   Voice: [Adam ▾]  Emotion: [powerful ▾]│
│  [Verse 2]  Voice: [Eve ▾]  Emotion: [sad ▾]      │
│  [Bridge]   Voice: [Bella ▾]  Emotion: [soft ▾]    │
│                                                    │
│  [Apply to all sections]                           │
└────────────────────────────────────────────────────┘
```

---

## Phase 5: Polish

### 5.1. Iteration history tree
**Файл:** `src/components/IterationTree.tsx` (общий компонент)

```
┌── History ────────────────────────┐
│  📝 Исходный текст                │
│  🎵 Lyria 3 (pop/female/120bpm)   │
│  ├─ 🔄 TTS-замена (Eve)          │
│  ├─ 🔄 TTS-замена (Adam)         │
│  └─ 🎵 Lyria 3 (rock/male/140)   │
│     └─ 🔄 TTS-замена (Adam)      │
└──────────────────────────────────┘
```

### 5.2. Cost tracking
Суммировать стоимость всех вызовов (Lyria 3 ~8₽ + STT ~0.07₽/мин + TTS ~0.15₽/1000 символов). Показывать в нижней панели Music Studio.

### 5.3. Export options
- MP3 (сохранить как...) ✅ уже есть
- WAV (lossless)
- Только инструментал (если возможно отделение)
- Только вокал (TTS)
- Текст песни (.txt)

---

## План реализации (порядок)

| # | Задача | Оценка | Зависит от |
|---|---|---|---|
| **P2.1** | Теги стиля в UI (чипы genre/mood/vocals/instruments/key) | 30 мин | — |
| **P2.2** | Prompt templates (10-15 шаблонов) | 20 мин | P2.1 |
| **P2.3** | Quick actions для перегенерации | 20 мин | P2.1 |
| **P3.1** | STT Rust command (Whisper → verbose_json с word timestamps) | 30 мин | — |
| **P3.2** | Segment Editor UI (таблица строк с таймстемпами) | 45 мин | P3.1 |
| **P3.3** | TTS per-line preview + batch replace | 40 мин | P3.2 |
| **P3.4** | ffmpeg sidecar: базовая склейка аудио-сегментов | 40 мин | P3.3 |
| **P4.1** | Waveform viewer (wavesurfer.js) | 45 мин | P3.4 |
| **P4.2** | LLM section classifier | 20 мин | — |
| **P4.3** | Per-section voice settings | 30 мин | P4.1, P4.2 |
| **P5.1** | Iteration history tree | 30 мин | — |
| **P5.2** | Cost tracking (Music Studio) | 15 мин | — |
| **P5.3** | Export options (WAV, lyrics.txt) | 20 мин | — |

**Итого: ~6.5 часов** на полный функционал Music Studio.

---

## Ключевые файлы (новые и изменяемые)

| Файл | Назначение |
|---|---|
| `src/features/music-studio/MusicStudioPage.tsx` | Основная страница — теги, quick actions, интеграция всех компонентов |
| `src/features/music-studio/SegmentEditor.tsx` | **Новый** — таблица строк с таймстемпами, TTS preview |
| `src/features/music-studio/WaveformViewer.tsx` | **Новый** — wavesurfer.js визуализация |
| `src/features/music-studio/promptTemplates.ts` | **Новый** — шаблоны промптов |
| `src/features/music-studio/SectionSettings.tsx` | **Новый** — настройки голоса по секциям |
| `src-tauri/src/commands/speech.rs` | STT-команда (добавить `transcribe_audio`) |
| `src-tauri/src/commands/audio.rs` | **Новый** — ffmpeg-команды для склейки аудио |
| `src-tauri/src/commands/mod.rs` | Регистрация нового модуля |
| `src-tauri/src/lib.rs` | Регистрация новых команд |
| `src/components/IterationTree.tsx` | Общий компонент истории итераций |
| `src/api/endpoints/speech.ts` | Уже есть `textToSpeech()` — использовать как есть |
| `src/api/types.ts` | Добавить типы для STT-ответа (segments, words) |

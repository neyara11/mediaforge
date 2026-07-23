# MediaForge v0.1.0 — First release

Desktop application for AI media generation via RouterAI API.

## Tech Stack
Tauri v2 + React 19 + TypeScript + SQLite + Tailwind CSS

## Studios

### Image Studio
- Text-to-image: DALL-E, Flux, Seedream, Gemini Imagen
- Image-to-image with reference upload
- Model-aware parameters (quality, n, size)
- Persistent history grid

### Music Studio
- Song generation via Lyria 3 Pro/Clip
- Editable lyrics textarea
- Audio player with seek bar and time display
- MP3 download (native save dialog)
- Playlist sidebar with persistent history

### Speech Lab
- TTS: Grok Voice, OpenAI TTS, Qwen, ElevenLabs, MiniMax
- Dynamic voice lists per model (from RouterAI docs)
- STT: Whisper transcription with file dialog + drag-and-drop
- Persistent history with click-to-restore

### Video Studio
- Async video generation with automatic polling
- Video player for completed tasks
- DB recovery for unfinished tasks
- Completed task history with re-download

## Installation
- Requires Windows 10+ with WebView2
- Download the `.msi` installer or `.exe` setup
- On first launch, enter your RouterAI API key

## Files
- `MediaForge_0.1.0_x64_en-US.msi` — MSI installer (5.3 MB)
- `MediaForge_0.1.0_x64-setup.exe` — NSIS installer (3.8 MB)

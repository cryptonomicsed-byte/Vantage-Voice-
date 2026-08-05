# SonicMind S2S — Realtime Speech-to-Speech Conversational AI

SonicMind S2S is a complete, modern **Speech-to-Speech (S2S)** real-time conversational AI application built with **React**, **TypeScript**, **Tailwind CSS**, and **Express** using **Google Gemini Live API** (`gemini-3.1-flash-live-preview`).

It enables fluid, low-latency (< 500 ms) voice conversations where users speak into their microphone and receive natural spoken responses with full support for **barge-in interruptions**, **Voice Activity Detection (VAD)**, **custom personas**, **live speech-to-speech translation**, and **multimodal vision/screen sharing**.

---

## 🏗️ Architecture Diagram & Overview

```
 ┌─────────────────────────────────────────────────────────┐
 │                      Client Browser                     │
 │  ┌─────────────────┐ ┌──────────────┐ ┌──────────────┐  │
 │  │ AudioRecorder   │ │ AudioPlayer  │ │  Animated    │  │
 │  │ (16kHz PCM Mic) │ │ (24kHz PCM)  │ │ Visualizer   │  │
 │  └────────┬────────┘ └──────▲───────┘ └──────────────┘  │
 └───────────┼─────────────────┼───────────────────────────┘
             │ WebSocket Audio │ Audio & Transcripts
             ▼                 │
 ┌─────────────────────────────┴───────────────────────────┐
 │                  Express + Node.js Server               │
 │  • Realtime WebSocket Server (/api/live-s2s)             │
 │  • Function Calling Execution (Weather, Search, Time)   │
 └─────────────────────────────┬───────────────────────────┘
                               │ Bidirectional Live Session
                               ▼
 ┌─────────────────────────────────────────────────────────┐
 │            Google Gemini Live API Server                │
 │  • Model: gemini-3.1-flash-live-preview                 │
 │  • Modality: Native Speech Input & Output               │
 └─────────────────────────────────────────────────────────┘
```

### Why Gemini Live API?
We chose **Google Gemini 3.1 Flash Live** over a cascaded STT ➔ LLM ➔ TTS pipeline for the following critical reasons:
1. **Sub-500ms End-to-End Latency**: Direct speech-to-speech processing eliminates intermediate transcription and audio synthesis steps.
2. **Natural Vocal Expression**: Preserves vocal inflections, pitch, emotional tone, and natural conversational cadence.
3. **Seamless Barge-in Interruptions**: The Live WebSocket session natively emits interruption events when the user speaks, enabling the client to immediately flush playback buffers.

---

## ✨ Features

- **Bidirectional Audio Streaming**: Continuous 16kHz PCM input capture and gapless 24kHz PCM output playback.
- **Voice Activity Detection (VAD)**: Real-time volume RMS calculation with customizable sensitivity thresholds and automatic silence detection.
- **Barge-in / Interruption Support**: User can interrupt AI speech output at any point; playback instantly stops and listening resumes.
- **Custom System Personas**:
  - Sonic Assistant
  - English Language Coach
  - Senior Tech Mentor
  - Captain Blackbeard (Sarcastic Pirate)
  - Zen Mindfulness Guide
  - Live Polyglot Translator
  - Custom user prompt instructions
- **Prebuilt AI Voices**: Zephyr, Puck, Charon, Kore, Fenrir, Aoede, Calliope, Nova, Ursa.
- **Live Speech-to-Speech Translation Mode**: Translate spoken input directly into 10+ international languages using `gemini-3.5-live-translate-preview`.
- **Function Calling / Tools**: Real-time tools for weather lookup, time checking, web search, and math calculations.
- **Live Transcript Timeline**: Real-time auto-scrolling turn history with copy & text export.
- **Multimodal Camera & Screen Input**: Stream 1 FPS snapshot frames to the AI so it can see what you see.
- **Performance & Latency Telemetry**: Live metrics gauge time-to-first-audio and packet counts.

---

## 🚀 Local Development Setup

### Prerequisites
- Node.js (v18+ or v20+)
- npm or pnpm
- Google Gemini API Key (`GEMINI_API_KEY`)

### 1. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Set your Gemini API key in `.env`:
```env
GEMINI_API_KEY="your-gemini-api-key-here"
```

### 2. Install Dependencies & Run
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 📦 Deployment Instructions

### Docker / Cloud Run
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
```

Build and run container:
```bash
docker build -t sonicmind-s2s .
docker run -p 3000:3000 -e GEMINI_API_KEY="your-key" sonicmind-s2s
```

---

## ⏱️ Latency Optimization & Production Hardening Notes

1. **Jitter Buffer Management**: In `AudioPlayer.ts`, incoming PCM audio chunks are scheduled sequentially using precise `AudioContext` timeline offsets (`nextStartTime`), preventing audio crackle or gaps under fluctuating network jitter.
2. **Downsampling & Quantization**: Mic input is resampled directly in browser to 16,000Hz mono 16-bit PCM before base64 encoding to minimize bandwidth.
3. **Graceful Reconnection**: WebSocket heartbeat (`ping`/`pong`) ensures connection health and auto-reconnects on temporary network drops.

# Caira Automade

A MERN-based AI agent website with a ChatGPT/Gemini-style interface, prompt-based chat, project/file summaries, basic code generation, image generation, and image enhancement.

## Quick Start

Node.js version: `24.x` recommended.

```bash
npm run install:all
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:5001`

## Gemini AI Setup

The app works in demo mode without API keys. To enable real Gemini calls, create `server/.env` from `server/.env.example` and set:

```env
GEMINI_API_KEY=your_key_here
```

If Gemini image quota is exhausted, the app uses Pollinations as a real image fallback so users still receive an actual generated image. Remove `REAL_IMAGE_FALLBACK_PROVIDER=pollinations` if you want Gemini-only image generation.

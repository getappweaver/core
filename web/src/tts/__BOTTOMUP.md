---
direct_hash: eb97525fc89cf22f00e458512c735d5924663b44e38c3517aebab6979ad33abe
subtree_hash: a5b69b33e56b6c2cc2b0ec0682e9b06845a3b9c99521dcb2481e56f57c017b26
files:
  piper.ts: 7946b020d4194b3af74471ea9164bdd828eae6b9c9a9c24fffa9bc1b7c4f4417
  speech-text.ts: 3b6b8314add99fbaa5740b49086ac019568fb6ccb84e4142e095ea5f228f730b
children:
---

# web/src/tts

## Purpose
The tts directory contains browser-side text-to-speech helpers for preparing readable speech text and playing Piper-generated audio. It manages local Piper enablement, playback lifecycle, sentence splitting, and text cleanup for spoken UI responses.

## Files
- `piper.ts` - Controls Piper TTS enablement, audio generation via the local API, and sentence-by-sentence playback with pause, resume, and stop support.
- `speech-text.ts` - Cleans markdown-like content into speakable text and splits input into sentence-sized chunks for TTS playback.

## Notes
- Piper state is stored in localStorage and current playback is module-global.
- Speech text helpers are markdown-aware and shared by Piper playback.

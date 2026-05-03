import { postBlob } from '../utils';

import { cleanupSpeechText, splitSpeechSentences } from './speech-text';

const PIPER_TTS_ENABLED_KEY = 'appweaver.tts.piper-enabled';
const PIPER_LENGTH_SCALE_MULTIPLIER = 1.2;

let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let playbackRequestId = 0;

type SpeakWithPiperTtsProps = {
  text: string;
  startSentenceIndex: number;
  onSentenceStart: ((index: number, sentences: string[]) => void) | null;
  onPlaybackStart: (() => void) | null;
  onPlaybackEnd: (() => void) | null;
};

function setPiperTtsEnabled(enabled: boolean): void {
  window.localStorage.setItem(PIPER_TTS_ENABLED_KEY, enabled ? '1' : '0');
}

export function isPiperTtsEnabled(): boolean {
  return window.localStorage.getItem(PIPER_TTS_ENABLED_KEY) === '1';
}

function clearCurrentAudio(): void {
  if (currentAudio != null) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }

  if (currentAudioUrl != null) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
}

async function generatePiperAudio(text: string): Promise<Blob> {
  return postBlob('/api/tts/piper', {
    text,
    lengthScale: PIPER_LENGTH_SCALE_MULTIPLIER,
  });
}

async function playAudioBlob(params: {
  blob: Blob;
  requestId: number;
  onPlaybackStart: (() => void) | null;
  onPlaybackEnd: (() => void) | null;
}): Promise<void> {
  if (params.requestId !== playbackRequestId) {
    return;
  }

  const url = URL.createObjectURL(params.blob);
  const audio = new Audio(url);
  currentAudio = audio;
  currentAudioUrl = url;

  await new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      if (currentAudio === audio) {
        currentAudio = null;
      }

      if (currentAudioUrl === url) {
        currentAudioUrl = null;
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      params.onPlaybackEnd?.();
      resolve();
    };

    audio.onerror = () => {
      clearCurrentAudio();
      params.onPlaybackEnd?.();
      reject(new Error('Piper TTS playback failed.'));
    };

    void audio
      .play()
      .then(() => {
        if (params.requestId === playbackRequestId) {
          params.onPlaybackStart?.();
        }
      })
      .catch((err) => {
        clearCurrentAudio();
        params.onPlaybackEnd?.();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

export async function preparePiperTts(): Promise<void> {
  const warmupText = 'Piper TTS is ready.';
  const blob = await generatePiperAudio(warmupText);
  const warmupUrl = URL.createObjectURL(blob);
  URL.revokeObjectURL(warmupUrl);
  setPiperTtsEnabled(true);
}

export function stopPiperTts(): void {
  playbackRequestId += 1;
  clearCurrentAudio();
}

export function pausePiperTts(): boolean {
  if (currentAudio == null || currentAudio.paused) {
    return false;
  }

  currentAudio.pause();

  return true;
}

export function resumePiperTts(): boolean {
  if (currentAudio == null || !currentAudio.paused) {
    return false;
  }

  void currentAudio.play();

  return true;
}

export async function speakWithPiperTts(
  props: SpeakWithPiperTtsProps,
): Promise<void> {
  const requestId = playbackRequestId + 1;
  playbackRequestId = requestId;
  const sentences = splitSpeechSentences(props.text);

  if (sentences.length === 0) {
    return;
  }

  clearCurrentAudio();

  const blobPromises: Array<Promise<Blob> | undefined> = [];

  const startIndex = Math.max(
    0,
    Math.min(props.startSentenceIndex, sentences.length - 1),
  );

  function prepareSentence(index: number): Promise<Blob> {
    const existing = blobPromises[index];

    if (existing != null) {
      return existing;
    }

    const sentence = sentences[index];

    if (sentence == null) {
      throw new Error('missing_tts_sentence');
    }

    const speechSentence = cleanupSpeechText(sentence);

    if (speechSentence.length === 0) {
      throw new Error('empty_tts_sentence');
    }

    const next = generatePiperAudio(speechSentence);
    blobPromises[index] = next;

    return next;
  }

  prepareSentence(startIndex);

  for (let index = startIndex; index < sentences.length; index += 1) {
    const blob = await prepareSentence(index);

    if (requestId !== playbackRequestId) {
      return;
    }

    if (index + 1 < sentences.length) {
      prepareSentence(index + 1);
    }

    props.onSentenceStart?.(index, sentences);

    await playAudioBlob({
      blob,
      requestId,
      onPlaybackStart: index === startIndex ? props.onPlaybackStart : null,
      onPlaybackEnd:
        index + 1 === sentences.length ? props.onPlaybackEnd : null,
    });
  }
}

import { createEffect, createSignal, onCleanup } from 'solid-js';

import type { WebNode, WebNodeRoot } from '@src/web/ui-schema';

import {
  isPiperTtsEnabled,
  pausePiperTts,
  resumePiperTts,
  speakWithPiperTts,
  stopPiperTts,
} from '../../tts/piper';
import { cleanupSpeechText, splitSpeechSentences } from '../../tts/speech-text';

import { WebButton } from '../WebButton';

import {
  cardHeadSpeakerIcon,
  cardHeadStoryPauseIcon,
  cardHeadStoryPlayIcon,
  cardHeadStoryPreviousIcon,
} from './timelineCardHeadIcons';

type SpeechState = 'idle' | 'loading' | 'playing' | 'paused';

function collectNodeText(node: WebNode, parts: string[]): void {
  if (node.type === 'text') {
    parts.push(node.value);

    return;
  }

  if (typeof node.props?.label === 'string') {
    parts.push(node.props.label);
  }

  if (typeof node.props?.alt === 'string') {
    parts.push(node.props.alt);
  }

  if (node.summary) {
    collectNodeText(node.summary, parts);
  }

  for (const child of node.children ?? []) {
    collectNodeText(child, parts);
  }
}

export function readablePromptText(params: {
  text: string | null;
  web: WebNodeRoot | null;
}): string {
  if (params.text != null && params.text.trim().length > 0) {
    return params.text.trim();
  }

  if (params.web == null) {
    return '';
  }

  const parts: string[] = [];
  collectNodeText(params.web.tree, parts);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

type TimelineSpeechButtonProps = {
  text: string;
  class: string;
  label: string;
  seekSentenceIndex?: number | null;
  onSeekHandled?: (() => void) | null;
  onSentenceState?:
    | ((state: {
        active: boolean;
        sentenceIndex: number | null;
        sentences: string[];
      }) => void)
    | null;
};

export function TimelineSpeechButton(props: TimelineSpeechButtonProps) {
  const [speechState, setSpeechState] = createSignal<SpeechState>('idle');
  let utterance: SpeechSynthesisUtterance | null = null;
  let piperActive = false;
  let speechRunId = 0;

  const hasSeek = () => speechState() !== 'idle';

  const isActive = () =>
    speechState() === 'loading' || speechState() === 'playing';

  const supported = () =>
    typeof window !== 'undefined' &&
    (isPiperTtsEnabled() ||
      ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window));

  const stop = (): void => {
    speechRunId += 1;
    window.speechSynthesis.cancel();
    stopPiperTts();
    piperActive = false;
    utterance = null;
    setSpeechState('idle');

    props.onSentenceState?.({
      active: false,
      sentenceIndex: null,
      sentences: [],
    });
  };

  const pause = (): void => {
    if (isPiperTtsEnabled()) {
      if (pausePiperTts()) {
        setSpeechState('paused');
      }

      return;
    }

    window.speechSynthesis.pause();
    setSpeechState('paused');
  };

  const resume = (): void => {
    if (isPiperTtsEnabled()) {
      if (resumePiperTts()) {
        setSpeechState('playing');
      }

      return;
    }

    window.speechSynthesis.resume();
    setSpeechState('playing');
  };

  const startSpeech = (startSentenceIndex: number): void => {
    if (!supported() || props.text.length === 0) {
      return;
    }

    const speechText = cleanupSpeechText(props.text);

    if (speechText.length === 0) {
      return;
    }

    if (isPiperTtsEnabled()) {
      speechRunId += 1;
      const runId = speechRunId;
      const displaySentences = splitSpeechSentences(props.text);

      stopPiperTts();
      piperActive = true;
      setSpeechState('loading');

      void speakWithPiperTts({
        text: props.text,
        startSentenceIndex,
        onSentenceStart: (sentenceIndex) => {
          if (piperActive && runId === speechRunId) {
            props.onSentenceState?.({
              active: true,
              sentenceIndex,
              sentences: displaySentences,
            });
          }
        },
        onPlaybackStart: () => {
          if (piperActive && runId === speechRunId) {
            setSpeechState('playing');
          }
        },
        onPlaybackEnd: () => {
          if (piperActive && runId === speechRunId) {
            piperActive = false;
            setSpeechState('idle');

            props.onSentenceState?.({
              active: false,
              sentenceIndex: null,
              sentences: [],
            });
          }
        },
      })
        .catch((err) => console.error(err))
        .finally(() => {
          if (piperActive && runId === speechRunId) {
            piperActive = false;
            setSpeechState('idle');

            props.onSentenceState?.({
              active: false,
              sentenceIndex: null,
              sentences: [],
            });
          }
        });

      return;
    }

    window.speechSynthesis.cancel();

    const sentences = splitSpeechSentences(speechText);

    const nextUtterance = new SpeechSynthesisUtterance(
      sentences.slice(startSentenceIndex).join(' '),
    );

    utterance = nextUtterance;
    setSpeechState('playing');

    nextUtterance.onend = () => {
      if (utterance === nextUtterance) {
        utterance = null;
        setSpeechState('idle');
      }
    };

    nextUtterance.onerror = nextUtterance.onend;
    window.speechSynthesis.speak(nextUtterance);
  };

  const toggleSpeech = (): void => {
    if (!supported() || props.text.length === 0) {
      return;
    }

    if (speechState() === 'paused') {
      resume();

      return;
    }

    if (isActive() || piperActive) {
      pause();

      return;
    }

    startSpeech(0);
  };

  createEffect(() => {
    const seekSentenceIndex = props.seekSentenceIndex;

    if (seekSentenceIndex == null || !hasSeek()) {
      return;
    }

    props.onSeekHandled?.();
    startSpeech(seekSentenceIndex);
  });

  onCleanup(() => {
    if (utterance != null || piperActive) {
      stop();
    }
  });

  return (
    <>
      <WebButton
        type="button"
        class={`tag tag-button card-head-chrome-btn card-head-speech-btn card-head-speech-reset-btn ${props.class}`}
        disabled={!supported() || !hasSeek()}
        title={`Reset ${props.label} speech to start`}
        aria-label={`Reset ${props.label} speech to start`}
        onClick={stop}
      >
        {cardHeadStoryPreviousIcon()}
      </WebButton>
      <WebButton
        type="button"
        class={`tag tag-button card-head-chrome-btn card-head-speech-btn ${props.class}`}
        disabled={!supported() || props.text.length === 0}
        title={
          speechState() === 'paused'
            ? `Resume reading ${props.label}`
            : hasSeek()
              ? `Pause reading ${props.label}`
              : `Read ${props.label} aloud`
        }
        aria-label={
          speechState() === 'paused'
            ? `Resume reading ${props.label}`
            : hasSeek()
              ? `Pause reading ${props.label}`
              : `Read ${props.label} aloud`
        }
        aria-pressed={hasSeek()}
        onClick={toggleSpeech}
      >
        {speechState() === 'paused'
          ? cardHeadStoryPlayIcon()
          : hasSeek()
            ? cardHeadStoryPauseIcon()
            : cardHeadSpeakerIcon()}
      </WebButton>
    </>
  );
}

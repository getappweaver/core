export function cleanupSpeechText(text: string): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '\n\nCode block omitted.\n\n')
    .replace(/^#{1,6}\s+(.+)$/gm, '$1\n')
    .replace(/^\s{0,3}[-*+]\s+(.+)$/gm, '$1\n')
    .replace(/^\s{0,3}\d+[.)]\s+(.+)$/gm, '$1\n')
    .replace(/^\s{0,3}>\s?(.+)$/gm, '$1\n')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '\n')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~>#|]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/([.!?:;])\s*\n+/g, '$1 ')
    .replace(/([^.!?:;\s])\s*\n{2,}/g, '$1 ')
    .replace(/([^.!?:;\s])\s*\n/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0 || /[.!?:;]$/.test(cleaned)) {
    return cleaned;
  }

  return `${cleaned}.`;
}

function splitParagraphSentences(text: string): string[] {
  const matches = text.match(/[^.!?:;]+[.!?:;]+["')\]]?|[^.!?:;]+$/g) ?? [text];

  return matches
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function splitSpeechSentences(text: string): string[] {
  const sentences: string[] = [];
  let paragraphLines: string[] = [];

  function flushParagraph(): void {
    if (paragraphLines.length === 0) {
      return;
    }

    sentences.push(...splitParagraphSentences(paragraphLines.join('\n')));
    paragraphLines = [];
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || /^[-*_]{3,}$/.test(trimmed)) {
      flushParagraph();

      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      flushParagraph();
      sentences.push(line.trim());

      continue;
    }

    if (/^\s{0,3}(?:[-*+] |\d+[.)]\s+)/.test(line)) {
      flushParagraph();
      sentences.push(line.trim());

      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();

  return sentences;
}

import {
  WebCommandDownloadSchema,
  type WebCommandDownload,
} from '@src/web/ui-schema';

export function parseCommandDownload(text: string): WebCommandDownload {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(text || 'Command did not return a download.');
  }

  const parsed = WebCommandDownloadSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error('Command returned an invalid download.');
  }

  return parsed.data;
}

export function downloadTextFile({
  filename,
  mimeType,
  content,
}: WebCommandDownload): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Pure utility functions extracted from content.ts for testability.
 *
 * These functions contain no side effects and no dependency on Chrome APIs or DOM state,
 * making them straightforward to unit-test.
 */

// ─── URL matching ────────────────────────────────────────────────

export function isUrlEnabled(hostname: string, enabledUrls: string[]): boolean {
  return enabledUrls.some(url => {
    if (url.includes('*')) {
      const pattern = url.replace(/\*/g, '.*');
      return new RegExp(pattern).test(hostname);
    }
    return hostname.includes(url);
  });
}

// ─── Filename generation helpers ─────────────────────────────────

export function extractFirstSentence(content: string): string {
  let text = content.trim();
  text = text.replace(/^#+\s+/gm, '');
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/\*(.+?)\*/g, '$1');
  text = text.replace(/`(.+?)`/g, '$1');
  text = text.replace(/\[(.+?)\]\(.+?\)/g, '$1');

  const sentences = text.split(/[。.!?！？\n]/);
  for (const sentence of sentences) {
    const cleaned = sentence.trim();
    if (cleaned.length > 5) {
      return cleaned;
    }
  }
  return text.substring(0, 50).trim();
}

export function cleanSentence(sentence: string): string {
  const removePatterns = [
    /^好的[，,。\s]*/i,
    /^当然[，,。\s]*/i,
    /^我会[^\s]{0,5}/i,
    /^我将[^\s]{0,5}/i,
    /^让我[^\s]{0,5}/i,
    /^明白[了吗]?[，,。\s]*/i,
    /^收到[，,。\s]*/i,
    /^好[的啦][，,。\s]*/i,
    /^OK[，,。\s]*/i,
    /^了解[，,。\s]*/i,
    /^没问题[，,。\s]*/i,
  ];

  let cleaned = sentence;
  for (const pattern of removePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  cleaned = cleaned.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
  cleaned = cleaned.replace(/\s+/g, '-');
  cleaned = cleaned.replace(/^-+|-+$/g, '');

  return cleaned;
}

export function truncateFilename(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  let truncated = text.substring(0, maxLength);
  const lastDash = truncated.lastIndexOf('-');

  if (lastDash > maxLength * 0.7) {
    truncated = truncated.substring(0, lastDash);
  }

  return truncated;
}

export function toSafeFilename(raw: string): string {
  const cleaned = (raw || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const fallback = cleaned || 'AI Studio 对话';
  const maxLen = 60;
  return fallback.length > maxLen ? fallback.slice(0, maxLen).trim() : fallback;
}

/**
 * Build a smart filename from content and metadata.
 * Accepts date/counter externally so the function stays pure.
 */
export function generateSmartFilename(
  content: string,
  now: Date,
  dailyCounter: number,
): string {
  const date =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  const time =
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');

  const sequence = String(dailyCounter).padStart(3, '0');
  const firstSentence = extractFirstSentence(content);
  const cleanedSentence = cleanSentence(firstSentence);
  const shortSentence = truncateFilename(cleanedSentence, 50);

  return `${date}-${time}-${sequence}-${shortSentence}.md`;
}

// ─── Content parsing ─────────────────────────────────────────────

export interface ParsedFile {
  path: string;
  filename: string;
  savePath: string;
  content: string;
}

export function parseFilesFromContent(
  content: string,
  pathMemory: Record<string, string> = {},
): { files: ParsedFile[]; updatedMemory: Record<string, string> } {
  const files: ParsedFile[] = [];
  const memory = { ...pathMemory };
  let memoryUpdated = false;

  // Step 1: Smart slicing – only split on --- outside code blocks
  const slices: string[] = [];
  let currentSliceStart = 0;
  let inCodeBlock = false;
  const lines = content.split('\n');
  let charIndex = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }

    if (!inCodeBlock && /^[-]{3,}$/.test(line.trim())) {
      const sliceEnd = charIndex;
      if (sliceEnd > currentSliceStart) {
        slices.push(content.substring(currentSliceStart, sliceEnd).trim());
      }
      currentSliceStart = charIndex + line.length + 1;
    }

    charIndex += line.length + 1;
  }

  if (currentSliceStart < content.length) {
    slices.push(content.substring(currentSliceStart).trim());
  }

  // Step 2: Parse each slice independently
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];

    const pathPatterns = [
      /(?:文件名|File\s*(?:Name|Path)?|路径|名称)[:：]\s*[`"]?([a-zA-Z0-9._\-\/]+\.[a-zA-Z0-9]+)[`"]?/i,
      /(?:\*\*|__|`)([a-zA-Z0-9._\-\/]+\.[a-zA-Z0-9]+)(?:\*\*|__|`)/,
      /^([a-zA-Z0-9._\-\/]+\.[a-zA-Z0-9]{1,10})$/m,
    ];

    let detectedPath: string | null = null;
    for (const pattern of pathPatterns) {
      const match = slice.match(pattern);
      if (match && match[1]) {
        detectedPath = match[1];
        break;
      }
    }

    if (!detectedPath) {
      continue;
    }

    const blockStartMatch = slice.match(/```(\w+)?[\r\n]+/);
    if (!blockStartMatch) {
      continue;
    }

    const contentStart = blockStartMatch.index! + blockStartMatch[0].length;
    const lastClosingIndex = slice.lastIndexOf('```');

    if (lastClosingIndex <= contentStart) {
      continue;
    }

    const blockContent = slice.substring(contentStart, lastClosingIndex).trim();

    let fullPath = detectedPath.replace(/^\.?\//, '');
    const parts = fullPath.split('/');
    const filename = parts.pop() || '';
    let savePath = parts.join('/');

    // Path memory lookup
    if (!savePath) {
      const lowerFilename = filename.toLowerCase();
      const memoryKey = Object.keys(memory).find(
        (k) => k.toLowerCase() === lowerFilename,
      );
      if (memoryKey) {
        savePath = memory[memoryKey];
        fullPath = savePath ? `${savePath}/${filename}` : filename;
      }
    }

    if (savePath && memory[filename] !== savePath) {
      memory[filename] = savePath;
      memoryUpdated = true;
    }

    files.push({ path: fullPath, filename, savePath, content: blockContent });
  }

  return { files, updatedMemory: memoryUpdated ? memory : pathMemory };
}

// ─── Markdown formatting ─────────────────────────────────────────

export function formatConversationPairsToMarkdown(
  conversations: Array<{ question: string; answer: string }>,
  title?: string,
  dateOverride?: string,
): string {
  const lines: string[] = [];

  const headerTitle = (title || 'AI Studio 对话导出').trim();
  lines.push(`# ${headerTitle}`);
  lines.push('');
  lines.push(`导出时间: ${dateOverride || new Date().toLocaleString()}`);
  lines.push(`轮数统计: ${conversations.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  conversations.forEach((conv, index) => {
    const paddedIndex = String(index + 1).padStart(2, '0');

    lines.push(`# ${paddedIndex}-Q`);
    lines.push('');
    lines.push(conv.question);
    lines.push('');

    lines.push(`# ${paddedIndex}-A`);
    lines.push('');
    lines.push(conv.answer);
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}

export function normalizeCodeFenceHeaders(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let pendingLang = '';

  const hasUiTokens = (line: string): boolean => {
    const hasCopy = /content_copy/i.test(line);
    const hasExpand = /expand_less|expand_more/i.test(line);
    const hasDownload = /download/i.test(line);
    const hasCode = /\bcode\b/i.test(line);
    return hasCode && (hasCopy || hasExpand || hasDownload);
  };

  const extractLang = (line: string): string => {
    let cleaned = line;
    cleaned = cleaned.replace(/\bcode\b\s*/gi, '');
    ['download', 'content_copy', 'expand_less', 'expand_more'].forEach(
      (kw) => {
        cleaned = cleaned.replace(new RegExp(kw, 'gi'), '');
      },
    );
    return cleaned.replace(/\s+/g, ' ').trim();
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (hasUiTokens(trimmed)) {
      const lang = extractLang(trimmed);
      if (lang) pendingLang = lang;
      continue; // drop junk line
    }

    if (pendingLang && trimmed.startsWith('```')) {
      const fenceMatch = trimmed.match(/^```(.*)$/);
      if (fenceMatch) {
        const existingLang = fenceMatch[1].trim();
        if (!existingLang) {
          output.push(line.replace(/^```/, `\`\`\`${pendingLang}`));
          pendingLang = '';
          continue;
        }
      }
      pendingLang = '';
    }

    if (pendingLang && trimmed.length > 0 && !trimmed.startsWith('```')) {
      pendingLang = '';
    }

    output.push(line);
  }

  return output.join('\n');
}

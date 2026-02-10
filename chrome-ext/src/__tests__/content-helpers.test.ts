import {
  isUrlEnabled,
  extractFirstSentence,
  cleanSentence,
  truncateFilename,
  toSafeFilename,
  generateSmartFilename,
  parseFilesFromContent,
  formatConversationPairsToMarkdown,
  normalizeCodeFenceHeaders,
} from '../utils/content-helpers';

// ─── isUrlEnabled ────────────────────────────────────────────────

describe('isUrlEnabled', () => {
  const defaultUrls = [
    'chat.openai.com',
    'claude.ai',
    'gemini.google.com',
    'chatgpt.com',
    'poe.com',
    'perplexity.ai',
    'deepseek.com',
    'aistudio.google.com',
  ];

  it('matches exact hostname substring', () => {
    expect(isUrlEnabled('chat.openai.com', defaultUrls)).toBe(true);
    expect(isUrlEnabled('claude.ai', defaultUrls)).toBe(true);
  });

  it('matches when hostname contains a listed URL', () => {
    expect(isUrlEnabled('www.chatgpt.com', defaultUrls)).toBe(true);
    expect(isUrlEnabled('sub.deepseek.com', defaultUrls)).toBe(true);
  });

  it('rejects unmatched hostnames', () => {
    expect(isUrlEnabled('example.com', defaultUrls)).toBe(false);
    expect(isUrlEnabled('google.com', defaultUrls)).toBe(false);
  });

  it('supports wildcard patterns', () => {
    const urls = ['*.example.com'];
    expect(isUrlEnabled('sub.example.com', urls)).toBe(true);
    expect(isUrlEnabled('deep.sub.example.com', urls)).toBe(true);
    expect(isUrlEnabled('example.com', urls)).toBe(false);
  });

  it('handles empty enabledUrls', () => {
    expect(isUrlEnabled('anything.com', [])).toBe(false);
  });

  it('handles empty hostname', () => {
    expect(isUrlEnabled('', defaultUrls)).toBe(false);
  });
});

// ─── extractFirstSentence ────────────────────────────────────────

describe('extractFirstSentence', () => {
  it('extracts first sentence from plain text', () => {
    expect(extractFirstSentence('Hello world. Second sentence.')).toBe(
      'Hello world',
    );
  });

  it('strips markdown headings', () => {
    // '# ' is stripped, leaving 'Title\nContent here.'
    // Split on \n yields 'Title' (5 chars, skipped <=5) and 'Content here' (returned)
    expect(extractFirstSentence('# Title\nContent here.')).toBe(
      'Content here',
    );
  });

  it('strips bold markdown', () => {
    expect(extractFirstSentence('**Important** message here.')).toBe(
      'Important message here',
    );
  });

  it('strips italic markdown', () => {
    expect(extractFirstSentence('*Italic* text here.')).toBe(
      'Italic text here',
    );
  });

  it('strips inline code', () => {
    // Backticks are stripped first, giving 'Use console.log for debugging.'
    // Then split on '.' yields 'Use console' (>5 chars, returned)
    expect(extractFirstSentence('Use `console.log` for debugging.')).toBe(
      'Use console',
    );
  });

  it('strips markdown links, keeps text', () => {
    expect(
      extractFirstSentence('Check [this link](https://example.com) out.'),
    ).toBe('Check this link out');
  });

  it('splits on Chinese period', () => {
    expect(extractFirstSentence('这是第一句话。这是第二句话。')).toBe(
      '这是第一句话',
    );
  });

  it('splits on exclamation mark', () => {
    expect(extractFirstSentence('Great job! Keep going.')).toBe('Great job');
  });

  it('splits on question mark', () => {
    expect(extractFirstSentence('How are you? I am fine.')).toBe(
      'How are you',
    );
  });

  it('skips short sentences (<=5 chars)', () => {
    expect(extractFirstSentence('Hi.\nThis is the real sentence.')).toBe(
      'This is the real sentence',
    );
  });

  it('returns first 50 chars if no valid sentence found', () => {
    const short = 'ab.cd';
    expect(extractFirstSentence(short)).toBe(short);
  });

  it('handles empty string', () => {
    expect(extractFirstSentence('')).toBe('');
  });

  it('handles whitespace-only string', () => {
    expect(extractFirstSentence('   ')).toBe('');
  });
});

// ─── cleanSentence ───────────────────────────────────────────────

describe('cleanSentence', () => {
  it('removes Chinese opening phrases', () => {
    expect(cleanSentence('好的，我来帮你')).toBe('我来帮你');
    // '当然，' is removed, then '没问题' also matches /^没问题/ pattern → empty
    expect(cleanSentence('当然，没问题')).toBe('');
    expect(cleanSentence('收到，开始处理')).toBe('开始处理');
    expect(cleanSentence('了解，马上开始')).toBe('马上开始');
  });

  it('removes OK prefix', () => {
    expect(cleanSentence('OK，开始吧')).toBe('开始吧');
  });

  it('removes special characters forbidden in filenames', () => {
    expect(cleanSentence('file<>name')).toBe('filename');
    expect(cleanSentence('path/to/file')).toBe('pathtofile');
    expect(cleanSentence('a:b?c')).toBe('abc');
  });

  it('replaces spaces with dashes', () => {
    expect(cleanSentence('hello world')).toBe('hello-world');
  });

  it('trims leading/trailing dashes', () => {
    expect(cleanSentence(' hello ')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(cleanSentence('')).toBe('');
  });

  it('handles string with only special chars', () => {
    expect(cleanSentence('<>:"/\\|?*')).toBe('');
  });
});

// ─── truncateFilename ────────────────────────────────────────────

describe('truncateFilename', () => {
  it('returns text unchanged if within limit', () => {
    expect(truncateFilename('short', 50)).toBe('short');
  });

  it('truncates at dash boundary when in last 30%', () => {
    // 'aaaa-bbbb-cccc-dddd-eeee-ffff' = 29 chars
    const input = 'aaaa-bbbb-cccc-dddd-eeee-ffff';
    const result = truncateFilename(input, 20);
    // maxLength=20, 70% = 14. Last dash before pos 20 is at pos 19 ('-ffff')
    // Actually last dash in first 20 chars: 'aaaa-bbbb-cccc-dddd-' -> dash at 19
    // 19 > 14, so truncate at 19
    expect(result).toBe('aaaa-bbbb-cccc-dddd');
  });

  it('truncates at maxLength if no suitable dash', () => {
    const input = 'abcdefghijklmnopqrstuvwxyz';
    const result = truncateFilename(input, 10);
    expect(result).toBe('abcdefghij');
  });

  it('handles exact length', () => {
    expect(truncateFilename('exact', 5)).toBe('exact');
  });

  it('handles maxLength of 0', () => {
    expect(truncateFilename('something', 0)).toBe('');
  });
});

// ─── toSafeFilename ─────────────────────────────────────────────

describe('toSafeFilename', () => {
  it('removes illegal filename characters', () => {
    expect(toSafeFilename('file:name?test')).toBe('filenametest');
  });

  it('collapses whitespace', () => {
    expect(toSafeFilename('hello   world')).toBe('hello world');
  });

  it('trims result', () => {
    expect(toSafeFilename('  hello  ')).toBe('hello');
  });

  it('returns fallback for empty input', () => {
    expect(toSafeFilename('')).toBe('AI Studio 对话');
  });

  it('returns fallback for null-ish input', () => {
    expect(toSafeFilename(null as unknown as string)).toBe('AI Studio 对话');
  });

  it('truncates at 60 characters', () => {
    const long = 'a'.repeat(100);
    expect(toSafeFilename(long).length).toBeLessThanOrEqual(60);
  });

  it('removes control characters', () => {
    expect(toSafeFilename('hello\x00world\x1F')).toBe('helloworld');
  });
});

// ─── generateSmartFilename ───────────────────────────────────────

describe('generateSmartFilename', () => {
  it('generates correct format', () => {
    const now = new Date(2026, 1, 10, 14, 30, 45); // 2026-02-10 14:30:45
    const result = generateSmartFilename('Hello world, this is content.', now, 1);
    expect(result).toMatch(/^20260210-143045-001-.+\.md$/);
  });

  it('zero-pads month, day, hour, minute, second', () => {
    const now = new Date(2026, 0, 5, 3, 7, 9); // 2026-01-05 03:07:09
    const result = generateSmartFilename('Test content here for the file.', now, 1);
    expect(result).toStartWith('20260105-030709-001-');
  });

  it('zero-pads daily counter', () => {
    const now = new Date(2026, 0, 1, 0, 0, 0);
    const result = generateSmartFilename('Some content for testing.', now, 42);
    expect(result).toContain('-042-');
  });

  it('ends with .md', () => {
    const now = new Date();
    const result = generateSmartFilename('Anything goes here as content.', now, 1);
    expect(result).toEndWith('.md');
  });
});

// Custom matchers for cleaner assertions
expect.extend({
  toStartWith(received: string, expected: string) {
    const pass = received.startsWith(expected);
    return {
      pass,
      message: () =>
        `expected "${received}" to start with "${expected}"`,
    };
  },
  toEndWith(received: string, expected: string) {
    const pass = received.endsWith(expected);
    return {
      pass,
      message: () =>
        `expected "${received}" to end with "${expected}"`,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toStartWith(expected: string): R;
      toEndWith(expected: string): R;
    }
  }
}

// ─── parseFilesFromContent ───────────────────────────────────────

describe('parseFilesFromContent', () => {
  it('parses a single file with backtick path', () => {
    const content = [
      '文件名: `src/index.ts`',
      '',
      '```typescript',
      'console.log("hello");',
      '```',
    ].join('\n');

    const { files } = parseFilesFromContent(content);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('index.ts');
    expect(files[0].savePath).toBe('src');
    expect(files[0].content).toBe('console.log("hello");');
  });

  it('parses a file with bold path', () => {
    const content = [
      '**src/utils/helper.ts**',
      '',
      '```ts',
      'export function helper() {}',
      '```',
    ].join('\n');

    const { files } = parseFilesFromContent(content);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('helper.ts');
    expect(files[0].savePath).toBe('src/utils');
  });

  it('parses multiple files separated by ---', () => {
    const content = [
      '`src/a.ts`',
      '```ts',
      'const a = 1;',
      '```',
      '---',
      '`src/b.ts`',
      '```ts',
      'const b = 2;',
      '```',
    ].join('\n');

    const { files } = parseFilesFromContent(content);
    expect(files).toHaveLength(2);
    expect(files[0].filename).toBe('a.ts');
    expect(files[1].filename).toBe('b.ts');
  });

  it('does not split on --- inside code blocks', () => {
    const content = [
      '`src/styles.css`',
      '```css',
      '.divider {',
      '  border: 1px solid #ccc;',
      '}',
      '---',
      '.other { color: red; }',
      '```',
    ].join('\n');

    const { files } = parseFilesFromContent(content);
    expect(files).toHaveLength(1);
    expect(files[0].content).toContain('---');
  });

  it('returns empty for content without file paths', () => {
    const { files } = parseFilesFromContent('Just some plain text without code blocks.');
    expect(files).toHaveLength(0);
  });

  it('returns empty for content with path but no code block', () => {
    const content = '`src/file.ts`\n\nNo code block here.';
    const { files } = parseFilesFromContent(content);
    expect(files).toHaveLength(0);
  });

  it('uses path memory for files without directory', () => {
    const content = [
      '`helper.ts`',
      '```ts',
      'export const x = 1;',
      '```',
    ].join('\n');

    const memory = { 'helper.ts': 'src/utils' };
    const { files } = parseFilesFromContent(content, memory);
    expect(files).toHaveLength(1);
    expect(files[0].savePath).toBe('src/utils');
    expect(files[0].path).toBe('src/utils/helper.ts');
  });

  it('updates memory when a new path is discovered', () => {
    const content = [
      '`lib/new-file.ts`',
      '```ts',
      'export const y = 2;',
      '```',
    ].join('\n');

    const { files, updatedMemory } = parseFilesFromContent(content, {});
    expect(files).toHaveLength(1);
    expect(updatedMemory['new-file.ts']).toBe('lib');
  });

  it('handles File Path: format', () => {
    const content = [
      'File Path: src/config.json',
      '',
      '```json',
      '{ "key": "value" }',
      '```',
    ].join('\n');

    const { files } = parseFilesFromContent(content);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('config.json');
  });
});

// ─── formatConversationPairsToMarkdown ───────────────────────────

describe('formatConversationPairsToMarkdown', () => {
  it('formats conversations with title', () => {
    const conversations = [
      { question: 'What is TypeScript?', answer: 'A typed superset of JS.' },
    ];
    const result = formatConversationPairsToMarkdown(
      conversations,
      'My Chat',
      '2026-02-10',
    );

    expect(result).toContain('# My Chat');
    expect(result).toContain('轮数统计: 1');
    expect(result).toContain('# 01-Q');
    expect(result).toContain('What is TypeScript?');
    expect(result).toContain('# 01-A');
    expect(result).toContain('A typed superset of JS.');
  });

  it('uses default title when not provided', () => {
    const result = formatConversationPairsToMarkdown(
      [{ question: 'Q', answer: 'A' }],
      undefined,
      '2026-01-01',
    );
    expect(result).toContain('# AI Studio 对话导出');
  });

  it('pads indices to 2 digits', () => {
    const conversations = Array.from({ length: 12 }, (_, i) => ({
      question: `Q${i + 1}`,
      answer: `A${i + 1}`,
    }));
    const result = formatConversationPairsToMarkdown(
      conversations,
      'Test',
      '2026-01-01',
    );
    expect(result).toContain('# 01-Q');
    expect(result).toContain('# 12-Q');
  });

  it('handles empty conversations', () => {
    const result = formatConversationPairsToMarkdown(
      [],
      'Empty',
      '2026-01-01',
    );
    expect(result).toContain('轮数统计: 0');
    expect(result).not.toContain('-Q');
  });
});

// ─── normalizeCodeFenceHeaders ───────────────────────────────────

describe('normalizeCodeFenceHeaders', () => {
  it('removes UI junk line and applies language to fence', () => {
    const input = [
      'code Pythondownloadcontent_copy',
      '```',
      'print("hello")',
      '```',
    ].join('\n');

    const result = normalizeCodeFenceHeaders(input);
    expect(result).not.toContain('content_copy');
    expect(result).toContain('```Python');
    expect(result).toContain('print("hello")');
  });

  it('keeps existing language on fence', () => {
    const input = [
      'code Powershelldownloadcontent_copy',
      '```bash',
      'echo hi',
      '```',
    ].join('\n');

    const result = normalizeCodeFenceHeaders(input);
    expect(result).toContain('```bash');
    expect(result).not.toContain('content_copy');
  });

  it('passes through normal markdown unchanged', () => {
    const input = '# Hello\n\nSome text\n\n```js\nconsole.log("hi");\n```';
    expect(normalizeCodeFenceHeaders(input)).toBe(input);
  });

  it('handles multiple junk lines', () => {
    const input = [
      'code JavaScriptdownloadcontent_copy',
      '```',
      'const a = 1;',
      '```',
      '',
      'code TypeScriptcontent_copyexpand_less',
      '```',
      'const b: number = 2;',
      '```',
    ].join('\n');

    const result = normalizeCodeFenceHeaders(input);
    expect(result).toContain('```JavaScript');
    expect(result).toContain('```TypeScript');
    expect(result).not.toContain('content_copy');
    expect(result).not.toContain('expand_less');
  });

  it('does not match lines without "code" keyword', () => {
    const input = 'downloadcontent_copy\n```\nsome code\n```';
    // No "code" keyword, so hasUiTokens returns false
    const result = normalizeCodeFenceHeaders(input);
    expect(result).toContain('downloadcontent_copy');
  });

  it('resets pendingLang if non-fence content appears', () => {
    const input = [
      'code Rubydownloadcontent_copy',
      'Some normal text',
      '```',
      'puts "hello"',
      '```',
    ].join('\n');

    const result = normalizeCodeFenceHeaders(input);
    // pendingLang should be reset by "Some normal text"
    expect(result).not.toContain('```Ruby');
    expect(result).toContain('```');
  });
});

/**
 * Extract and parse JSON from messy LLM output.
 *
 * Unit examples (input → parsed value):
 *
 * 1) Raw JSON
 *    `{"name": "John"}` → `{ name: "John" }`
 *
 * 2) Markdown fenced (json)
 *    "```json\n{\"name\": \"John\"}\n```" → `{ name: "John" }`
 *
 * 3) Markdown fenced (no language)
 *    "```\n{\"name\": \"John\"}\n```" → `{ name: "John" }`
 *
 * 4) JSON wrapped in prose
 *    `Sure! Here is the result: {"name": "John"} Hope that helps!` → `{ name: "John" }`
 *
 * 5) Trailing commas
 *    `{"name": "John",}` → `{ name: "John" }`
 *
 * 6) Single-quoted JSON (simple, no double quotes inside values)
 *    `{'name': 'John'}` → `{ name: "John" }`
 *
 * 7) JSON array at root
 *    `[{"name": "John"}]` → `[{ name: "John" }]`
 */

import { MAX_ERROR_SNIPPET } from './constants.js';
import { JSONExtractionError } from './errors.js';

/** New RegExp per use avoids shared `lastIndex` state from a global `/g` regex. */
function createFenceRegex(): RegExp {
  return /```(\w*)\s*\r?\n?([\s\S]*?)```/g;
}

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, '');
}

/** Remove trailing commas before `}` or `]` (invalid JSON but common from LLMs). */
function stripTrailingCommas(json: string): string {
  let prev = '';
  let out = json;
  while (out !== prev) {
    prev = out;
    out = out.replace(/,(\s*[}\]])/g, '$1');
  }
  return out;
}

/**
 * Convert trivial single-quoted JSON to double-quoted JSON.
 * Only used when the payload has no `"` characters (avoids mangling mixed strings).
 */
function singleQuotedToDoubleQuoted(s: string): string {
  return s.replace(/'/g, '"');
}

function tryParseJson(text: string): unknown {
  return JSON.parse(text);
}

/**
 * Extract the first balanced JSON object or array starting at `start`, respecting strings.
 */
function extractBalancedJson(source: string, start: number): string | null {
  const first = source[start];
  if (first !== '{' && first !== '[') return null;

  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      stack.push('}');
      continue;
    }
    if (ch === '[') {
      stack.push(']');
      continue;
    }

    if (ch === '}' || ch === ']') {
      const expected = stack.pop();
      if (expected === undefined || ch !== expected) return null;
      if (stack.length === 0) return source.slice(start, i + 1);
    }
  }

  return null;
}

/** Collect balanced JSON substrings starting at each `{` or `[`. */
function collectBalancedCandidates(source: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c !== '{' && c !== '[') continue;
    const slice = extractBalancedJson(source, i);
    if (slice) out.push(slice);
  }
  return out;
}

function parseFirstMatchingFence(raw: string, mode: 'json' | 'generic'): unknown {
  const FENCE_REGEX = createFenceRegex();
  let m: RegExpExecArray | null;
  while ((m = FENCE_REGEX.exec(raw)) !== null) {
    const lang = (m[1] ?? '').toLowerCase();
    const body = (m[2] ?? '').trim();
    if (mode === 'json' && lang !== 'json') continue;
    if (mode === 'generic' && lang === 'json') continue;
    try {
      return tryParseJson(body);
    } catch {
      /* try next fence */
    }
  }
  throw new SyntaxError(
    mode === 'json'
      ? 'no valid ```json``` fenced block'
      : 'no valid generic ``` fenced block',
  );
}

/**
 * Parse JSON from raw LLM text. Tries each strategy in order; returns the first successful parse.
 */
export function extractJSON(raw: string): unknown {
  if (typeof raw !== 'string') {
    throw new TypeError('[llm-schema-validator] extractJSON: expected a string');
  }

  const text = stripBom(raw).trim();
  const failures: string[] = [];
  /** Computed once per call — reused by strategies that need balanced segments (see CODE_REVIEW #10). */
  const balancedCandidates = collectBalancedCandidates(raw);

  const strategies = [
    {
      name: 'raw JSON',
      run: () => tryParseJson(text),
    },
    {
      name: 'markdown fenced (json)',
      run: () => parseFirstMatchingFence(raw, 'json'),
    },
    {
      name: 'markdown fenced (no language tag)',
      run: () => parseFirstMatchingFence(raw, 'generic'),
    },
    {
      name: 'balanced JSON in prose',
      run: () => {
        for (const candidate of balancedCandidates) {
          try {
            return tryParseJson(candidate);
          } catch {
            /* try next candidate */
          }
        }
        throw new SyntaxError('no balanced JSON object/array found');
      },
    },
    {
      name: 'trailing commas',
      run: () => {
        try {
          return tryParseJson(stripTrailingCommas(text));
        } catch {
          /* fall through to balanced candidates */
        }
        for (const candidate of balancedCandidates) {
          try {
            return tryParseJson(stripTrailingCommas(candidate));
          } catch {
            /* try next candidate */
          }
        }
        throw new SyntaxError('trailing-comma repair failed');
      },
    },
    {
      name: 'single-quoted JSON',
      run: () => {
        const tryCandidate = (s: string) => {
          if (s.includes('"')) throw new SyntaxError('contains double quotes');
          return tryParseJson(singleQuotedToDoubleQuoted(s));
        };

        for (const candidate of balancedCandidates) {
          try {
            return tryCandidate(candidate);
          } catch {
            /* try next candidate */
          }
        }
        try {
          return tryCandidate(text);
        } catch {
          throw new SyntaxError('single-quote repair failed');
        }
      },
    },
    {
      name: 'JSON array at root',
      run: () => {
        if (!text.startsWith('[')) {
          throw new SyntaxError('trimmed input does not start with "["');
        }
        return tryParseJson(stripTrailingCommas(text));
      },
    },
  ] as const satisfies ReadonlyArray<{ readonly name: string; run: () => unknown }>;

  for (const { name, run } of strategies) {
    try {
      return run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${name}: ${msg}`);
    }
  }

  const preview =
    raw.length > MAX_ERROR_SNIPPET ? `${raw.slice(0, MAX_ERROR_SNIPPET)}…` : raw;
  const detail = failures.length ? `\nAttempts:\n${failures.map((f) => `  - ${f}`).join('\n')}` : '';
  throw new JSONExtractionError(
    `Could not parse JSON from LLM response.${detail}\nRaw (truncated):\n${preview}`,
    preview,
  );
}

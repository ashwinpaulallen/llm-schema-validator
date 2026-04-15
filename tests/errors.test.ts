import { describe, expect, it } from 'vitest';

import {
  JSONExtractionError,
  ProviderError,
  QueryRetriesExhaustedError,
} from '../src/errors.js';
import { extractJSON } from '../src/parser.js';

describe('custom errors', () => {
  it('extractJSON throws JSONExtractionError when unparseable', () => {
    expect(() => extractJSON('{{{')).toThrow(JSONExtractionError);
    try {
      extractJSON('{{{');
    } catch (e) {
      expect(e).toBeInstanceOf(JSONExtractionError);
      expect((e as JSONExtractionError).message).toMatch(/json:/);
      expect((e as JSONExtractionError).rawPreview).toBeDefined();
    }
  });

  it('ProviderError preserves optional cause', () => {
    const inner = new Error('inner');
    const p = new ProviderError('wrapped', inner);
    expect(p.message).toMatch(/provider:/);
    expect(p.cause).toBe(inner);
  });

  it('QueryRetriesExhaustedError exposes structured fields', () => {
    const err = new QueryRetriesExhaustedError(2, ['a', 'b'], 'snippet');
    expect(err.attempts).toBe(2);
    expect(err.collectedErrors).toEqual(['a', 'b']);
    expect(err.lastRawSnippet).toBe('snippet');
    expect(err.usage).toBeUndefined();
    expect(err.message).toMatch(/query:/);
    expect(err.message).toMatch(/Failed after 2 attempt/);
  });

  it('QueryRetriesExhaustedError may carry aggregated usage', () => {
    const usage = { promptTokens: 5, completionTokens: 2, totalTokens: 7 };
    const err = new QueryRetriesExhaustedError(1, ['e'], 's', usage);
    expect(err.usage).toEqual(usage);
  });
});

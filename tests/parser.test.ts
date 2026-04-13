import { describe, expect, it } from 'vitest';

import { extractJSON } from '../src/parser.js';

describe('extractJSON', () => {
  it('parses raw JSON object', () => {
    expect(extractJSON('{"name": "John"}')).toEqual({ name: 'John' });
  });

  it('parses markdown fenced json', () => {
    const raw = '```json\n{"name": "John"}\n```';
    expect(extractJSON(raw)).toEqual({ name: 'John' });
  });

  it('parses markdown fenced without language', () => {
    const raw = '```\n{"name": "John"}\n```';
    expect(extractJSON(raw)).toEqual({ name: 'John' });
  });

  it('extracts JSON from prose', () => {
    const raw = 'Sure! Here is the result: {"name": "John"} Hope that helps!';
    expect(extractJSON(raw)).toEqual({ name: 'John' });
  });

  it('fixes trailing commas on object', () => {
    expect(extractJSON('{"name": "John",}')).toEqual({ name: 'John' });
  });

  it('parses simple single-quoted JSON', () => {
    expect(extractJSON("{'name': 'John'}")).toEqual({ name: 'John' });
  });

  it('parses JSON array at root', () => {
    expect(extractJSON('[{"name": "John"}]')).toEqual([{ name: 'John' }]);
  });

  it('strips BOM', () => {
    expect(extractJSON('\uFEFF{"a":1}')).toEqual({ a: 1 });
  });

  it('throws TypeError for non-string', () => {
    expect(() => extractJSON(null as unknown as string)).toThrow(TypeError);
    expect(() => extractJSON(null as unknown as string)).toThrow(/extractJSON/);
  });

  it('throws JSONExtractionError when no JSON can be parsed', async () => {
    const { JSONExtractionError } = await import('../src/errors.js');
    expect(() => extractJSON('not json at all {{{')).toThrow(JSONExtractionError);
    expect(() => extractJSON('not json at all {{{')).toThrow(/Could not parse JSON/);
  });
});

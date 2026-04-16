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

  it('prefers last top-level JSON when multiple appear (chain-of-thought)', () => {
    const raw = `Thinking aloud.
Illustrative: {"draft": true}
Final:
{"answer": 42, "ok": true}`;
    expect(extractJSON(raw)).toEqual({ answer: 42, ok: true });
  });

  it('returns outer JSON when nested (inner span is not picked over parent)', () => {
    expect(extractJSON('See {"outer": {"inner": 1}} end')).toEqual({ outer: { inner: 1 } });
  });

  it('prefers last of two adjacent top-level objects', () => {
    const raw = 'A: {"a": 1} B: {"b": 2}';
    expect(extractJSON(raw)).toEqual({ b: 2 });
  });

  it('fixes trailing commas on object', () => {
    expect(extractJSON('{"name": "John",}')).toEqual({ name: 'John' });
  });

  it('parses simple single-quoted JSON', () => {
    expect(extractJSON("{'name': 'John'}")).toEqual({ name: 'John' });
  });

  it('parses single-quoted JSON with apostrophe inside a string value', () => {
    expect(extractJSON('{\'msg\': \'don\'t panic\'}')).toEqual({ msg: "don't panic" });
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

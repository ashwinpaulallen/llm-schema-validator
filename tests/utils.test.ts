import { describe, expect, it } from 'vitest';

import { isPlainObject, toLabel, truncate } from '../src/utils.js';

describe('utils', () => {
  describe('isPlainObject', () => {
    it('returns true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
    });

    it('returns false for non-objects', () => {
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
      expect(isPlainObject(42)).toBe(false);
      expect(isPlainObject('string')).toBe(false);
    });

    it('returns false for arrays', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
    });
  });

  describe('toLabel', () => {
    it('labels primitives correctly', () => {
      expect(toLabel(null)).toBe('null');
      expect(toLabel(undefined)).toBe('undefined');
      expect(toLabel(42)).toBe('42');
      expect(toLabel(true)).toBe('true');
      expect(toLabel('hello')).toBe('"hello"');
    });

    it('stringifies objects', () => {
      expect(toLabel({ a: 1 })).toBe('{"a":1}');
    });

    it('handles circular references gracefully', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(toLabel(circular)).toContain('[object Object]');
    });
  });

  describe('truncate', () => {
    it('returns string unchanged when shorter than max', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('truncates and adds ellipsis when longer than max', () => {
      const result = truncate('hello world', 5);
      expect(result).toBe('hello…');
      expect(result.length).toBe(6);
    });

    it('trims whitespace before measuring', () => {
      expect(truncate('  hello  ', 10)).toBe('hello');
    });
  });
});

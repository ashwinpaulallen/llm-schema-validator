import { describe, expect, it } from 'vitest';

import { MAX_SCHEMA_PATTERN_SOURCE_LENGTH } from '../src/constants.js';
import {
  isPatternSourceDisallowed,
  patternHasNestedQuantifierRisk,
  patternSourceTooLong,
} from '../src/regex-pattern-guard.js';

describe('regex-pattern-guard', () => {
  it('flags nested quantifier tail risk', () => {
    expect(patternHasNestedQuantifierRisk('(a+)+')).toBe(true);
    expect(patternHasNestedQuantifierRisk('(a+)+b')).toBe(true);
    expect(patternHasNestedQuantifierRisk('(?:x*)*')).toBe(true);
    expect(patternHasNestedQuantifierRisk('(a{2,})+')).toBe(true);
    expect(patternHasNestedQuantifierRisk('(a{1,3})*')).toBe(true);
  });

  it('allows common linear patterns', () => {
    expect(patternHasNestedQuantifierRisk('^[A-Z0-9]+$')).toBe(false);
    expect(patternHasNestedQuantifierRisk('(a)+')).toBe(false);
    expect(patternHasNestedQuantifierRisk('(a|b)+')).toBe(false);
    expect(patternHasNestedQuantifierRisk('')).toBe(false);
    // `{,m}` is literal in JS regex, not a quantifier — must not false-flag as nested quantifier risk.
    expect(patternHasNestedQuantifierRisk('(a{,5})+')).toBe(false);
  });

  it('respects max source length', () => {
    expect(patternSourceTooLong('a'.repeat(MAX_SCHEMA_PATTERN_SOURCE_LENGTH))).toBe(false);
    expect(patternSourceTooLong('a'.repeat(MAX_SCHEMA_PATTERN_SOURCE_LENGTH + 1))).toBe(true);
  });

  it('isPatternSourceDisallowed combines checks', () => {
    expect(isPatternSourceDisallowed('(a+)+')).toBe(true);
    expect(isPatternSourceDisallowed('^[a-z]$')).toBe(false);
  });
});

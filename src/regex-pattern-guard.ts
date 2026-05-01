import { MAX_SCHEMA_PATTERN_SOURCE_LENGTH } from './constants.js';

/**
 * If `start` is `{` beginning a valid `{n}`, `{n,}`, or `{n,m}` quantifier, return the index of
 * the closing `}`; otherwise `-1`.
 */
function braceQuantifierEndIndex(s: string, start: number): number {
  if (s[start] !== '{') return -1;
  let j = start + 1;
  let sawDigit = false;
  while (j < s.length && s[j]! >= '0' && s[j]! <= '9') {
    sawDigit = true;
    j++;
  }
  if (!sawDigit) return -1;
  if (j < s.length && s[j] === ',') {
    j++;
    while (j < s.length && s[j]! >= '0' && s[j]! <= '9') j++;
  }
  if (j >= s.length || s[j] !== '}') return -1;
  return j;
}

/**
 * Reject overly long pattern sources (compile cost and huge attack surface).
 */
export function patternSourceTooLong(source: string): boolean {
  return source.length > MAX_SCHEMA_PATTERN_SOURCE_LENGTH;
}

/**
 * Conservative heuristic: a capturing or non-capturing group whose body contains a quantifier,
 * immediately followed by another quantifier (e.g. `(a+)+`, `(?:x*)*`), often enables catastrophic
 * backtracking in V8. Not exhaustive — prefer short, simple patterns for untrusted schemas.
 */
export function patternHasNestedQuantifierRisk(source: string): boolean {
  const st: { innerQ: boolean }[] = [];
  let esc = false;
  let inClass = false;

  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\') {
      esc = true;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      continue;
    }

    if (c === '{') {
      const end = braceQuantifierEndIndex(source, i);
      if (end !== -1) {
        if (st.length) st[st.length - 1]!.innerQ = true;
        i = end;
      }
      continue;
    }

    if (c === '(') {
      st.push({ innerQ: false });
      continue;
    }

    if (c === ')') {
      if (!st.length) continue;
      const f = st.pop()!;
      const next = source[i + 1];
      if (f.innerQ) {
        if (next === '*' || next === '+' || next === '?') {
          return true;
        }
        if (next === '{' && braceQuantifierEndIndex(source, i + 1) !== -1) {
          return true;
        }
      }
      if (st.length && f.innerQ) {
        st[st.length - 1]!.innerQ = true;
      }
      continue;
    }

    if (c === '*' || c === '+') {
      if (st.length) st[st.length - 1]!.innerQ = true;
      continue;
    }

    if (c === '?') {
      const prev = i > 0 ? source[i - 1]! : '';
      if (prev === '(') continue;
      if (st.length) st[st.length - 1]!.innerQ = true;
    }
  }

  return false;
}

/** If true, do not compile or run `RegExp` for this source (treat like invalid pattern). */
export function isPatternSourceDisallowed(source: string): boolean {
  return patternSourceTooLong(source) || patternHasNestedQuantifierRisk(source);
}

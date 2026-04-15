/**
 * Shared utility functions used across modules.
 */

import type { CompletionUsage, LLMCompletion, LLMProviderCompleteResult } from './types.js';

/** Check if a value is a plain object (not array, not null). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Truncate a string to a maximum length, appending ellipsis if needed. */
export function truncate(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

/** Convert unknown value to a readable label for error messages. */
export function toLabel(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/** Normalize {@link LLMProviderCompleteResult} to text + optional usage. */
export function normalizeCompletionResult(result: LLMProviderCompleteResult): {
  text: string;
  usage?: CompletionUsage;
} {
  if (typeof result === 'string') {
    return { text: result };
  }
  if (result && typeof result === 'object' && 'text' in result) {
    const r = result as LLMCompletion;
    const text = typeof r.text === 'string' ? r.text : '';
    const u = r.usage;
    if (
      u &&
      (u.promptTokens !== undefined || u.completionTokens !== undefined || u.totalTokens !== undefined)
    ) {
      return { text, usage: { ...u } };
    }
    return { text };
  }
  return { text: '' };
}

/** Sum usage across attempts (undefined + n → treat missing as 0 only when the other side has data). */
export function mergeCompletionUsage(
  acc: CompletionUsage | undefined,
  next: CompletionUsage | undefined,
): CompletionUsage | undefined {
  if (!next) return acc;
  if (!acc) return { ...next };
  const promptTokens =
    acc.promptTokens !== undefined || next.promptTokens !== undefined
      ? (acc.promptTokens ?? 0) + (next.promptTokens ?? 0)
      : undefined;
  const completionTokens =
    acc.completionTokens !== undefined || next.completionTokens !== undefined
      ? (acc.completionTokens ?? 0) + (next.completionTokens ?? 0)
      : undefined;
  const totalTokens =
    acc.totalTokens !== undefined || next.totalTokens !== undefined
      ? (acc.totalTokens ?? 0) + (next.totalTokens ?? 0)
      : undefined;
  const out: CompletionUsage = {};
  if (promptTokens !== undefined) out.promptTokens = promptTokens;
  if (completionTokens !== undefined) out.completionTokens = completionTokens;
  if (totalTokens !== undefined) out.totalTokens = totalTokens;
  else if (out.promptTokens !== undefined && out.completionTokens !== undefined) {
    out.totalTokens = out.promptTokens + out.completionTokens;
  }
  return Object.keys(out).length ? out : undefined;
}

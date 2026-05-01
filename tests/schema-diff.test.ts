import { describe, expect, it } from 'vitest';

import { defineSchema } from '../src/index.js';
import { diffSchemas, generateMigrationGuide } from '../src/schema-diff.js';

describe('generateMigrationGuide', () => {
  it('uses plain-text markers without emoji (CI-friendly)', () => {
    const oldS = defineSchema({
      req: { type: 'string', required: true },
      opt: { type: 'number', required: false },
    });
    const newS = defineSchema({});
    const diff = diffSchemas(oldS, newS);
    const guide = generateMigrationGuide(diff);
    expect(guide).toContain('[BREAKING]');
    expect(guide).toContain('[Non-breaking]');
    expect(guide).not.toContain('⚠️');
    expect(guide).not.toContain('🔴');
    expect(guide).not.toContain('🟡');
  });
});

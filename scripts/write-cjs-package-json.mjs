import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, '../dist/cjs/package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);

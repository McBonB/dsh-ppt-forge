import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../src/frontmatter.js';

const here = dirname(fileURLToPath(import.meta.url));

// Fixtures are synthetic (no upstream text is redistributed here) but mirror
// the two structural shapes the parser must handle: a folded `>` description
// with a nested metadata map, and a long flat single-line description with
// CJK text and quotes.
const folded = parseFrontmatter(await readFile(join(here, 'fixtures', 'folded-frontmatter.md'), 'utf8'));
assert.ok(folded !== null, 'folded fixture parses');
assert.equal(folded.name, 'folded-frontmatter-fixture');
assert.match(folded.description, /^Synthetic multi-line folded description/);
assert.match(folded.description, /any upstream skill file\.$/);
assert.ok(!folded.description.includes('\n'), 'folded description joins into one line');
assert.ok(!folded.description.includes('alpha') && !folded.description.includes('1.0.0'), 'nested metadata block is skipped, not folded in');
assert.equal(folded.body, '# Fixture Body\n\nBody starts here.');

const flat = parseFrontmatter(await readFile(join(here, 'fixtures', 'flat-frontmatter.md'), 'utf8'));
assert.ok(flat !== null, 'flat fixture parses');
assert.equal(flat.name, 'flat-frontmatter-fixture');
assert.match(flat.description, /^自创的中文长单行描述/);
assert.match(flat.description, /与任何上游技能文件无关。当需要验证扁平 key 冒号后紧跟长文本时使用。$/);
assert.equal(flat.body, '# Fixture Body\n\nBody starts here.');

// Degenerate inputs fail closed (null), never return half-parsed data.
assert.equal(parseFrontmatter('no frontmatter at all'), null);
assert.equal(parseFrontmatter('---\nname: only-name\n---\nbody'), null);
assert.equal(parseFrontmatter('---\ndescription: only-description\n---\nbody'), null);

console.log('frontmatter tests passed');

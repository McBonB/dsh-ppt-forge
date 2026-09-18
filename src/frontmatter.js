/**
 * Minimal YAML-subset parser for SKILL.md frontmatter.
 *
 * dsh discovers skills only through its own roots, so this plugin registers
 * the two upstream skills inline: `ctx.skills.register()` needs `name`,
 * `description`, and the markdown body, which means parsing the frontmatter of
 * files we did not write. The parser covers the shapes those files actually
 * use — flat `key: value` lines, `>` folded and `|` literal blocks — and
 * skips nested blocks (such as a nested `metadata` map) instead of
 * interpreting them. Anything outside the subset is ignored, never guessed.
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\n([\s\S]*))?$/;

/** @returns {{ name: string, description: string, body: string } | null} */
export function parseFrontmatter(text) {
  const match = FRONTMATTER.exec(text);
  if (match === null) return null;
  const raw = match[1];
  const body = match[2] ?? '';
  const fields = parseBlock(raw.split(/\r?\n/), 0);
  const name = typeof fields.name === 'string' ? fields.name.trim() : '';
  const description = typeof fields.description === 'string' ? fields.description.trim() : '';
  if (name === '' || description === '') return null;
  return { name, description, body: body.trim() };
}

/**
 * Parse top-level `key: value` entries, recursing only to consume (and for
 * known block shapes, join) indented child lines of the current key.
 * @param {string[]} lines
 * @param {number} indent
 * @returns {Record<string, unknown>}
 */
function parseBlock(lines, indent) {
  const fields = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    const leading = countIndent(line);
    if (leading < indent) break;
    if (leading > indent) { i++; continue; }
    const entry = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.slice(leading));
    if (entry === null) { i++; continue; }
    const key = entry[1];
    const value = entry[2];
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const fold = value.startsWith('>');
      const collected = dedent(collectIndented(lines, i + 1, leading));
      fields[key] = fold ? collected.join(' ') : collected.join('\n');
      i += collected.length + 1;
      continue;
    }
    if (value === '') {
      // Nested block (e.g. `metadata:`) — consume it without interpreting.
      const collected = collectIndented(lines, i + 1, leading);
      fields[key] = { nested: true };
      i += collected.length + 1;
      continue;
    }
    fields[key] = unquote(value);
    i++;
  }
  return fields;
}

/** Lines after `start` that are blank or indented deeper than `parentIndent`. */
function collectIndented(lines, start, parentIndent) {
  const collected = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { collected.push(''); i++; continue; }
    if (countIndent(line) <= parentIndent) break;
    collected.push(line);
    i++;
  }
  while (collected.length > 0 && collected[collected.length - 1] === '') collected.pop();
  return collected;
}

function countIndent(line) {
  const match = /^[ \t]*/.exec(line);
  return match === null ? 0 : match[0].length;
}

/** Strip the common leading whitespace of non-blank lines. */
function dedent(lines) {
  const indents = lines.filter(line => line.trim() !== '').map(countIndent);
  const min = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map(line => (line.trim() === '' ? '' : line.slice(min)));
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

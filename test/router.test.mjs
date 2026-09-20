import assert from 'node:assert/strict';
import { ROUTER_SKILL } from '../src/router-skill.js';
import { Config } from '../src/index.js';

// The router is the plugin's own authored surface; these are tripwires for
// accidental edits that would break routing or handoff.
assert.equal(ROUTER_SKILL.name, 'dsh-ppt-forge');
for (const engine of ['dsh-ppt-forge-pptx', 'dsh-ppt-forge-html', 'dsh-ppt-forge-design', 'dsh-ppt-forge-slides']) {
  assert.ok(ROUTER_SKILL.content.includes(engine), `router must route to ${engine}`);
}
assert.ok(ROUTER_SKILL.content.includes('Phase 1') && ROUTER_SKILL.content.includes('Phase 2') && ROUTER_SKILL.content.includes('Phase 3'));
assert.ok(ROUTER_SKILL.description.length <= 500, 'catalog descriptions truncate around 500 chars');

// Config defaults expose the router alongside the engines.
const filled = Config({});
assert.equal(filled.enableRouter, true);
assert.equal(filled.routerSkillName, 'dsh-ppt-forge');
assert.equal(filled.pptxSkillName, 'dsh-ppt-forge-pptx');
assert.equal(filled.htmlSkillName, 'dsh-ppt-forge-html');
assert.equal(filled.designSkillName, 'dsh-ppt-forge-design');

console.log('router tests passed');

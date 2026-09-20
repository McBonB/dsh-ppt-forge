/**
 * The plugin's own routing skill — the design dialogue.
 *
 * This is the first content authored by dsh-ppt-forge itself (not fetched
 * from any upstream project). It fronts every new presentation request:
 * decide the format route, run a format-agnostic design brief, then hand off
 * to the matching engine skill. Aesthetic tokens are deliberately NOT
 * unified here — each engine resolves design in its own vocabulary, and the
 * brief stays semantic so every engine can consume it natively.
 */

export const ROUTER_SKILL = {
  name: 'dsh-ppt-forge',
  description:
    'Entry point for new presentation requests: decides the format route (editable native PPTX / ' +
    'template compliance / browser HTML deck) and runs a format-agnostic design brief (audience, ' +
    'scenario, tone, density), then hands off to the matching dsh-ppt-forge-* engine skill. ' +
    'Use this FIRST whenever the user asks for any new PPT, deck, slides, or presentation; ' +
    'skip it only for follow-up work on an already-routed deck.',
  content: `# dsh-ppt-forge — presentation router & design brief

You are the entry point for presentation work in this session. Do NOT author
slides yourself. Run the phases below in order, then hand off to exactly one
engine skill.

## Phase 1 — Format decision

Infer what you can from the request; ask only when it changes the route.

1. Will the deck be edited in PowerPoint / WPS / Keynote after delivery?
2. Will it be presented from a browser, shared as a single file, or needs
   web-native animation and navigation?
3. Is there a corporate .pptx template whose look must be preserved?

Route table (engine skill names are exact catalog names):

| Situation | Route to |
|---|---|
| Editable deck, premium or design-led result, pixel-level control wanted | \`dsh-ppt-forge-design\` (design-led PPTX: style atoms, theme lock, acceptance review) |
| Editable deck from scratch, fastest solid result with template workspaces | \`dsh-ppt-forge-pptx\` (native PPTX engine) |
| Existing deck must be edited/filled while staying byte-faithful | \`dsh-ppt-forge-pptx\` round-trip route |
| Corporate template compliance: extract its design DNA, add protected new pages | \`dsh-ppt-forge-design\` VI mode |
| Browser presentation, sharing, web animation — mobile-style horizontal swipe, magazine/Swiss systems | \`dsh-ppt-forge-html\` (HTML deck) |
| Browser presentation — classic 16:9 stage, curated template library, PPTX import or PDF export | \`dsh-ppt-forge-slides\` (presentation HTML skill; fixed 1920x1080 stage) |

Still unsure? Ask exactly one question: "交付后还需要在 PowerPoint 里继续编辑吗?"
(Will you keep editing it in PowerPoint afterwards?) Yes → a PPTX route; No → HTML deck.

## Phase 2 — Design brief (format-agnostic)

Collect once, in conversation, only what is not already known. Write it down
as the working brief before handoff:

- **Audience** — who they are; what they must understand, feel, or decide.
- **Scenario & duration** — occasion plus talk length; page budget follows
  (≈15 min → 10 pages, 30 min → 20, 45 min → 25–30).
- **Tone & domain** — e.g. medical-research rigorous, consumer-brand premium,
  engineering matter-of-fact.
- **Information density** — sparse keynote statement ↔ dense evidence pages.
- **Language, source material, image needs, hard constraints** (brand colors,
  mandated fonts, page-count limits, compliance).

Method reminders while shaping directions: offer 2–3 genuinely different
visual directions (structure and mood, not palette swaps of one idea); one
locked visual system per deck; every page needs one focal point; restraint
over decoration.

## Phase 3 — Handoff

Load the chosen engine skill (the \`skill\` tool with its exact name) and pass
the brief verbatim as working context. The engine's own design stage consumes
it — do not translate the brief into colors, fonts, or layout tokens yourself;
each engine resolves aesthetics in its own vocabulary and may ask the user to
confirm within its own workflow. That confirmation is the engine's to run.

If the user explicitly names an engine or asks for a trivial follow-up on an
already-routed deck, skip this skill and go there directly.
`,
};

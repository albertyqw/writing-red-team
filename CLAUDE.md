# Writing red team

A red-team tool for Albert's medium-length writing: essays, position papers, research proposals, and applications, roughly 1,000 to 6,000 words. It reads, challenges, and draws. It never writes the prose.

This file records the design decisions made so far. Follow them unless Albert changes one; when he does, update this file in the same commit.

## Commands

```
npm install
npm run typecheck
npm test
npm run rt -- new <slug>
npm run rt -- paste <slug> <file>    # .docx, .md or .txt
npm run rt -- run <slug>             # needs ANTHROPIC_API_KEY
```

`npm run` executes from the repo root. Paste resolves the user's file path against `INIT_CWD`, so relative paths work from any folder.

## Principles that shape every change

1. **Never write Albert's prose.** Findings point at a passage and the kind of fix. No replacement sentences, no auto-rewrite, no editor that types for him. The draft pane in the app is read-only. Recursive auto-rewriting sands a voice down to the average, and the tool's own subject is preserving human judgment.
2. **Blind personas.** Each persona reads the brief and draft in its own call and never sees another persona's output. Panels that see each other herd. Do not merge personas into one call to save tokens without asking.
3. **Disputes are surfaced, never resolved.** When personas disagree, the adjudicator files a dispute typed trade-off, ambiguity, or error, with both positions and what each choice costs. Albert rules.
4. **Proposed is not confirmed.** Anything the tool infers about Albert (a belief, a style trait, a persona trait) stays marked proposed until he confirms it. The tool models his stated positions, not his mind.
5. **The harness changes only with approval.** Self-improvement arrives as proposed diffs to files in `harness/`. Nothing edits the profile, beliefs, failure ledger, personas, or principles silently.
6. **Guard against flattery.** Albert's accept/reject rulings are a biased signal. Rejections record why ("the critique is wrong" versus "it's right, I choose otherwise"). Outside feedback that repeats a rejected critique is raised as a dispute.
7. **Keep token cost low.** Personas are capped at 60 words and three findings each and run on the cheaper model. The adjudicator reads reports, not the draft. Caps and models live in `harness/config.json`.

## Architecture

Files only, all in git. No database.

```
articles/<slug>/   brief.md  versions/NNN.md  runs/  log.jsonl
harness/           config.json  profile.md  beliefs.md
                   personas/<mode>/  principles/  checks/  shapes/
src/               types, llm, harness loaders, passes/, run, cli
```

- **One primitive: a pass.** A pass is a prompt plus an output schema, called through `Llm` in `src/types.ts`. Structured output comes from a forced tool call. Personas, the adjudicator, checks, and visuals are all passes. A new feature should usually be a new pass, not new plumbing.
- **Two renderers.** Pass output is either findings tied to passages, or a table. The app should render both generically so new checks need no new screens.
- **Quotes anchor findings.** Every finding carries a verbatim quote. Code, not a model, drops findings whose quote is not in the draft (`isAnchored`). Anchoring by quoted text lets issues follow a passage across versions.
- **Tests use a fake `Llm`.** Keep the engine testable without API calls.

## The brief

Required before any run: a `mode:` line (essay, research, application), a filled `## Goal`, and a filled `## Constraints`. Template text in brackets counts as unfilled. Optional `principles:` line. Every pass reads the brief, and findings are judged against the goal.

## Levels

- **Level 1 (built):** whole piece only. Thesis, structure, evidence, strongest objection. No wording or grammar. Each persona restates the thesis; a mismatch with the goal is itself a finding.
- **Level 2 (not built):** sections and prose. Unlocks when level 1 has no open blocker or major. Albert can override. Line edits on a paragraph he will cut are waste.

## Personas

- Four per mode in `harness/personas/<mode>/`, plus a principles editor added to every run.
- Essay: opponent, expert, outsider, skimmer. Research: methods, prior author, null sceptic, replicator. Application: screener, committee expert, sceptic, champion.
- **Principles editor:** `harness/principles/` holds one file per writing context (base, persuasive, scientific, journalistic, creative). `base` always applies. Each file has `## Whole piece` (level 1) and `## Prose` (level 2) lists. The brief's `principles:` line picks sets; otherwise essays and applications use persuasive and research uses scientific. New context = new file.
- The seeded persona and principle text are starting points, not Albert's. He will rewrite them.

## Stop rules (for rounds, not built yet)

- Application: no persona holds a blocker or major doubt.
- Essay: every persona restates the thesis as intended and no clarity or soundness blocker remains. Disagreement with the thesis itself stays standing.
- Research: every persona states the same hypothesis, measurement, and disconfirming result.
- Also stop when fixes start reversing each other, or after round three. Each round uses a fresh blind panel on the new snapshot only.

## Ledgers

- `harness/beliefs.md`: claims with confidence, source, date, status. Seeded with seven proposed beliefs and three open tensions from three drafts. Contradiction checks: draft against ledger, draft against itself, belief against belief across pieces. Albert rules: update the belief, fix the draft, or mark the tension deliberate. Superseded entries stay.
- `harness/checks/failure-ledger.md`: recurring problems. **Failure modes climb a ladder:** recurring issue, then checklist line, then a dedicated check file, then a standing panel. The first planned check is definition consistency: a table of each key term, every definition, and where they drift.
- `harness/profile.md`: style to keep. The adjudicator drops findings that only fight it and reports how many.

## Build order

1. Engine, brief, level 1 panel, principles editor. **Done.** Not yet run against the real API.
2. Round screen with pasted snapshots and rulings (accept, reject with reason, defer; dispute rulings). Rulings append to `log.jsonl`.
3. Level 2 and the definitions check.
4. Persona builder and Notion links.
5. Visuals with prompts and the shape files.
6. Circling detection.

Immediate next step: run level 1 on the dark matter essay with a real key, read the report with Albert, and tune the prompts before building step 2.

## Planned features, decided but not built

- **App shell:** Electron on macOS, TypeScript throughout. Screens: Piece (brief, versions), Round (draft read-only beside issues, disputes, belief flags), Ledgers (beliefs, failure modes, personas, style), Visuals, Retro. Round two stays locked until every blocker and major is ruled. Mockups exist in a design canvas from the planning chat.
- **Input:** Albert keeps his own editor and pastes snapshots. Circling detection therefore sees only changes between pastes.
- **Circling detection:** flag a passage that returns to an earlier wording, one rewritten repeatedly while its issue stays open, and two critiques pulling a passage back and forth. Then stop critiquing it and ask what trade-off is undecided; his answer becomes a brief constraint.
- **Persona builder:** given a name, research the person's published professional work and write a short persona file with each trait cited and marked sourced or inferred. Published professional views only, no personal details. Albert reviews before use. Label output as simulated; score it against real feedback from that person. Keep personas short.
- **Notion notes:** links in the brief; snapshot each page into the article folder; passes read notes as context; a check compares draft and notes. Notes never become source text for prose.
- **External feedback:** map reviewer comments and reader responses to logged findings; record whether a persona predicted each. Update on comments and repeated patterns, not on a single accept or reject.
- **Visuals:** drawn from an argument map (claims and links), not from prose. If closing a diagram needs a link the text never states, that gap becomes a finding. Albert can prompt visuals. Rulings: keep, wrong idea, right idea wrong form. Output is editable SVG.
- **Shape ontology:** `harness/shapes/` holds one file per reusable structure: name, the kind of claim it expresses, slots, and when not to use it. Seeds: loop, trade-off, flow, tree, layers, before-and-after, spectrum. A kept visual that fits no shape prompts a proposal for a new one.
- **Later:** a retro that proposes harness diffs from the log; a regression test on past drafts with known outcomes; a second model for some personas to reduce correlated blind spots.

## Writing style for this repo

Albert's preferences apply to prompts, docs, and messages: Orwell's six rules, active voice, no filler, no marketing language, simple punctuation, concise.

## Git

Commit to `main` unless asked otherwise. Run `npm run typecheck && npm test` before committing.

# Build plan

A handoff plan for building the desktop app on top of the existing engine. Read `CLAUDE.md` first; its principles bind every milestone here.

## State at handoff

- **Built:** the engine in `src/` (brief, blind level 1 panel, principles editor, adjudicator), a command line, and six passing tests against a fake model.
- **Never run:** no real API call has been made. The prompts and the model names in `harness/config.json` are unverified.
- **Not built:** any window. Albert expects a desktop app, so the order below puts a visible app first.

## How to work

1. **One milestone at a time, in order.** Each ends with a demo Albert can click through. Stop there and show him. Do not start the next milestone unasked.
2. **Ask at the marked points.** Each milestone lists questions for Albert. Ask before building the part they affect.
3. **The engine stays UI-free.** Everything in `src/` outside `src/app/` must run from the command line and under test with a fake `Llm`. The app calls the engine; it never contains pass logic.
4. **Tests gate commits.** Run `npm run typecheck && npm test`. Every new pass and every log event gets a test.
5. **Verify the stack.** Check current Electron and build-tool docs before scaffolding; do not trust remembered versions or config shapes.
6. **Small commits to `main`**, one per working step. Update `CLAUDE.md` when a decision changes.

## Stack

- Electron, macOS only. TypeScript everywhere.
- Renderer: React with Vite. Use an Electron-Vite scaffold if a maintained one exists; otherwise wire Vite by hand.
- Main process owns the file system, the engine, and the API key. The renderer gets a narrow, typed API through a preload script. Context isolation on, Node integration off.
- No database, no state library, no component library. React state plus the files on disk.
- Styling: plain CSS with the tokens below.

### Layout

```
src/            engine (exists)
src/app/main/   Electron main: window, IPC handlers, key storage
src/app/preload/ typed bridge
src/app/ui/     React renderer
fixtures/       a saved run result and a sample article, for UI work without API calls
```

### IPC surface (grow it only as milestones need)

```
articles.list() / articles.get(slug) / articles.create(slug)
brief.read(slug) / brief.write(slug, text)
snapshots.list(slug) / snapshots.read(slug, name) / snapshots.add(slug, {text} | {filePath})
runs.list(slug) / runs.read(slug, id) / runs.start(slug, level)   -> progress events
log.read(slug) / log.append(slug, event)
harness.read(path) / harness.write(path, text)
settings.getKeyStatus() / settings.setKey(key)
```

## Shared data decisions

- **Finding id:** `sha1(normalised quote).slice(0, 8)`. The same passage keeps its id across rounds, which is what lets rulings and regressions follow it. Add `id` to `MergedFinding` in milestone A.
- **`log.jsonl`** is append-only, one event per line, each with `event`, `at`, and `version`. Events: `snapshot`, `run`, `ruling`, `dispute_ruling`, `override`, then later `belief_ruling`, `visual_ruling`, `external_feedback`, `harness_change`.
- **Ruling:** `{event:"ruling", findingId, title, severity, personas, decision:"accept"|"reject"|"defer", reason?:"wrong"|"choose-otherwise", note?}`. A reject requires a reason.
- **Current state is derived** by replaying the log. Never store state the log can rebuild.

## Design tokens (from the mockups)

- Ground `#F5F6F7`, panel `#FFFFFF`, line `#DADDE2`, ink `#16181D`, muted text `#5A6170`
- Accent blue `#1F4FBF` (primary buttons, links), pale blue `#E9EEF9`
- Major: text `#7A3A05` on `#FDEBD8`, rule `#B4540A`. Blocker: white on ink. Minor: grey outline.
- UI in Inter or the system font, 14px. Draft text in a serif (Source Serif 4 or Georgia), 17px, line height 1.65, column about 620px.
- Severity never relies on colour alone: always a text label.

---

## Milestone A: a window with the Round screen, on fixtures

**Goal:** Albert opens the app and sees a real-looking round without an API key.

- Scaffold Electron, the preload bridge, and the renderer. `npm run app` opens the window.
- Add `fixtures/`: one article (use a short invented essay, not Albert's drafts) and one saved `RunResult`.
- **Round screen**, three regions:
  - Left rail (220px): app name; nav for Pieces, Ledgers, Retro (last two disabled); list of articles with mode and round.
  - Header: title, "mode, version, round n of 3", convergence line ("Not clear: 1 blocker, 2 majors open, 1 of 5 ruled"), and a disabled "Start next round" button. Under it, a one-line brief strip (audience, goal, constraints) with "Edit brief".
  - Body, two columns: the draft, read-only, with each finding's quote highlighted and numbered; and a right pane (about 420px) with, in order: "Thesis as read" (n of m matched, mismatches listed), Findings as cards, Disputes as cards, then counts for style drops and unanchored drops.
- Finding card: number, severity tag, personas, title, problem, direction. Clicking a card scrolls the draft to its highlight, and the reverse.
- Highlighting uses the same normalisation as `isAnchored`. A finding with no match in the shown version renders in a "no longer in draft" group.

**Accept when:** the window opens from a clean clone with one command; the fixture round renders; highlights and cards link both ways; no API key is needed.

**Ask Albert:** nothing. Show him the window.

## Milestone B: real runs from the app

**Goal:** create an article, write a brief, paste a draft, run level 1, all in the app.

- **Key:** a settings sheet stores the API key with Electron's safe storage; fall back to `ANTHROPIC_API_KEY`. Never write the key to the repo or the log.
- **Pieces screen:** list and create articles.
- **Brief editor:** plain text area over `brief.md`, with the same validation as `parseBrief` shown inline. "Run" stays disabled until the brief is valid.
- **Snapshots:** "New snapshot" accepts pasted text or a dropped .docx, .md, or .txt (reuse `saveSnapshot`). Show the version list; any version can be viewed.
- **Run:** a button starts level 1 in the main process and streams the existing progress lines to the UI. Errors show the failing reader by name.
- **First real call happens here.** Verify the model ids in `harness/config.json` against current docs, run once on the fixture, and fix whatever the real API rejects.
- Show token counts per run.

**Accept when:** Albert runs level 1 on his dark matter essay from the app and reads the result on the Round screen.

**Ask Albert:** after that first run, read the report together. Which findings would he act on? Tune persona and adjudicator prompts from his answers before milestone C. This is the check that the critique is worth building around.

## Milestone C: rulings and rounds

**Goal:** the red-team loop works end to end.

- **Rulings:** Accept, Reject, Defer on each finding. Reject opens the two reasons. Dispute cards get one button per position. Every ruling appends to the log; the UI state is the replayed log.
- **Lock:** "Start next round" enables when every blocker and major is ruled and a newer snapshot exists.
- **Rounds:** a new round runs a fresh blind panel on the newest snapshot only. Personas never see earlier findings.
- **Regression pass (code first, model only if needed):** compare the new round with the log by finding id and report: fixed (accepted, now gone), returned (accepted, still present), reversed (a new finding asks to undo an accepted fix).
- **Stop rules** from `CLAUDE.md`, per mode, shown as a plain status: converged, reversing, or round three done. Record whether round two found anything above minor that round one missed.
- **History view:** rounds for a piece with their findings and rulings.

**Accept when:** Albert takes one piece through two rounds and the app correctly reports what was fixed and what returned.

**Ask Albert:** should deferred findings block the next round? Default: no.

## Milestone D: level 2, checks, and the table renderer

- **Gate:** level 2 unlocks when level 1 has no open blocker or major. An "Override" button logs an `override` event.
- **Level 2 pass:** one close reader plus the principles editor using the `## Prose` lists. Findings anchor to quotes and group by section.
- **Pre-flight:** one pass checks the draft against `failure-ledger.md` and runs before the panel.
- **Check files:** a check is a file in `harness/checks/` holding a prompt and an output type, `findings` or `table`. Build the generic table renderer now.
- **First check, definitions:** a table of each key term, each definition or use with its quote, and a drift flag. Clicking a row jumps to the passage.

**Accept when:** adding a new check file makes it appear in the app with no UI code change.

**Ask Albert:** which failure-ledger lines to promote to checks first, beyond definitions.

## Milestone E: Ledgers

- **Screen with tabs:** Beliefs, Failure modes, Personas, Principles, Style. Each edits its harness file.
- **Beliefs:** parse `beliefs.md` into entries with status. Proposed entries get a dashed border and Confirm, Reword, Not mine. Superseded entries stay visible in history.
- **Belief pass:** draft against ledger, draft against itself, and new positions as proposed entries. Flags appear on the Round screen.
- **Tensions:** side-by-side quotes with three rulings: update a belief, fix a draft, deliberate.
- Every harness edit from the app writes a `harness_change` event and a git commit.

**Ask Albert:** rule on the seven seeded beliefs and three tensions; that is the first real use of the screen.

## Milestone F: persona builder and Notion

- **Persona builder:** a name goes to a research pass with web search. Output: a persona file within the word cap, each trait cited and marked sourced or inferred, plus a sources list. Albert reviews and approves before the file lands in `harness/personas/people/`. Published professional work only; no personal details. Label its findings "simulated". If little public writing exists, say so and ask Albert for material.
- A brief can add named personas to a run with a `personas:` line.
- **Notion:** a token in settings; links in the brief's `## Notes`; fetch each page to `articles/<slug>/notes/` with a date; passes receive notes as context; a check compares draft and notes.

**Ask Albert:** cap on searches per persona build, to bound cost. Check current docs for the web search tool and the Notion API before building.

## Milestone G: visuals

- **Argument map pass:** claims and typed links, saved as `map.json`, each link marked stated or unstated. An unstated link needed to close a structure becomes a finding.
- **Shapes:** seed `harness/shapes/` with loop, trade-off, flow, tree, layers, before-and-after, spectrum. Each file: the claim type it expresses, its slots, when not to use it, and layout rules.
- **Visual pass:** pick shapes for the map, fill slots, and render SVG from code with a small layout function per shape. No image generation.
- **Visuals screen:** candidates with "It claims" lines; a prompt box; rulings keep, wrong idea, right idea wrong form; SVG export.
- A kept visual that fits no shape proposes a new shape file for approval.

**Ask Albert:** at most how many candidates per piece. Default: two.

## Milestone H: circling detection

- Compare snapshots by paragraph with fuzzy matching. Flag: a passage returning to an earlier wording; one rewritten three or more times while its finding stays open; alternating fixes driven by two findings.
- On a flag, suppress further findings on that passage and ask what trade-off is undecided. The answer appends to the brief's constraints.
- Pure code first. Use a model only to phrase the question.

## Milestone I: feedback and retro

- **External feedback:** paste reviewer comments or reader responses; a pass maps each to logged findings and records hit or miss per persona. Feedback that repeats a rejected finding is raised as a dispute.
- **Retro:** reads the logs and proposes diffs to harness files: ledger promotions, persona rewrites or retirements, shape and principle changes. Each diff is approved or dismissed; approved diffs commit.
- **Regression set:** saved past drafts with known outcomes; a command reruns them after prompt changes and reports differences.

---

## Out of scope until Albert asks

An in-app prose editor, any rewriting of his text, Windows or Linux builds, auto-update, signing and notarising, accounts, sync, a database.

## Known risks

- **Critique quality is unproven.** Milestone B's review with Albert decides whether the loop is worth the later milestones. Do not skip it.
- **Correlated personas.** One model behind every reader shares blind spots. Outside feedback in milestone I is the real check.
- **Cost drift.** Each new pass adds calls. Show tokens per run and keep the caps in config.
- **Anchoring.** Models paraphrase quotes. Watch the unanchored count in real runs; if it is high, tighten the prompt before loosening the match.

# Writing red team

A red-team tool for medium-length writing. It reads, challenges, and draws. It never writes the prose.

Status: step 1 of 6. The engine runs a level 1 pass from the command line. There is no app window yet.

## Use

```
npm install
export ANTHROPIC_API_KEY=...
npm run rt -- new my-essay           # then fill in articles/my-essay/brief.md
npm run rt -- paste my-essay draft.md
npm run rt -- run my-essay
```

A run writes the full result to `articles/<slug>/runs/` and appends one line to `log.jsonl`.

## Layout

```
articles/<slug>/   brief.md  versions/  runs/  log.jsonl
harness/           config.json  profile.md  beliefs.md  personas/  principles/  checks/  shapes/
src/               one primitive: a pass is a prompt plus an output schema
```

## Level 1

1. Each persona for the brief's mode reads the brief and the draft in its own call, blind to the others. A principles editor joins them and checks the draft against your writing principles.
2. Code drops any finding whose quote is not in the draft.
3. One adjudicator call merges findings, files disagreements as disputes, and drops style-only complaints.

## Principles

`harness/principles/` holds one file per writing context: base, persuasive, scientific, journalistic, creative. `base` always applies. Pick others in the brief:

```
principles: persuasive, scientific
```

With no line, essays and applications use `persuasive` and research uses `scientific`. Each file has a `## Whole piece` list for level 1 and a `## Prose` list for level 2. Add a context by adding a file.

## Cost controls

- Personas are capped at 60 words and three findings each, and run on the cheaper model.
- The adjudicator reads the reports, not the draft.
- Models and caps live in `harness/config.json`.

## Build order

1. Engine, brief, and level 1 panel (done)
2. Round screen with pasted snapshots and rulings
3. Level 2 and the definitions check
4. Persona builder and Notion links
5. Visuals with prompts and the shape files
6. Circling detection

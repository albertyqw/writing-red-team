import { Adjudication, type Brief, type Config, type Llm, type PersonaReport, type Usage } from "../types.js";

const SYSTEM = `You adjudicate a red-team panel's reports on a draft. You do not see the draft; you work from the brief and the reports.

Do four things:
1. Thesis: for each reader, say whether their restatement matches the goal in the brief. Note any mismatch in a few words.
2. Findings: merge findings that describe the same problem. Keep each finding's quote exactly as one reader gave it. List every reader who raised it. Rank blockers first, then by how many readers raised it. Keep at most the limit given.
3. Disputes: when readers disagree about a passage or a choice, never pick a side. File a dispute with a type: "trade-off" (readers want different things), "ambiguity" (they read the same passage differently), or "error" (one reader misread). State what each choice costs.
4. Style: drop findings that only fight the author's style profile, and count them.

Never invent a finding no reader raised. Never write replacement prose.`;

function schema(maxFindings: number): Record<string, unknown> {
  return {
    properties: {
      thesis: {
        type: "array",
        items: {
          type: "object",
          properties: { persona: { type: "string" }, matches: { type: "boolean" }, note: { type: "string" } },
          required: ["persona", "matches", "note"],
        },
      },
      findings: {
        type: "array",
        maxItems: maxFindings,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Under ten words." },
            quote: { type: "string" },
            problem: { type: "string" },
            severity: { type: "string", enum: ["blocker", "major", "minor"] },
            direction: { type: "string" },
            personas: { type: "array", items: { type: "string" } },
          },
          required: ["title", "quote", "problem", "severity", "direction", "personas"],
        },
      },
      disputes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["trade-off", "ambiguity", "error"] },
            passage: { type: "string" },
            positions: {
              type: "array",
              items: {
                type: "object",
                properties: { persona: { type: "string" }, position: { type: "string" } },
                required: ["persona", "position"],
              },
            },
            cost: { type: "string" },
          },
          required: ["type", "passage", "positions", "cost"],
        },
      },
      droppedForStyle: { type: "integer", minimum: 0 },
    },
    required: ["thesis", "findings", "disputes", "droppedForStyle"],
  };
}

export async function adjudicate(
  llm: Llm,
  cfg: Config,
  brief: Brief,
  profile: string,
  reports: { id: string; report: PersonaReport }[],
): Promise<{ adjudication: Adjudication; usage: Usage }> {
  const { data, usage } = await llm({
    model: cfg.models.adjudicator,
    system: SYSTEM,
    user: [
      `<brief>\n${brief.text}\n</brief>`,
      `<style_profile>\n${profile}\n</style_profile>`,
      `<reports>\n${JSON.stringify(reports, null, 1)}\n</reports>`,
      `Limit: ${cfg.maxFindings} findings.`,
    ].join("\n\n"),
    toolName: "adjudicate",
    toolDescription: "File the adjudicated level 1 result.",
    jsonSchema: schema(cfg.maxFindings),
    maxTokens: 1800,
  });
  const parsed = Adjudication.parse(data);
  const order = { blocker: 0, major: 1, minor: 2 } as const;
  parsed.findings = parsed.findings
    .slice(0, cfg.maxFindings)
    .sort((a, b) => order[a.severity] - order[b.severity] || b.personas.length - a.personas.length);
  return { adjudication: parsed, usage };
}

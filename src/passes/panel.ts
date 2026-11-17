import { PersonaReport, type Brief, type Config, type Finding, type Llm, type Persona, type Usage } from "../types.js";

const SYSTEM = `You are one reader on a red-team panel for a draft. You read alone; you never see other readers' notes.

Level 1 only: judge the whole piece against the author's goal and constraints. Look at the thesis, the structure, the evidence, and the strongest objection. Ignore wording, grammar, and style.

Rules:
- Restate the piece's main claim in one sentence, as you understood it. Do not copy the brief.
- Report only problems that would change this reader's verdict. Zero findings is a valid answer.
- Each finding quotes a short passage from the draft, word for word, 4 to 20 words.
- "direction" points at the kind of fix. Never write replacement prose.
- Be blunt. No praise.`;

export function personaSchema(maxFindings: number): Record<string, unknown> {
  return {
    properties: {
      restatement: { type: "string", description: "One sentence: the main claim as this reader understood it." },
      findings: {
        type: "array",
        maxItems: maxFindings,
        items: {
          type: "object",
          properties: {
            quote: { type: "string", description: "Verbatim passage from the draft, 4 to 20 words." },
            problem: { type: "string", description: "One or two sentences." },
            severity: { type: "string", enum: ["blocker", "major", "minor"] },
            direction: { type: "string", description: "The kind of fix, in one sentence. No replacement prose." },
          },
          required: ["quote", "problem", "severity", "direction"],
        },
      },
    },
    required: ["restatement", "findings"],
  };
}

const squash = (s: string) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** A finding counts only if its quote appears in the draft. Checked in code, not by a model. */
export function isAnchored(draft: string, quote: string): boolean {
  const q = squash(quote).replace(/^["'….]+|["'….]+$/g, "");
  return q.length >= 12 && squash(draft).includes(q);
}

export async function runPersona(
  llm: Llm,
  cfg: Config,
  persona: Persona,
  brief: Brief,
  draft: string,
): Promise<{ id: string; report: PersonaReport; unanchored: Finding[]; usage: Usage }> {
  const { data, usage } = await llm({
    model: cfg.models.persona,
    system: `${SYSTEM}\n\nWho you are:\n${persona.text}`,
    user: `<brief>\n${brief.text}\n</brief>\n\n<draft>\n${draft}\n</draft>`,
    toolName: "report",
    toolDescription: "File this reader's level 1 report.",
    jsonSchema: personaSchema(cfg.maxFindingsPerPersona),
    maxTokens: 900,
  });
  const parsed = PersonaReport.parse(data);
  const findings = parsed.findings.slice(0, cfg.maxFindingsPerPersona);
  return {
    id: persona.id,
    report: { restatement: parsed.restatement, findings: findings.filter((f) => isAnchored(draft, f.quote)) },
    unanchored: findings.filter((f) => !isAnchored(draft, f.quote)),
    usage,
  };
}

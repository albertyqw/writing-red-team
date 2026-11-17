import { z } from "zod";

export const Severity = z.enum(["blocker", "major", "minor"]);
export type Severity = z.infer<typeof Severity>;

/** One problem a persona found, tied to a passage by a short verbatim quote. */
export const Finding = z.object({
  quote: z.string(),
  problem: z.string(),
  severity: Severity,
  direction: z.string(),
});
export type Finding = z.infer<typeof Finding>;

export const PersonaReport = z.object({
  restatement: z.string(),
  findings: z.array(Finding),
});
export type PersonaReport = z.infer<typeof PersonaReport>;

export const MergedFinding = Finding.extend({
  title: z.string(),
  personas: z.array(z.string()),
});
export type MergedFinding = z.infer<typeof MergedFinding>;

export const Dispute = z.object({
  type: z.enum(["trade-off", "ambiguity", "error"]),
  passage: z.string(),
  positions: z.array(z.object({ persona: z.string(), position: z.string() })),
  cost: z.string(),
});
export type Dispute = z.infer<typeof Dispute>;

export const Adjudication = z.object({
  thesis: z.array(
    z.object({ persona: z.string(), matches: z.boolean(), note: z.string() }),
  ),
  findings: z.array(MergedFinding),
  disputes: z.array(Dispute),
  droppedForStyle: z.number().int().nonnegative(),
});
export type Adjudication = z.infer<typeof Adjudication>;

export interface Persona {
  id: string;
  text: string;
}

export interface Config {
  models: { persona: string; adjudicator: string };
  maxFindingsPerPersona: number;
  maxFindings: number;
  maxPersonaWords: number;
}

export interface Brief {
  mode: "essay" | "research" | "application";
  text: string;
}

export interface Usage {
  input: number;
  output: number;
}

export interface RunResult {
  article: string;
  version: string;
  level: 1;
  at: string;
  personas: { id: string; report: PersonaReport; unanchored: Finding[] }[];
  adjudication: Adjudication;
  usage: Usage;
}

/** The one primitive: a prompt plus an output schema, returning validated data. */
export interface StructuredCall {
  model: string;
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
}

export type Llm = (call: StructuredCall) => Promise<{ data: unknown; usage: Usage }>;

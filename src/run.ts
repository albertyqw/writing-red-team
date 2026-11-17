import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { latestVersion, loadConfig, loadPersonas, loadText, parseBrief } from "./harness.js";
import { adjudicate } from "./passes/adjudicate.js";
import { runPersona } from "./passes/panel.js";
import type { Llm, RunResult } from "./types.js";

/** Level 1: blind persona panel on the whole piece, then one adjudication. */
export async function runLevel1(llm: Llm, articleDir: string, harnessDir: string): Promise<RunResult> {
  const cfg = await loadConfig(harnessDir);
  const brief = parseBrief(await loadText(path.join(articleDir, "brief.md")));
  const version = await latestVersion(articleDir);
  const personas = await loadPersonas(harnessDir, brief.mode, cfg.maxPersonaWords);
  const profile = await loadText(path.join(harnessDir, "profile.md"));

  // Separate calls keep the readers blind to each other.
  const reports = await Promise.all(personas.map((p) => runPersona(llm, cfg, p, brief, version.text)));
  const { adjudication, usage } = await adjudicate(
    llm,
    cfg,
    brief,
    profile,
    reports.map(({ id, report }) => ({ id, report })),
  );

  const result: RunResult = {
    article: path.basename(articleDir),
    version: version.name,
    level: 1,
    at: new Date().toISOString(),
    personas: reports.map(({ id, report, unanchored }) => ({ id, report, unanchored })),
    adjudication,
    usage: {
      input: usage.input + reports.reduce((n, r) => n + r.usage.input, 0),
      output: usage.output + reports.reduce((n, r) => n + r.usage.output, 0),
    },
  };

  const runsDir = path.join(articleDir, "runs");
  await mkdir(runsDir, { recursive: true });
  await writeFile(path.join(runsDir, `${result.at.replace(/[:.]/g, "-")}.json`), JSON.stringify(result, null, 2));
  await appendFile(
    path.join(articleDir, "log.jsonl"),
    JSON.stringify({
      event: "run",
      at: result.at,
      level: 1,
      version: result.version,
      findings: adjudication.findings.map((f) => ({ title: f.title, severity: f.severity, personas: f.personas })),
      disputes: adjudication.disputes.length,
      usage: result.usage,
    }) + "\n",
  );
  return result;
}

export function renderReport(r: RunResult): string {
  const a = r.adjudication;
  const open = a.findings.filter((f) => f.severity !== "minor").length;
  const matched = a.thesis.filter((t) => t.matches).length;
  const out: string[] = [
    `# ${r.article} · ${r.version} · level 1`,
    "",
    open === 0 ? "Level 1 clear: no blocker or major. Level 2 can start." : `Not clear: ${open} blocker or major finding(s) open.`,
    "",
    `## Thesis as read: ${matched} of ${a.thesis.length} matched`,
    ...a.thesis.filter((t) => !t.matches).map((t) => `- ${t.persona}: ${t.note}`),
    "",
    `## Findings (${a.findings.length})`,
  ];
  a.findings.forEach((f, i) => {
    out.push(
      `${i + 1}. [${f.severity}] ${f.title} (${f.personas.join(", ")})`,
      `   > ${f.quote}`,
      `   ${f.problem}`,
      `   Direction: ${f.direction}`,
    );
  });
  if (a.disputes.length) {
    out.push("", `## Disputes (${a.disputes.length})`);
    for (const d of a.disputes) {
      out.push(`- [${d.type}] ${d.passage}`, ...d.positions.map((p) => `  - ${p.persona}: ${p.position}`), `  Cost: ${d.cost}`);
    }
  }
  const unanchored = r.personas.reduce((n, p) => n + p.unanchored.length, 0);
  out.push(
    "",
    `Dropped for style: ${a.droppedForStyle}. Dropped for a quote not found in the draft: ${unanchored}.`,
    `Tokens: ${r.usage.input} in, ${r.usage.output} out.`,
  );
  return out.join("\n");
}

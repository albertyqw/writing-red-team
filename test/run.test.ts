import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadPrinciplesPersona, parseBrief } from "../src/harness.js";
import { isAnchored } from "../src/passes/panel.js";
import { renderReport, runLevel1 } from "../src/run.js";
import type { Llm, StructuredCall } from "../src/types.js";

const DRAFT = `Science is a story of discoveries. I believe that now is the time to build marketplaces for negative data. Organizations may also refuse to expose data they pay for.`;
const BRIEF = `mode: essay\n\n## Goal\nReader believes the marketplace is buildable now.\n\n## Constraints\nUnder 1,500 words.\n`;

async function fixture(brief = BRIEF): Promise<{ article: string; harness: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "rt-"));
  const harness = path.join(dir, "harness");
  await cp(path.resolve("harness"), harness, { recursive: true });
  const article = path.join(dir, "articles", "demo");
  await mkdir(path.join(article, "versions"), { recursive: true });
  await writeFile(path.join(article, "brief.md"), brief);
  await writeFile(path.join(article, "versions", "001.md"), "old draft");
  await writeFile(path.join(article, "versions", "002.md"), DRAFT);
  return { article, harness };
}

function fakeLlm(calls: StructuredCall[]): Llm {
  return async (call) => {
    calls.push(call);
    if (call.toolName === "report") {
      return {
        usage: { input: 100, output: 20 },
        data: {
          restatement: "Build marketplaces for negative data now.",
          findings: [
            { quote: "now is the time to build marketplaces", problem: "Claim arrives late.", severity: "major", direction: "Move it up." },
            { quote: "a sentence that is not in the draft at all", problem: "Invented.", severity: "blocker", direction: "None." },
          ],
        },
      };
    }
    return {
      usage: { input: 300, output: 60 },
      data: {
        thesis: [{ persona: "skimmer", matches: false, note: "Read it as a history of science." }],
        findings: [
          { title: "Minor thing", quote: "Science is a story", problem: "p", severity: "minor", direction: "d", personas: ["expert"] },
          { title: "Objection unanswered", quote: "refuse to expose data", problem: "p", severity: "blocker", direction: "d", personas: ["opponent"] },
        ],
        disputes: [],
        droppedForStyle: 1,
      },
    };
  };
}

test("level 1 runs one blind call per persona, then one adjudication", async () => {
  const { article, harness } = await fixture();
  const calls: StructuredCall[] = [];
  const result = await runLevel1(fakeLlm(calls), article, harness);

  const personaCalls = calls.filter((c) => c.toolName === "report");
  assert.equal(personaCalls.length, 5, "four mode personas plus the principles editor");
  const editor = personaCalls.find((c) => c.system.includes("writing principles"))!;
  assert.match(editor.system, /persuasive:/);
  assert.match(editor.system, /The claim or ask comes first/);
  assert.doesNotMatch(editor.system, /Orwell/, "level 1 skips the prose lists");
  assert.equal(calls.filter((c) => c.toolName === "adjudicate").length, 1);
  for (const c of personaCalls) {
    assert.ok(c.user.includes(DRAFT), "persona reads the latest snapshot");
    assert.ok(!c.user.includes("old draft"));
    assert.ok(!c.user.includes("restatement"), "persona never sees another report");
  }
  const adj = calls.find((c) => c.toolName === "adjudicate")!;
  assert.ok(!adj.user.includes(DRAFT), "adjudicator does not re-read the draft");
  assert.ok(!adj.user.includes("not in the draft at all"), "unanchored findings never reach the adjudicator");

  assert.equal(result.version, "002.md");
  assert.equal(result.personas[0]!.report.findings.length, 1);
  assert.equal(result.personas[0]!.unanchored.length, 1);
  assert.equal(result.adjudication.findings[0]!.severity, "blocker", "blockers sort first");
  assert.deepEqual(result.usage, { input: 800, output: 160 });

  assert.equal((await readdir(path.join(article, "runs"))).length, 1);
  const log = (await readFile(path.join(article, "log.jsonl"), "utf8")).trim().split("\n");
  assert.equal(JSON.parse(log[0]!).event, "run");

  const report = renderReport(result);
  assert.match(report, /Not clear: 1 blocker or major/);
  assert.match(report, /0 of 1 matched/);
});

test("a brief without a goal or with template text is refused", () => {
  assert.throws(() => parseBrief("mode: essay\n\n## Constraints\nx\n"), /Goal/);
  assert.throws(() => parseBrief("mode: essay\n\n## Goal\n[What the reader should do]\n\n## Constraints\nx\n"), /Goal/);
  assert.throws(() => parseBrief("## Goal\nx\n\n## Constraints\ny\n"), /mode/);
  assert.equal(parseBrief(BRIEF).mode, "essay");
});

test("quotes anchor across case, whitespace and curly quotes", () => {
  assert.ok(isAnchored("The platform’s host looks  elsewhere.", "the platform's host looks elsewhere"));
  assert.ok(!isAnchored(DRAFT, "markets always clear"));
  assert.ok(!isAnchored(DRAFT, "Science"), "too short to anchor");
});

test("principles come from the brief, or from the mode by default", async () => {
  assert.deepEqual(parseBrief(BRIEF).principles, ["persuasive"]);
  assert.deepEqual(parseBrief(BRIEF.replace("mode: essay", "mode: research")).principles, ["scientific"]);
  assert.deepEqual(parseBrief(BRIEF.replace("mode: essay", "mode: essay\nprinciples: Scientific, journalistic")).principles, ["scientific", "journalistic"]);

  const p = await loadPrinciplesPersona(path.resolve("harness"), ["creative"]);
  assert.match(p.text, /base:/);
  assert.match(p.text, /creative:/);
  await assert.rejects(loadPrinciplesPersona(path.resolve("harness"), ["poetic"]), /Unknown principles: poetic. Available:/);
});

test("paste resolves paths from where the user typed, and reads .docx", async () => {
  const { resolveUserPath, saveSnapshot } = await import("../src/snapshot.js");
  assert.equal(resolveUserPath("draft.md", "/Users/a/Documents"), "/Users/a/Documents/draft.md");
  assert.equal(resolveUserPath("/tmp/x.md", "/Users/a"), "/tmp/x.md");

  const dir = await mkdtemp(path.join(os.tmpdir(), "rt-paste-"));
  await assert.rejects(saveSnapshot(dir, path.join(dir, "missing.md")), /No file at/);
  await writeFile(path.join(dir, "d.txt"), "first");
  assert.equal(await saveSnapshot(dir, path.join(dir, "d.txt")), "001.md");
  assert.equal(await saveSnapshot(dir, path.join(dir, "d.txt")), "002.md");
  await writeFile(path.join(dir, "d.pdf"), "x");
  await assert.rejects(saveSnapshot(dir, path.join(dir, "d.pdf")), /Use .docx/);
});

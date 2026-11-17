import { cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anthropicLlm } from "./llm.js";
import { renderReport, runLevel1 } from "./run.js";
import { resolveUserPath, saveSnapshot } from "./snapshot.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harnessDir = path.join(root, "harness");
const articleDir = (slug: string) => path.join(root, "articles", slug);

const USAGE = `Usage:
  rt new <slug>            create articles/<slug> with a brief to fill in
  rt paste <slug> <file>   save a .docx, .md or .txt file as the next snapshot
  rt run <slug>            run level 1 on the latest snapshot`;

async function main(): Promise<void> {
  const [cmd, slug, file] = process.argv.slice(2);
  if (!cmd || !slug) throw new Error(USAGE);

  if (cmd === "new") {
    await cp(path.join(root, "articles", "_template"), articleDir(slug), { recursive: true, errorOnExist: true, force: false });
    console.log(`Created articles/${slug}. Fill in brief.md, then paste a draft.`);
  } else if (cmd === "paste") {
    if (!file) throw new Error(USAGE);
    const name = await saveSnapshot(articleDir(slug), resolveUserPath(file));
    console.log(`Saved snapshot ${name}.`);
  } else if (cmd === "run") {
    const result = await runLevel1(anthropicLlm(), articleDir(slug), harnessDir);
    console.log(renderReport(result));
  } else {
    throw new Error(USAGE);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

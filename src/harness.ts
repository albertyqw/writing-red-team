import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Brief, Config, Persona } from "./types.js";

const MODES = ["essay", "research", "application"] as const;

export async function loadConfig(harnessDir: string): Promise<Config> {
  const raw = await readFile(path.join(harnessDir, "config.json"), "utf8");
  return JSON.parse(raw) as Config;
}

export async function loadText(file: string): Promise<string> {
  return (await readFile(file, "utf8")).trim();
}

/**
 * A brief must name a mode, a goal, and constraints. Everything else in the
 * file passes to the model as written.
 */
export function parseBrief(text: string): Brief {
  const mode = /^mode:\s*(\w+)/im.exec(text)?.[1]?.toLowerCase();
  if (!mode || !MODES.includes(mode as Brief["mode"])) {
    throw new Error(`brief.md needs a line "mode: essay|research|application".`);
  }
  for (const heading of ["Goal", "Constraints"]) {
    const body = section(text, heading);
    if (!body || /^\[.*\]$/s.test(body)) {
      throw new Error(`brief.md needs a filled "## ${heading}" section.`);
    }
  }
  return { mode: mode as Brief["mode"], text: text.trim() };
}

function section(text: string, heading: string): string | undefined {
  const re = new RegExp(`^##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "im");
  return re.exec(text)?.[1]?.trim() || undefined;
}

export async function loadPersonas(
  harnessDir: string,
  mode: Brief["mode"],
  maxWords: number,
): Promise<Persona[]> {
  const dir = path.join(harnessDir, "personas", mode);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) throw new Error(`No personas in ${dir}.`);
  return Promise.all(
    files.map(async (f) => {
      const text = await loadText(path.join(dir, f));
      const words = text.split(/\s+/).length;
      if (words > maxWords) {
        throw new Error(`${f} has ${words} words; personas are capped at ${maxWords}.`);
      }
      return { id: f.replace(/\.md$/, ""), text };
    }),
  );
}

/** Latest pasted snapshot: the highest-sorted file in versions/. */
export async function latestVersion(articleDir: string): Promise<{ name: string; text: string }> {
  const dir = path.join(articleDir, "versions");
  const files = (await readdir(dir)).filter((f) => /\.(md|txt)$/.test(f)).sort();
  const name = files.at(-1);
  if (!name) throw new Error(`No snapshots in ${dir}. Run: rt paste <article> <file>`);
  return { name, text: await loadText(path.join(dir, name)) };
}

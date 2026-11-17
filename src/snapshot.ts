import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";

/**
 * npm run starts in the repo folder, so resolve relative paths against the
 * folder the user typed the command in.
 */
export function resolveUserPath(file: string, cwd = process.env.INIT_CWD ?? process.cwd()): string {
  return path.resolve(cwd, file.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
}

/** Read a draft as plain text. Accepts .md, .txt and .docx. */
export async function readDraft(file: string): Promise<string> {
  try {
    await access(file);
  } catch {
    throw new Error(`No file at ${file}. Check the path, or drag the file into the terminal to paste its full path.`);
  }
  const ext = path.extname(file).toLowerCase();
  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ path: file });
    return value.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  if (ext === ".md" || ext === ".txt" || ext === "") return readFile(file, "utf8");
  throw new Error(`Can't read ${ext} files. Use .docx, .md or .txt.`);
}

/** Save a draft as the next numbered snapshot, always as markdown. */
export async function saveSnapshot(articleDir: string, file: string): Promise<string> {
  const text = await readDraft(file);
  if (!text.trim()) throw new Error(`${file} has no text.`);
  const dir = path.join(articleDir, "versions");
  await mkdir(dir, { recursive: true });
  const n = (await readdir(dir)).filter((f) => /^\d{3}\./.test(f)).length + 1;
  const name = `${String(n).padStart(3, "0")}.md`;
  await writeFile(path.join(dir, name), text);
  return name;
}

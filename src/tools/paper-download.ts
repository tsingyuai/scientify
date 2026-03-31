import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Result } from "./result.js";
import { validateArxivId, validateDoi } from "../utils/security.js";

const execFileAsync = promisify(execFile);

const ARXIV_RATE_LIMIT_MS = 3000;
const UNPAYWALL_API = "https://api.unpaywall.org/v2";
const USER_EMAIL = "research@openclaw.ai";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const PaperDownloadSchema = Type.Object({
  ids: Type.Array(Type.String(), {
    description:
      "List of paper identifiers. arXiv IDs (e.g. '2401.12345') or DOIs (e.g. '10.1038/s41586-021-03819-2'). Max 20.",
    minItems: 1,
    maxItems: 20,
  }),
  output_dir: Type.Optional(
    Type.String({ description: "Output directory. Defaults to 'papers/' relative to cwd." }),
  ),
});

type SingleResult = {
  id: string;
  type: "arxiv" | "doi";
  status: "success" | "not_oa" | "failed";
  format?: "tex" | "pdf";
  path?: string;
  files?: string[];
  message: string;
  title?: string;
};

function isArxivId(id: string): boolean {
  return /^\d{4}\.\d{4,5}(v\d+)?$/.test(id);
}

function readArrayParam(params: Record<string, unknown>, key: string): string[] {
  const value = params[key];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* single value */ }
    return [value];
  }
  return [];
}

function readStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  return v == null ? undefined : String(v);
}

// ── arXiv download helpers ──────────────────────────────────────────

async function findTexFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const sub = await findTexFiles(path.join(dir, entry.name));
      files.push(...sub.map((f) => path.join(entry.name, f)));
    } else if (entry.name.endsWith(".tex")) {
      files.push(entry.name);
    }
  }
  return files;
}

async function downloadArxivTex(
  arxivId: string,
  outputDir: string,
): Promise<SingleResult> {
  const paperDir = path.join(outputDir, arxivId);
  await fs.promises.mkdir(paperDir, { recursive: true });

  const srcUrl = `https://arxiv.org/src/${arxivId}`;
  const tarPath = path.join(paperDir, "source.tar.gz");

  try {
    const res = await fetch(srcUrl);
    if (!res.ok) {
      return downloadArxivPdf(arxivId, outputDir, `Source HTTP ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(tarPath, buffer);

    const isTarGz = buffer[0] === 0x1f && buffer[1] === 0x8b;
    if (isTarGz) {
      try {
        await execFileAsync("tar", ["-xzf", tarPath, "-C", paperDir]);
      } catch {
        return downloadArxivPdf(arxivId, outputDir, "tar extraction failed");
      }
      await fs.promises.unlink(tarPath).catch(() => {});

      const texFiles = await findTexFiles(paperDir);
      if (texFiles.length === 0) {
        return downloadArxivPdf(arxivId, outputDir, "No .tex files in archive");
      }
      return { id: arxivId, type: "arxiv", status: "success", format: "tex", path: paperDir, files: texFiles, message: `${texFiles.length} .tex files` };
    } else {
      const texPath = path.join(paperDir, "main.tex");
      await fs.promises.rename(tarPath, texPath);
      return { id: arxivId, type: "arxiv", status: "success", format: "tex", path: paperDir, files: ["main.tex"], message: "Single .tex file" };
    }
  } catch (err) {
    return downloadArxivPdf(arxivId, outputDir, String(err));
  }
}

async function downloadArxivPdf(
  arxivId: string,
  outputDir: string,
  fallbackReason: string,
): Promise<SingleResult> {
  try {
    const res = await fetch(`https://arxiv.org/pdf/${arxivId}.pdf`);
    if (!res.ok) {
      return { id: arxivId, type: "arxiv", status: "failed", message: `PDF HTTP ${res.status} (tex: ${fallbackReason})` };
    }
    const pdfPath = path.join(outputDir, `${arxivId}.pdf`);
    await fs.promises.writeFile(pdfPath, Buffer.from(await res.arrayBuffer()));
    return { id: arxivId, type: "arxiv", status: "success", format: "pdf", path: pdfPath, files: [`${arxivId}.pdf`], message: `PDF fallback (${fallbackReason})` };
  } catch (err) {
    return { id: arxivId, type: "arxiv", status: "failed", message: String(err) };
  }
}

// ── DOI / Unpaywall download helpers ────────────────────────────────

async function downloadDoi(doi: string, outputDir: string): Promise<SingleResult> {
  try {
    const apiUrl = `${UNPAYWALL_API}/${encodeURIComponent(doi)}?email=${USER_EMAIL}`;
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "scientify-research-agent/1.0 (mailto:research@openclaw.ai)" },
    });
    if (!res.ok) {
      return { id: doi, type: "doi", status: "failed", message: `Unpaywall API ${res.status}` };
    }

    const data = (await res.json()) as {
      is_oa: boolean;
      best_oa_location: { url_for_pdf?: string | null; url?: string } | null;
      title?: string;
    };

    if (!data.is_oa || !data.best_oa_location) {
      return { id: doi, type: "doi", status: "not_oa", message: "Not open access", title: data.title };
    }

    const pdfUrl = data.best_oa_location.url_for_pdf || data.best_oa_location.url;
    if (!pdfUrl) {
      return { id: doi, type: "doi", status: "failed", message: "No PDF URL", title: data.title };
    }

    const pdfRes = await fetch(pdfUrl, {
      headers: { "User-Agent": "scientify-research-agent/1.0 (mailto:research@openclaw.ai)" },
      redirect: "follow",
    });
    if (!pdfRes.ok) {
      return { id: doi, type: "doi", status: "failed", message: `PDF download HTTP ${pdfRes.status}`, title: data.title };
    }

    const ct = pdfRes.headers.get("content-type") || "";
    if (!ct.includes("pdf") && !ct.includes("octet-stream")) {
      return { id: doi, type: "doi", status: "failed", message: "Response is not a PDF", title: data.title };
    }

    const slug = doi.replace(/[/\\:]/g, "_");
    const pdfPath = path.join(outputDir, `${slug}.pdf`);
    await fs.promises.writeFile(pdfPath, Buffer.from(await pdfRes.arrayBuffer()));
    return { id: doi, type: "doi", status: "success", format: "pdf", path: pdfPath, files: [`${slug}.pdf`], message: "OK", title: data.title };
  } catch (err) {
    return { id: doi, type: "doi", status: "failed", message: String(err) };
  }
}

// ── Tool factory ────────────────────────────────────────────────────

export function createPaperDownloadTool() {
  return {
    label: "Paper Download",
    name: "paper_download",
    description:
      "Download academic papers by arXiv ID or DOI. arXiv papers: downloads .tex source with PDF fallback. DOI papers: downloads open-access PDF via Unpaywall. Non-OA DOI papers are skipped gracefully.",
    parameters: PaperDownloadSchema,
    execute: async (_toolCallId: string, rawArgs: unknown) => {
      const params = rawArgs as Record<string, unknown>;
      const rawIds = readArrayParam(params, "ids");
      const outputDir = path.resolve(readStringParam(params, "output_dir") ?? "papers");

      if (rawIds.length === 0) {
        return Result.err("invalid_params", "ids must be a non-empty array");
      }

      await fs.promises.mkdir(outputDir, { recursive: true });

      // Validate & classify
      const tasks: Array<{ id: string; type: "arxiv" | "doi" }> = [];
      for (const raw of rawIds) {
        const trimmed = raw.trim();
        if (isArxivId(trimmed)) {
          validateArxivId(trimmed);
          tasks.push({ id: trimmed, type: "arxiv" });
        } else {
          validateDoi(trimmed);
          tasks.push({ id: trimmed, type: "doi" });
        }
      }

      const results: SingleResult[] = [];
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        if (t.type === "arxiv") {
          if (i > 0 && tasks[i - 1].type === "arxiv") await delay(ARXIV_RATE_LIMIT_MS);
          results.push(await downloadArxivTex(t.id, outputDir));
        } else {
          results.push(await downloadDoi(t.id, outputDir));
          await delay(100); // Unpaywall rate limit
        }
      }

      const success = results.filter((r) => r.status === "success").length;
      return Result.ok({
        output_dir: outputDir,
        total: tasks.length,
        success,
        not_oa: results.filter((r) => r.status === "not_oa").length,
        failed: tasks.length - success - results.filter((r) => r.status === "not_oa").length,
        results,
      });
    },
  };
}

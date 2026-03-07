import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as tar from "tar";
import { Result } from "./result.js";

// Rate limit: arXiv recommends ~3 seconds between requests
const RATE_LIMIT_MS = 3000;

/** Non-blocking delay that yields to event loop */
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const ArxivDownloadSchema = Type.Object({
  arxiv_ids: Type.Array(Type.String(), {
    description: "List of arXiv IDs to download (e.g. ['2401.12345', '2312.00001']).",
  }),
  output_dir: Type.Optional(Type.String({
    description: "Directory to save files. Defaults to 'papers/' relative to cwd. Can be relative or absolute.",
  })),
});

type DownloadResult = {
  success: boolean;
  format: "tex" | "pdf";
  path: string;
  files: string[];
  error?: string;
  fallbackReason?: string;
};

function readStringParam(params: Record<string, unknown>, key: string, opts?: { required?: boolean }): string | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    if (opts?.required) {
      throw new Error(`Missing required parameter: ${key}`);
    }
    return undefined;
  }
  return String(value);
}

function readArrayParam(params: Record<string, unknown>, key: string): string[] {
  const value = params[key];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [value];
    }
  }
  return [];
}

async function downloadTexSource(
  arxivId: string,
  outputDir: string,
  logger?: { debug?: (msg: string) => void },
): Promise<DownloadResult> {
  const log = (msg: string) => logger?.debug?.(`[arxiv:${arxivId}] ${msg}`);
  const paperDir = path.join(outputDir, arxivId);
  await fs.promises.mkdir(paperDir, { recursive: true });

  const srcUrl = `https://arxiv.org/src/${arxivId}`;
  const tarPath = path.join(paperDir, "source.tar.gz");

  try {
    log(`Fetching source from ${srcUrl}`);
    const response = await fetch(srcUrl);
    if (!response.ok) {
      const reason = `Source download failed: HTTP ${response.status} ${response.statusText}`;
      log(reason);
      const result = await downloadPdf(arxivId, outputDir, logger);
      return { ...result, fallbackReason: reason };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    log(`Downloaded ${buffer.length} bytes`);
    await fs.promises.writeFile(tarPath, buffer);

    const isTarGz = buffer[0] === 0x1f && buffer[1] === 0x8b;
    log(`Format check: ${isTarGz ? "tar.gz" : "single file"}`);

    if (isTarGz) {
      await tar.x({ file: tarPath, cwd: paperDir });
      await fs.promises.unlink(tarPath);

      const files = await findTexFiles(paperDir);
      log(`Found ${files.length} .tex files: ${files.join(", ")}`);
      if (files.length === 0) {
        const reason = "No .tex files found in source archive";
        log(reason);
        const result = await downloadPdf(arxivId, outputDir, logger);
        return { ...result, fallbackReason: reason };
      }
      return { success: true, format: "tex", path: paperDir, files };
    } else {
      const texPath = path.join(paperDir, "main.tex");
      await fs.promises.rename(tarPath, texPath);
      log("Saved as single main.tex file");
      return { success: true, format: "tex", path: paperDir, files: ["main.tex"] };
    }
  } catch (error) {
    const reason = `Source extraction error: ${error instanceof Error ? error.message : String(error)}`;
    log(reason);
    const result = await downloadPdf(arxivId, outputDir, logger);
    return { ...result, fallbackReason: reason };
  }
}

async function downloadPdf(
  arxivId: string,
  outputDir: string,
  logger?: { debug?: (msg: string) => void },
): Promise<DownloadResult> {
  const log = (msg: string) => logger?.debug?.(`[arxiv:${arxivId}] ${msg}`);
  try {
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    log(`Downloading PDF: ${pdfUrl}`);
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      log(`PDF download failed: HTTP ${response.status}`);
      return { success: false, format: "pdf", path: "", files: [], error: `PDF download failed: ${response.status}` };
    }
    const pdfPath = path.join(outputDir, `${arxivId}.pdf`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(pdfPath, buffer);
    log(`PDF saved: ${pdfPath} (${buffer.length} bytes)`);
    return { success: true, format: "pdf", path: pdfPath, files: [`${arxivId}.pdf`] };
  } catch (error) {
    log(`PDF download error: ${error}`);
    return { success: false, format: "pdf", path: "", files: [], error: String(error) };
  }
}

async function findTexFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await findTexFiles(fullPath);
      files.push(...subFiles.map((f) => path.join(entry.name, f)));
    } else if (entry.name.endsWith(".tex")) {
      files.push(entry.name);
    }
  }
  return files;
}

/**
 * arxiv_download: Download papers by arxiv_id. Requires explicit output_dir.
 */
export function createArxivDownloadTool() {
  return {
    label: "ArXiv Download",
    name: "arxiv_download",
    description: "Download arXiv papers by ID. Downloads .tex source (with PDF fallback). output_dir defaults to 'papers/' if omitted.",
    parameters: ArxivDownloadSchema,
    execute: async (_toolCallId: string, rawArgs: unknown) => {
      const params = rawArgs as Record<string, unknown>;
      const arxivIds = readArrayParam(params, "arxiv_ids");
      const outputDir = readStringParam(params, "output_dir") ?? "papers";

      if (arxivIds.length === 0) {
        return Result.err("invalid_params", "arxiv_ids must be a non-empty array");
      }

      const resolvedOutputDir = path.resolve(outputDir);

      await fs.promises.mkdir(resolvedOutputDir, { recursive: true });

      const logger = { debug: (msg: string) => console.log(`[arxiv-download] ${msg}`) };
      const downloads: Array<{
        arxiv_id: string;
        success: boolean;
        format: string;
        path: string;
        files: string[];
        error?: string;
        fallback_reason?: string;
      }> = [];

      for (let i = 0; i < arxivIds.length; i++) {
        const arxivId = arxivIds[i];

        // Rate limit: wait before each request (except first)
        if (i > 0) {
          await delay(RATE_LIMIT_MS);
        }

        // Always try .tex first, fallback to PDF automatically
        const result = await downloadTexSource(arxivId, resolvedOutputDir, logger);

        downloads.push({
          arxiv_id: arxivId,
          success: result.success,
          format: result.format,
          path: result.path,
          files: result.files,
          error: result.error,
          fallback_reason: result.fallbackReason,
        });
      }

      const successful = downloads.filter((d) => d.success).length;
      const failed = downloads.filter((d) => !d.success).length;

      return Result.ok({
        output_dir: resolvedOutputDir,
        total: arxivIds.length,
        successful,
        failed,
        downloads,
      });
    },
  };
}

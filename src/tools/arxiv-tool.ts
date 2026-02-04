import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as tar from "tar";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS_LIMIT = 50;

export const ArxivToolSchema = Type.Object({
  query: Type.String({ description: "Search query for arXiv papers (e.g. 'graph neural network')." }),
  max_results: Type.Optional(
    Type.Number({
      description: "Maximum number of results to return (1-50). Default: 10.",
      minimum: 1,
      maximum: MAX_RESULTS_LIMIT,
    }),
  ),
  sort_by: Type.Optional(
    Type.String({
      description:
        'Sort order: "relevance" (default), "lastUpdatedDate", or "submittedDate".',
    }),
  ),
  date_from: Type.Optional(
    Type.String({
      description: "Filter papers submitted after this date (YYYY-MM-DD).",
    }),
  ),
  download: Type.Optional(
    Type.Boolean({
      description:
        "If true, download .tex source for each paper to output_dir. Default: false.",
    }),
  ),
  output_dir: Type.Optional(
    Type.String({
      description: "Directory to download .tex source files into. Default: workspace/papers/",
    }),
  ),
});

type ArxivPaper = {
  title: string;
  authors: string[];
  abstract: string;
  arxivId: string;
  pdfUrl: string;
  published: string;
  updated: string;
  categories: string[];
};

const SORT_MAP: Record<string, string> = {
  relevance: "relevance",
  lastupdateddate: "lastUpdatedDate",
  submitteddate: "submittedDate",
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

function readNumberParam(params: Record<string, unknown>, key: string, opts?: { integer?: boolean }): number | undefined {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  if (isNaN(num)) return undefined;
  return opts?.integer ? Math.floor(num) : num;
}

/**
 * Download and extract .tex source from arXiv
 */
async function downloadTexSource(
  arxivId: string,
  outputDir: string,
): Promise<{ success: boolean; format: "tex" | "pdf"; files: string[]; error?: string }> {
  const paperDir = path.join(outputDir, arxivId);
  await fs.promises.mkdir(paperDir, { recursive: true });

  const srcUrl = `https://arxiv.org/src/${arxivId}`;
  const tarPath = path.join(paperDir, "source.tar.gz");

  try {
    // Try to download .tex source
    const response = await fetch(srcUrl);
    if (!response.ok) {
      // Fallback to PDF
      return await downloadPdfFallback(arxivId, outputDir);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(tarPath, buffer);

    // Check if it's actually a tar.gz or just a single file
    const isTarGz = buffer[0] === 0x1f && buffer[1] === 0x8b;

    if (isTarGz) {
      // Extract tar.gz
      await tar.x({ file: tarPath, cwd: paperDir });
      await fs.promises.unlink(tarPath); // Remove tar.gz after extraction

      // Find all .tex files
      const files = await findTexFiles(paperDir);
      if (files.length === 0) {
        return await downloadPdfFallback(arxivId, outputDir);
      }
      return { success: true, format: "tex", files };
    } else {
      // Single file (probably .tex directly)
      const texPath = path.join(paperDir, "main.tex");
      await fs.promises.rename(tarPath, texPath);
      return { success: true, format: "tex", files: ["main.tex"] };
    }
  } catch (error) {
    // Fallback to PDF on any error
    return await downloadPdfFallback(arxivId, outputDir);
  }
}

async function downloadPdfFallback(
  arxivId: string,
  outputDir: string,
): Promise<{ success: boolean; format: "tex" | "pdf"; files: string[]; error?: string }> {
  try {
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      return { success: false, format: "pdf", files: [], error: `PDF download failed: ${response.status}` };
    }
    const pdfPath = path.join(outputDir, `${arxivId}.pdf`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(pdfPath, buffer);
    return { success: true, format: "pdf", files: [`${arxivId}.pdf`] };
  } catch (error) {
    return { success: false, format: "pdf", files: [], error: String(error) };
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

function buildSearchUrl(query: string, maxResults: number, sortBy: string, dateFrom?: string) {
  let searchQuery = query;
  if (dateFrom) {
    // ArXiv date filter format: submittedDate:[YYYYMMDD0000+TO+*]
    const dateFormatted = dateFrom.replace(/-/g, "");
    searchQuery = `${query} AND submittedDate:[${dateFormatted}0000 TO 99991231]`;
  }
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: "0",
    max_results: String(maxResults),
    sortBy,
    sortOrder: "descending",
  });
  return `${ARXIV_API_URL}?${params.toString()}`;
}

function parseAtomXml(xml: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const getTag = (tag: string) => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].trim() : "";
    };

    const title = getTag("title").replace(/\s+/g, " ");
    const abstract = getTag("summary").replace(/\s+/g, " ");
    const published = getTag("published");
    const updated = getTag("updated");

    // Extract arXiv ID from <id> tag
    const idUrl = getTag("id");
    const arxivId = idUrl.replace("http://arxiv.org/abs/", "").replace(/v\d+$/, "");

    // Extract authors
    const authors: string[] = [];
    const authorRegex = /<author>\s*<name>([^<]+)<\/name>/g;
    let authorMatch: RegExpExecArray | null;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      authors.push(authorMatch[1].trim());
    }

    // Extract PDF link
    const pdfMatch = entry.match(/<link[^>]+title="pdf"[^>]+href="([^"]+)"/);
    const pdfUrl = pdfMatch ? pdfMatch[1] : `https://arxiv.org/pdf/${arxivId}`;

    // Extract categories
    const categories: string[] = [];
    const catRegex = /<category[^>]+term="([^"]+)"/g;
    let catMatch: RegExpExecArray | null;
    while ((catMatch = catRegex.exec(entry)) !== null) {
      categories.push(catMatch[1]);
    }

    if (title && arxivId) {
      papers.push({ title, authors, abstract, arxivId, pdfUrl, published, updated, categories });
    }
  }
  return papers;
}

export function createArxivTool() {
  return {
    label: "ArXiv",
    name: "arxiv",
    description:
      "Search arXiv.org for academic papers by keyword. Returns titles, authors, abstracts, and IDs. Optionally downloads .tex source files.",
    parameters: ArxivToolSchema,
    execute: async (_toolCallId: string, rawArgs: unknown) => {
      const params = rawArgs as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true })!;
      const maxResults = Math.min(
        readNumberParam(params, "max_results", { integer: true }) ?? DEFAULT_MAX_RESULTS,
        MAX_RESULTS_LIMIT,
      );
      const rawSort = readStringParam(params, "sort_by") ?? "relevance";
      const sortBy = SORT_MAP[rawSort.toLowerCase()] ?? "relevance";
      const dateFrom = readStringParam(params, "date_from");
      const download = params.download === true || params.download === "true";
      const outputDir = readStringParam(params, "output_dir") ??
        path.join(os.homedir(), ".openclaw", "workspace", "papers");

      const url = buildSearchUrl(query, maxResults, sortBy, dateFrom);

      let response: Response;
      try {
        response = await fetch(url);
      } catch (error) {
        return {
          type: "tool_result" as const,
          content: JSON.stringify({
            error: "network_error",
            message: `Failed to reach arXiv API: ${error instanceof Error ? error.message : String(error)}`,
          }),
        };
      }

      if (!response.ok) {
        return {
          type: "tool_result" as const,
          content: JSON.stringify({
            error: "api_error",
            message: `arXiv API returned ${response.status}: ${response.statusText}`,
          }),
        };
      }

      const xml = await response.text();
      const papers = parseAtomXml(xml);

      // If download requested, download .tex source for each paper
      let downloads: Array<{ arxiv_id: string; format: string; files: string[]; error?: string }> | undefined;
      if (download && papers.length > 0) {
        await fs.promises.mkdir(outputDir, { recursive: true });
        downloads = [];
        for (const paper of papers) {
          const result = await downloadTexSource(paper.arxivId, outputDir);
          downloads.push({
            arxiv_id: paper.arxivId,
            format: result.format,
            files: result.files,
            error: result.error,
          });
        }
      }

      return {
        type: "tool_result" as const,
        content: JSON.stringify({
          query,
          total: papers.length,
          papers: papers.map((p) => ({
            title: p.title,
            authors: p.authors,
            abstract: p.abstract,
            arxiv_id: p.arxivId,
            pdf_url: p.pdfUrl,
            published: p.published,
            categories: p.categories,
          })),
          ...(downloads && { downloads, output_dir: outputDir }),
        }),
      };
    },
  };
}

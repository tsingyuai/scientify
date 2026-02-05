import { Type } from "@sinclair/typebox";
import { Result } from "./result.js";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS_LIMIT = 50;

export const ArxivSearchSchema = Type.Object({
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
      description: 'Sort order: "relevance" (default), "lastUpdatedDate", or "submittedDate".',
    }),
  ),
  date_from: Type.Optional(
    Type.String({
      description: "Filter papers submitted after this date (YYYY-MM-DD).",
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

function buildSearchUrl(query: string, maxResults: number, sortBy: string, dateFrom?: string) {
  let searchQuery = query;
  if (dateFrom) {
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

    const idUrl = getTag("id");
    const arxivId = idUrl.replace("http://arxiv.org/abs/", "").replace(/v\d+$/, "");

    const authors: string[] = [];
    const authorRegex = /<author>\s*<name>([^<]+)<\/name>/g;
    let authorMatch: RegExpExecArray | null;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      authors.push(authorMatch[1].trim());
    }

    const pdfMatch = entry.match(/<link[^>]+title="pdf"[^>]+href="([^"]+)"/);
    const pdfUrl = pdfMatch ? pdfMatch[1] : `https://arxiv.org/pdf/${arxivId}`;

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

/**
 * arxiv_search: Search arXiv papers. Pure function, no side effects.
 */
export function createArxivSearchTool() {
  return {
    label: "ArXiv Search",
    name: "arxiv_search",
    description: "Search arXiv.org for academic papers. Returns paper metadata (title, authors, abstract, arxiv_id). Does NOT download files.",
    parameters: ArxivSearchSchema,
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

      const url = buildSearchUrl(query, maxResults, sortBy, dateFrom);

      let response: Response;
      try {
        response = await fetch(url);
      } catch (error) {
        return Result.err("network_error", `Failed to reach arXiv API: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (!response.ok) {
        return Result.err("api_error", `arXiv API returned ${response.status}: ${response.statusText}`);
      }

      const xml = await response.text();
      const papers = parseAtomXml(xml);

      return Result.ok({
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
      });
    },
  };
}

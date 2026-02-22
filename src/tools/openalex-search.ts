import { Type } from "@sinclair/typebox";
import { Result } from "./result.js";

const OPENALEX_API = "https://api.openalex.org/works";
const DEFAULT_MAX_RESULTS = 20;
const MAX_RESULTS_LIMIT = 100;

export const OpenAlexSearchToolSchema = Type.Object({
  query: Type.String({
    description: "Search query for academic works (papers, articles). Can search by title, abstract, author, or keywords.",
  }),
  max_results: Type.Optional(
    Type.Number({
      description: "Maximum number of results (1-100). Default: 20.",
      minimum: 1,
      maximum: MAX_RESULTS_LIMIT,
    }),
  ),
  filter: Type.Optional(
    Type.String({
      description: 'Optional filter string (e.g., "publication_year:2020-2024", "type:journal-article", "is_oa:true"). See OpenAlex docs for filter syntax.',
    }),
  ),
  sort: Type.Optional(
    Type.String({
      description: 'Sort by: "cited_by_count" (most cited), "publication_date" (newest first), or "relevance_score" (default).',
    }),
  ),
});

type OpenAlexWork = {
  id: string;
  doi: string | null;
  title: string;
  publication_year: number | null;
  publication_date: string | null;
  type: string;
  cited_by_count: number;
  authorships: Array<{
    author: {
      display_name: string;
    };
  }>;
  primary_location: {
    source: {
      display_name: string | null;
    } | null;
  } | null;
  abstract_inverted_index: Record<string, number[]> | null;
  open_access: {
    is_oa: boolean;
    oa_url: string | null;
  };
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

function reconstructAbstract(invertedIndex: Record<string, number[]> | null): string {
  if (!invertedIndex) return "";

  const words: Array<[string, number]> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }

  words.sort((a, b) => a[1] - b[1]);
  return words.map(([word]) => word).join(" ").substring(0, 500); // Limit to 500 chars
}

export function createOpenAlexSearchTool() {
  return {
    label: "OpenAlex Search",
    name: "openalex_search",
    description:
      "Search for academic papers across all disciplines using OpenAlex API. Returns paper metadata including DOI, authors, citations, and open access status. More comprehensive than arXiv (covers all fields, not just STEM).",
    parameters: OpenAlexSearchToolSchema,
    execute: async (_toolCallId: string, rawArgs: unknown) => {
      const params = rawArgs as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true })!;
      const maxResults = Math.min(
        readNumberParam(params, "max_results", { integer: true }) ?? DEFAULT_MAX_RESULTS,
        MAX_RESULTS_LIMIT,
      );
      const filterStr = readStringParam(params, "filter");
      const sortStr = readStringParam(params, "sort") ?? "relevance_score";

      // Build URL parameters
      const urlParams = new URLSearchParams({
        search: query,
        per_page: String(maxResults),
        mailto: "research@openclaw.ai", // Polite pool for higher rate limits
      });

      if (filterStr) {
        urlParams.set("filter", filterStr);
      }

      // Map sort parameter
      const sortMapping: Record<string, string> = {
        cited_by_count: "cited_by_count:desc",
        publication_date: "publication_date:desc",
        relevance_score: "relevance_score:desc",
      };
      urlParams.set("sort", sortMapping[sortStr] || sortMapping.relevance_score);

      const url = `${OPENALEX_API}?${urlParams.toString()}`;

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            "User-Agent": "scientify-research-agent/1.0 (mailto:research@openclaw.ai)",
          },
        });
      } catch (error) {
        return Result.err("network_error", `Failed to reach OpenAlex API: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (response.status === 429) {
        return Result.err("rate_limited", "OpenAlex API rate limit exceeded. Please wait a moment and retry.");
      }

      if (!response.ok) {
        return Result.err("api_error", `OpenAlex API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { results?: OpenAlexWork[]; meta?: { count: number } };
      const works = (data.results ?? []).map((work) => ({
        id: work.id.replace("https://openalex.org/", ""), // Clean ID
        title: work.title || "Untitled",
        doi: work.doi?.replace("https://doi.org/", "") || null,
        year: work.publication_year,
        date: work.publication_date,
        type: work.type,
        authors: work.authorships.slice(0, 5).map((a) => a.author.display_name), // First 5 authors
        venue: work.primary_location?.source?.display_name || "Unknown",
        cited_by: work.cited_by_count,
        is_open_access: work.open_access.is_oa,
        oa_url: work.open_access.oa_url,
        abstract_preview: reconstructAbstract(work.abstract_inverted_index),
      }));

      return Result.ok({
        query,
        total_count: data.meta?.count ?? 0,
        returned: works.length,
        works,
      });
    },
  };
}

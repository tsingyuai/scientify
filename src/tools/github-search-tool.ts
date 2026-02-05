import { Type } from "@sinclair/typebox";
import { Result } from "./result.js";

const GITHUB_SEARCH_API = "https://api.github.com/search/repositories";
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS_LIMIT = 30;

export const GithubSearchToolSchema = Type.Object({
  query: Type.String({
    description: "Search query for GitHub repositories (e.g. 'graph neural network recommendation').",
  }),
  max_results: Type.Optional(
    Type.Number({
      description: "Maximum number of results (1-30). Default: 10.",
      minimum: 1,
      maximum: MAX_RESULTS_LIMIT,
    }),
  ),
  language: Type.Optional(
    Type.String({
      description: "Filter by programming language (e.g. 'python', 'typescript').",
    }),
  ),
  sort: Type.Optional(
    Type.String({
      description: 'Sort by: "stars" (default), "updated", or "best-match".',
    }),
  ),
});

type GithubRepo = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  topics: string[];
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

function resolveGithubToken(): string | undefined {
  return (
    (process.env.GITHUB_TOKEN ?? "").trim() ||
    (process.env.GH_TOKEN ?? "").trim() ||
    (process.env.GITHUB_AI_TOKEN ?? "").trim() ||
    undefined
  );
}

export function createGithubSearchTool() {
  return {
    label: "GitHub Search",
    name: "github_search",
    description:
      "Search GitHub repositories by keyword. Returns repo names, descriptions, star counts, and URLs. Reads GITHUB_TOKEN from environment for authentication.",
    parameters: GithubSearchToolSchema,
    execute: async (_toolCallId: string, rawArgs: unknown) => {
      const params = rawArgs as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true })!;
      const maxResults = Math.min(
        readNumberParam(params, "max_results", { integer: true }) ?? DEFAULT_MAX_RESULTS,
        MAX_RESULTS_LIMIT,
      );
      const language = readStringParam(params, "language");
      const rawSort = readStringParam(params, "sort") ?? "stars";

      // Build GitHub search query
      let searchQuery = query;
      if (language) {
        searchQuery += ` language:${language}`;
      }

      const sort = rawSort === "best-match" ? undefined : rawSort;
      const urlParams = new URLSearchParams({
        q: searchQuery,
        per_page: String(maxResults),
        order: "desc",
      });
      if (sort) {
        urlParams.set("sort", sort);
      }

      const url = `${GITHUB_SEARCH_API}?${urlParams.toString()}`;
      const token = resolveGithubToken();
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "scientify-agent",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      let response: Response;
      try {
        response = await fetch(url, { headers });
      } catch (error) {
        return Result.err("network_error", `Failed to reach GitHub API: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (response.status === 403) {
        return Result.err("rate_limited", "GitHub API rate limit exceeded. Set GITHUB_TOKEN environment variable for higher limits.");
      }

      if (!response.ok) {
        return Result.err("api_error", `GitHub API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { items?: GithubRepo[]; total_count?: number };
      const repos = (data.items ?? []).map((repo) => ({
        name: repo.full_name,
        url: repo.html_url,
        description: repo.description ?? "",
        stars: repo.stargazers_count,
        language: repo.language ?? "unknown",
        updated: repo.updated_at,
        topics: repo.topics ?? [],
      }));

      return Result.ok({
        query,
        total_count: data.total_count ?? 0,
        returned: repos.length,
        repos,
      });
    },
  };
}

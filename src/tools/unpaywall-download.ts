import { Type } from "@sinclair/typebox";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Result } from "./result.js";

const UNPAYWALL_API = "https://api.unpaywall.org/v2";
const USER_EMAIL = "research@openclaw.ai"; // Required by Unpaywall

export const UnpaywallDownloadToolSchema = Type.Object({
  dois: Type.Array(Type.String(), {
    description: "List of DOIs to download (e.g., ['10.1038/s41586-021-03819-2']). Maximum 20 DOIs per request.",
    minItems: 1,
    maxItems: 20,
  }),
  output_dir: Type.String({
    description: "Absolute path to output directory where PDFs will be saved.",
  }),
});

type UnpaywallResponse = {
  doi: string;
  is_oa: boolean;
  best_oa_location: {
    url: string;
    url_for_pdf: string | null;
    url_for_landing_page: string | null;
    license: string | null;
  } | null;
  title: string;
  year: number | null;
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

async function downloadPDF(url: string, outputPath: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "scientify-research-agent/1.0 (mailto:research@openclaw.ai)",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      // Not a PDF, might be HTML landing page
      return false;
    }

    const buffer = await response.arrayBuffer();
    writeFileSync(outputPath, Buffer.from(buffer));
    return true;
  } catch {
    return false;
  }
}

export function createUnpaywallDownloadTool() {
  return {
    label: "Unpaywall Download",
    name: "unpaywall_download",
    description:
      "Download open access PDFs using Unpaywall API. Provide DOIs and output directory. Non-OA papers will be skipped with error captured (no failure). Returns list of successfully downloaded papers.",
    parameters: UnpaywallDownloadToolSchema,
    execute: async (_toolCallId: string, rawArgs: unknown) => {
      const params = rawArgs as Record<string, unknown>;
      const doisRaw = params.dois;
      if (!Array.isArray(doisRaw) || doisRaw.length === 0) {
        return Result.err("invalid_input", "dois must be a non-empty array");
      }
      const dois = doisRaw.map((d) => String(d).trim()).filter((d) => d.length > 0);

      const outputDir = readStringParam(params, "output_dir", { required: true })!;
      const resolvedOutputDir = resolve(outputDir);

      // Create output directory if it doesn't exist
      try {
        if (!existsSync(resolvedOutputDir)) {
          mkdirSync(resolvedOutputDir, { recursive: true });
        }
      } catch (error) {
        return Result.err("filesystem_error", `Failed to create output directory: ${error instanceof Error ? error.message : String(error)}`);
      }

      const results: Array<{
        doi: string;
        status: "success" | "not_oa" | "no_pdf_url" | "download_failed" | "api_error";
        message: string;
        file_path?: string;
        title?: string;
      }> = [];

      let successCount = 0;
      let notOACount = 0;
      let failedCount = 0;

      // Process each DOI
      for (const doi of dois) {
        try {
          // Query Unpaywall API
          const apiUrl = `${UNPAYWALL_API}/${encodeURIComponent(doi)}?email=${USER_EMAIL}`;
          const response = await fetch(apiUrl, {
            headers: {
              "User-Agent": "scientify-research-agent/1.0 (mailto:research@openclaw.ai)",
            },
          });

          if (!response.ok) {
            results.push({
              doi,
              status: "api_error",
              message: `API error: ${response.status} ${response.statusText}`,
            });
            failedCount++;
            continue;
          }

          const data = (await response.json()) as UnpaywallResponse;

          // Check if OA available
          if (!data.is_oa || !data.best_oa_location) {
            results.push({
              doi,
              status: "not_oa",
              message: "Paper is not open access",
              title: data.title,
            });
            notOACount++;
            continue;
          }

          // Get PDF URL
          const pdfUrl = data.best_oa_location.url_for_pdf || data.best_oa_location.url;
          if (!pdfUrl) {
            results.push({
              doi,
              status: "no_pdf_url",
              message: "No PDF URL available",
              title: data.title,
            });
            failedCount++;
            continue;
          }

          // Download PDF
          const sanitizedDoi = doi.replace(/[\/\\:]/g, "_");
          const filename = `${sanitizedDoi}.pdf`;
          const outputPath = join(resolvedOutputDir, filename);

          const downloaded = await downloadPDF(pdfUrl, outputPath);

          if (downloaded) {
            results.push({
              doi,
              status: "success",
              message: "Downloaded successfully",
              file_path: outputPath,
              title: data.title,
            });
            successCount++;
          } else {
            results.push({
              doi,
              status: "download_failed",
              message: "Failed to download PDF (might be HTML landing page or access denied)",
              title: data.title,
            });
            failedCount++;
          }
        } catch (error) {
          results.push({
            doi,
            status: "api_error",
            message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
          });
          failedCount++;
        }

        // Rate limiting: sleep 100ms between requests
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return Result.ok({
        total: dois.length,
        success: successCount,
        not_oa: notOACount,
        failed: failedCount,
        output_dir: resolvedOutputDir,
        results,
      });
    },
  };
}

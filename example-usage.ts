#!/usr/bin/env tsx
/**
 * Example: Academic Search Workflow
 *
 * Scenario: Find and download recent high-impact papers on "transformer architectures"
 *
 * Usage: tsx example-usage.ts
 */

import { createOpenAlexSearchTool } from "./src/tools/openalex-search.js";
import { createUnpaywallDownloadTool } from "./src/tools/unpaywall-download.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

function parseToolResult(result: any) {
  if (result.isError) {
    const errorData = JSON.parse(result.content[0].text);
    return { success: false, error: errorData };
  }
  const data = JSON.parse(result.content[0].text);
  return { success: true, data };
}

async function main() {
  console.log("📚 Academic Search Workflow Example\n");
  console.log("Research Question: What are the most influential transformer papers in 2020-2024?\n");

  // Step 1: Search for high-impact OA papers
  const searchTool = createOpenAlexSearchTool();

  console.log("Step 1: Searching OpenAlex for transformer papers...");
  const searchResult = parseToolResult(
    await searchTool.execute("search-1", {
      query: "transformer architecture attention mechanism",
      max_results: 10,
      filter: "is_oa:true,publication_year:2020-2024,cited_by_count:>1000",
      sort: "cited_by_count"
    })
  );

  if (!searchResult.success) {
    console.error("❌ Search failed:", searchResult.error.message);
    return;
  }

  const works = searchResult.data.works;
  console.log(`✅ Found ${works.length} highly-cited OA papers\n`);

  // Display results
  console.log("Top Papers:");
  works.forEach((work: any, i: number) => {
    console.log(`\n${i + 1}. ${work.title}`);
    console.log(`   Authors: ${work.authors.slice(0, 3).join(", ")}${work.authors.length > 3 ? "..." : ""}`);
    console.log(`   Year: ${work.year} | Citations: ${work.cited_by} | Venue: ${work.venue}`);
    console.log(`   DOI: ${work.doi}`);
    console.log(`   OA URL: ${work.oa_url || "N/A"}`);
  });

  // Step 2: Select papers to download
  const selectedDois = works
    .filter((w: any) => w.doi && w.is_open_access)
    .slice(0, 3)
    .map((w: any) => w.doi);

  console.log(`\n\nStep 2: Downloading ${selectedDois.length} selected papers...\n`);

  const outputDir = join(process.cwd(), "downloads/transformers");
  mkdirSync(outputDir, { recursive: true });

  const downloadTool = createUnpaywallDownloadTool();
  const downloadResult = parseToolResult(
    await downloadTool.execute("download-1", {
      dois: selectedDois,
      output_dir: outputDir
    })
  );

  if (!downloadResult.success) {
    console.error("❌ Download failed:", downloadResult.error.message);
    return;
  }

  // Display download summary
  console.log("✅ Download Summary:");
  console.log(`   Success: ${downloadResult.data.success}`);
  console.log(`   Not OA: ${downloadResult.data.not_oa}`);
  console.log(`   Failed: ${downloadResult.data.failed}\n`);

  console.log("Downloaded Files:");
  downloadResult.data.results.forEach((r: any) => {
    if (r.status === "success") {
      console.log(`   ✓ ${r.title || r.doi}`);
      console.log(`     → ${r.file_path}`);
    } else {
      console.log(`   ✗ ${r.title || r.doi} (${r.status}: ${r.message})`);
    }
  });

  console.log(`\n📁 All files saved to: ${outputDir}`);
  console.log("\n🎉 Workflow complete!\n");
}

main().catch(console.error);

#!/usr/bin/env tsx
/**
 * Test script for OpenAlex + Unpaywall tools
 * Usage: tsx test-academic-tools.ts
 */

import { createOpenAlexSearchTool } from "./src/tools/openalex-search.js";
import { createUnpaywallDownloadTool } from "./src/tools/unpaywall-download.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const TEMP_DIR = join(process.cwd(), "test-downloads");

function parseToolResult(result: any) {
  if (result.isError) {
    const errorData = JSON.parse(result.content[0].text);
    return { success: false, error: errorData };
  }
  const data = JSON.parse(result.content[0].text);
  return { success: true, data };
}

async function testOpenAlexSearch() {
  console.log("\n📚 Testing OpenAlex Search...\n");

  const tool = createOpenAlexSearchTool();

  // Test 1: Basic search
  console.log("Test 1: Basic search for 'Vision Transformer'");
  const result1Raw = await tool.execute("test-1", {
    query: "Vision Transformer image classification",
    max_results: 5
  });
  const result1 = parseToolResult(result1Raw);

  if (result1.success) {
    console.log(`✅ Found ${result1.data.returned} papers (total: ${result1.data.total_count})`);
    console.log(`   First paper: ${result1.data.works[0]?.title}`);
    console.log(`   DOI: ${result1.data.works[0]?.doi}`);
    console.log(`   Citations: ${result1.data.works[0]?.cited_by}`);
    console.log(`   OA: ${result1.data.works[0]?.is_open_access}`);
  } else {
    console.log(`❌ Search failed: ${result1.error.message}`);
    return null;
  }

  // Test 2: Search with filters
  console.log("\nTest 2: Search with filters (OA only, 2020-2024)");
  const result2Raw = await tool.execute("test-2", {
    query: "graph neural network",
    max_results: 5,
    filter: "is_oa:true,publication_year:2020-2024",
    sort: "cited_by_count"
  });
  const result2 = parseToolResult(result2Raw);

  if (result2.success) {
    console.log(`✅ Found ${result2.data.returned} OA papers`);
    result2.data.works.forEach((work: any, i: number) => {
      console.log(`   ${i + 1}. ${work.title} (${work.year}, ${work.cited_by} citations)`);
      console.log(`      DOI: ${work.doi}, OA URL: ${work.oa_url ? work.oa_url.substring(0, 50) + '...' : 'N/A'}`);
    });
  } else {
    console.log(`❌ Filtered search failed: ${result2.error.message}`);
  }

  // Return DOIs for download test - use OA papers from result2
  return result2.success
    ? result2.data.works
        .filter((w: any) => w.is_open_access && w.doi)
        .slice(0, 3)
        .map((w: any) => w.doi)
    : [];
}

async function testUnpaywallDownload(dois: string[]) {
  console.log("\n📥 Testing Unpaywall Download...\n");

  const tool = createUnpaywallDownloadTool();

  // Create temp directory
  mkdirSync(TEMP_DIR, { recursive: true });

  // Add a known non-OA DOI to test error handling
  const testDois = [
    ...dois,
    "10.1038/nature12373" // Nature paper, likely not OA
  ];

  console.log(`Attempting to download ${testDois.length} papers...`);
  testDois.forEach((doi, i) => console.log(`  ${i + 1}. ${doi}`));

  const resultRaw = await tool.execute("test-download", {
    dois: testDois,
    output_dir: TEMP_DIR
  });
  const result = parseToolResult(resultRaw);

  if (result.success) {
    console.log(`\n✅ Download completed:`);
    console.log(`   Success: ${result.data.success}`);
    console.log(`   Not OA: ${result.data.not_oa}`);
    console.log(`   Failed: ${result.data.failed}`);
    console.log(`   Output: ${result.data.output_dir}`);

    console.log(`\n📄 Results:`);
    result.data.results.forEach((r: any) => {
      const icon = r.status === "success" ? "✓" :
                   r.status === "not_oa" ? "⊘" : "✗";
      console.log(`   ${icon} ${r.doi}: ${r.status} - ${r.message}`);
      if (r.file_path) {
        console.log(`      → ${r.file_path}`);
      }
    });

    // Test error handling: non-OA should not cause tool failure
    const hasNonOA = result.data.results.some((r: any) => r.status === "not_oa");
    if (hasNonOA) {
      console.log(`\n✅ Non-OA error handling works correctly (marked as "not_oa", didn't fail)`);
    }
  } else {
    console.log(`❌ Download failed: ${result.error.message}`);
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("  Academic Search Tools Test Suite");
  console.log("=".repeat(60));

  try {
    // Test OpenAlex
    const oaDois = await testOpenAlexSearch();

    // Test Unpaywall
    if (oaDois && oaDois.length > 0) {
      await testUnpaywallDownload(oaDois);
    } else {
      console.log("\n⚠️  Skipping Unpaywall test (no OA DOIs found)");
    }

    console.log("\n" + "=".repeat(60));
    console.log("  Test Suite Complete");
    console.log("=".repeat(60));
    console.log(`\n📁 Downloaded files (if any): ${TEMP_DIR}\n`);

  } catch (error) {
    console.error("\n❌ Test failed with error:");
    console.error(error);
    process.exit(1);
  }
}

main();

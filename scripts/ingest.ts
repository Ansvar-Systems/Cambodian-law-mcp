#!/usr/bin/env tsx
/**
 * Cambodia Law MCP -- Census-Driven Ingestion Pipeline
 *
 * Reads data/census.json and ingests all laws classified as "ingestable".
 * For CDC entries: downloads PDF, extracts text via pdftotext, parses provisions.
 * For camlawbox entries: title_only (individual pages require login).
 *
 * Features:
 *   - Resume support: skips Acts that already have a seed JSON file
 *   - Census update: writes provision counts + ingestion dates back to census.json
 *   - Rate limiting: 500ms minimum between requests (via fetcher.ts)
 *   - PDF text extraction: uses pdftotext (poppler-utils)
 *
 * Usage:
 *   npm run ingest                    # Full census-driven ingestion
 *   npm run ingest -- --limit 5       # Test with 5 laws
 *   npm run ingest -- --skip-fetch    # Reuse cached PDFs (re-parse only)
 *   npm run ingest -- --force         # Re-ingest even if seed exists
 *   npm run ingest -- --title-only    # Also create title-only seeds for camlawbox entries
 *
 * Data source: cdc.gov.kh (Council for the Development of Cambodia)
 * Format: PDF (English translations)
 * License: Government Open Data
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { fetchWithRateLimit } from './lib/fetcher.js';
import { parsePdfText, extractPdfText, type ActIndexEntry, type ParsedAct } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CENSUS_PATH = path.resolve(__dirname, '../data/census.json');

/* ---------- Types ---------- */

interface CensusLawEntry {
  id: string;
  title: string;
  identifier: string;
  url: string;
  status: 'in_force' | 'amended' | 'repealed';
  category: string;
  classification: 'ingestable' | 'excluded' | 'inaccessible' | 'title_only';
  source: 'cdc' | 'camlawbox';
  pdf_url?: string;
  cdc_category?: string;
  date?: string;
  year?: string;
  ingested: boolean;
  provision_count: number;
  ingestion_date: string | null;
}

interface CensusFile {
  schema_version: string;
  jurisdiction: string;
  jurisdiction_name: string;
  portal: string;
  census_date: string;
  agent: string;
  summary: {
    total_laws: number;
    ingestable: number;
    title_only: number;
    inaccessible: number;
    excluded: number;
    ocr_needed: number;
  };
  laws: CensusLawEntry[];
}

/* ---------- Helpers ---------- */

function parseArgs(): { limit: number | null; skipFetch: boolean; force: boolean; titleOnly: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;
  let force = false;
  let titleOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    } else if (args[i] === '--force') {
      force = true;
    } else if (args[i] === '--title-only') {
      titleOnly = true;
    }
  }

  return { limit, skipFetch, force, titleOnly };
}

function censusToActEntry(law: CensusLawEntry): ActIndexEntry {
  return {
    id: law.id,
    title: law.title,
    titleEn: law.title,
    shortName: law.title.length > 60 ? law.title.substring(0, 57) + '...' : law.title,
    status: law.status === 'in_force' ? 'in_force' : law.status === 'amended' ? 'amended' : 'repealed',
    issuedDate: law.date ?? '',
    inForceDate: law.date ?? '',
    url: law.url,
    description: law.cdc_category ? `CDC Category: ${law.cdc_category}` : undefined,
    pdfUrl: law.pdf_url,
    cdcCategory: law.cdc_category,
  };
}

/**
 * Download a PDF and save to source directory.
 */
async function downloadPdf(url: string, destPath: string): Promise<boolean> {
  try {
    const result = await fetchWithRateLimit(url);
    if (result.status !== 200) {
      return false;
    }
    // fetchWithRateLimit returns text, but for PDFs we need binary
    // Use a direct download approach
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'cambodian-law-mcp/1.0 (https://github.com/Ansvar-Systems/cambodian-law-mcp)',
        'Accept': 'application/pdf, */*',
      },
      redirect: 'follow',
    });

    if (!response.ok) return false;

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    return true;
  } catch {
    return false;
  }
}

/* ---------- Main ---------- */

async function main(): Promise<void> {
  const { limit, skipFetch, force, titleOnly } = parseArgs();

  console.log('Cambodia Law MCP -- Ingestion Pipeline (Census-Driven)');
  console.log('======================================================\n');
  console.log('  Source: cdc.gov.kh (English PDF translations)');
  console.log('  Format: PDF -> pdftotext -> structured provisions');
  console.log('  License: Government Open Data');

  if (limit) console.log(`  --limit ${limit}`);
  if (skipFetch) console.log('  --skip-fetch');
  if (force) console.log('  --force (re-ingest all)');
  if (titleOnly) console.log('  --title-only (create seeds for title-only entries)');

  // Verify pdftotext is available
  try {
    execSync('pdftotext -v 2>&1', { encoding: 'utf-8' });
  } catch {
    console.error('\nERROR: pdftotext not found. Install poppler-utils:');
    console.error('  sudo apt install poppler-utils  # Debian/Ubuntu');
    console.error('  brew install poppler             # macOS');
    process.exit(1);
  }

  // Load census
  if (!fs.existsSync(CENSUS_PATH)) {
    console.error(`\nERROR: Census file not found at ${CENSUS_PATH}`);
    console.error('Run "npx tsx scripts/census.ts" first.');
    process.exit(1);
  }

  const census: CensusFile = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf-8'));

  // Select entries to ingest
  let toIngest = census.laws.filter(l => l.classification === 'ingestable');
  if (titleOnly) {
    // Also include title_only entries
    const titleOnlyEntries = census.laws.filter(l => l.classification === 'title_only');
    toIngest = [...toIngest, ...titleOnlyEntries];
  }
  const acts = limit ? toIngest.slice(0, limit) : toIngest;

  console.log(`\n  Census: ${census.summary.total_laws} total, ${census.summary.ingestable} ingestable`);
  if (titleOnly) console.log(`  + ${census.summary.title_only} title-only entries`);
  console.log(`  Processing: ${acts.length} laws\n`);

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let ingested = 0;
  let skipped = 0;
  let failed = 0;
  let titleOnlyCount = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  const results: { act: string; provisions: number; definitions: number; status: string }[] = [];

  // Build a map for census updates
  const censusMap = new Map<string, CensusLawEntry>();
  for (const law of census.laws) {
    censusMap.set(law.id, law);
  }

  const today = new Date().toISOString().split('T')[0];

  for (const law of acts) {
    const act = censusToActEntry(law);
    const seedFile = path.join(SEED_DIR, `${act.id}.json`);
    const pdfFile = path.join(SOURCE_DIR, `${act.id}.pdf`);
    const txtFile = path.join(SOURCE_DIR, `${act.id}.txt`);

    // Resume support: skip if seed already exists (unless --force)
    if (!force && fs.existsSync(seedFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8')) as ParsedAct;
        const provCount = existing.provisions?.length ?? 0;
        const defCount = existing.definitions?.length ?? 0;
        totalProvisions += provCount;
        totalDefinitions += defCount;

        const entry = censusMap.get(law.id);
        if (entry) {
          entry.ingested = true;
          entry.provision_count = provCount;
          entry.ingestion_date = entry.ingestion_date ?? today;
        }

        results.push({
          act: act.shortName,
          provisions: provCount,
          definitions: defCount,
          status: 'resumed',
        });
        skipped++;
        processed++;
        continue;
      } catch {
        // Corrupt seed file, re-ingest
      }
    }

    // Handle title-only entries
    if (law.classification === 'title_only') {
      const parsed: ParsedAct = {
        id: act.id,
        type: 'statute',
        title: act.title,
        title_en: act.titleEn,
        short_name: act.shortName,
        status: act.status,
        issued_date: act.issuedDate,
        in_force_date: act.inForceDate,
        url: act.url,
        provisions: [{
          provision_ref: '1',
          section: '1',
          title: act.title,
          content: `${act.title}. Full text requires access to camlawbox.com. Date: ${law.date ?? 'unknown'}. Category: ${law.category}.`,
        }],
        definitions: [],
      };
      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
      totalProvisions += 1;

      const entry = censusMap.get(law.id);
      if (entry) {
        entry.ingested = true;
        entry.provision_count = 1;
        entry.ingestion_date = today;
      }

      results.push({ act: act.shortName, provisions: 1, definitions: 0, status: 'title-only' });
      titleOnlyCount++;
      processed++;
      continue;
    }

    // Ingestable entries (CDC PDFs)
    try {
      let textContent: string;

      if (fs.existsSync(txtFile) && skipFetch) {
        textContent = fs.readFileSync(txtFile, 'utf-8');
        console.log(`  [${processed + 1}/${acts.length}] Using cached ${act.id} (${(textContent.length / 1024).toFixed(0)} KB text)`);
      } else {
        // Download PDF
        process.stdout.write(`  [${processed + 1}/${acts.length}] Downloading ${act.id}...`);

        if (!fs.existsSync(pdfFile) || force) {
          const pdfUrl = law.pdf_url ?? law.url;
          const ok = await downloadPdf(pdfUrl, pdfFile);
          if (!ok) {
            console.log(' FAILED (download)');
            const entry = censusMap.get(law.id);
            if (entry) entry.classification = 'inaccessible';
            results.push({ act: act.shortName, provisions: 0, definitions: 0, status: 'download failed' });
            failed++;
            processed++;
            continue;
          }
          console.log(` OK (${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB PDF)`);
        } else {
          console.log(` using cached PDF (${(fs.statSync(pdfFile).size / 1024).toFixed(0)} KB)`);
        }

        // Extract text from PDF
        process.stdout.write(`    Extracting text...`);
        try {
          textContent = extractPdfText(pdfFile);
          fs.writeFileSync(txtFile, textContent);
          console.log(` ${(textContent.length / 1024).toFixed(0)} KB text`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.log(` FAILED: ${msg}`);
          const entry = censusMap.get(law.id);
          if (entry) entry.classification = 'inaccessible';
          results.push({ act: act.shortName, provisions: 0, definitions: 0, status: `text extraction failed: ${msg.substring(0, 60)}` });
          failed++;
          processed++;
          continue;
        }
      }

      // Parse the extracted text
      const parsed = parsePdfText(textContent, act);
      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;
      console.log(`    -> ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions`);

      const entry = censusMap.get(law.id);
      if (entry) {
        entry.ingested = true;
        entry.provision_count = parsed.provisions.length;
        entry.ingestion_date = today;
      }

      results.push({
        act: act.shortName,
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        status: 'OK',
      });
      ingested++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR parsing ${act.id}: ${msg}`);
      results.push({ act: act.shortName, provisions: 0, definitions: 0, status: `ERROR: ${msg.substring(0, 80)}` });
      failed++;
    }

    processed++;

    // Checkpoint every 50 acts
    if (processed % 50 === 0) {
      writeCensus(census, censusMap);
      console.log(`  [checkpoint] Census updated at ${processed}/${acts.length}`);
    }
  }

  // Final census update
  writeCensus(census, censusMap);

  // Report
  console.log(`\n${'='.repeat(70)}`);
  console.log('Ingestion Report');
  console.log('='.repeat(70));
  console.log(`\n  Source:      cdc.gov.kh (English PDF translations)`);
  console.log(`  Processed:   ${processed}`);
  console.log(`  New:         ${ingested}`);
  console.log(`  Resumed:     ${skipped}`);
  console.log(`  Title-only:  ${titleOnlyCount}`);
  console.log(`  Failed:      ${failed}`);
  console.log(`  Total provisions:  ${totalProvisions}`);
  console.log(`  Total definitions: ${totalDefinitions}`);

  const failures = results.filter(r =>
    r.status.startsWith('HTTP') || r.status.startsWith('ERROR') ||
    r.status.includes('failed'),
  );
  if (failures.length > 0) {
    console.log(`\n  Failed (${failures.length}):`);
    for (const f of failures) {
      console.log(`    ${f.act}: ${f.status}`);
    }
  }

  const zeroProv = results.filter(r => r.provisions === 0 && r.status === 'OK');
  if (zeroProv.length > 0) {
    console.log(`\n  Zero-provision acts (${zeroProv.length}):`);
    for (const z of zeroProv.slice(0, 20)) {
      console.log(`    ${z.act}`);
    }
    if (zeroProv.length > 20) {
      console.log(`    ... and ${zeroProv.length - 20} more`);
    }
  }

  console.log('');
}

function writeCensus(census: CensusFile, censusMap: Map<string, CensusLawEntry>): void {
  census.laws = Array.from(censusMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  census.summary.total_laws = census.laws.length;
  census.summary.ingestable = census.laws.filter(l => l.classification === 'ingestable').length;
  census.summary.title_only = census.laws.filter(l => l.classification === 'title_only').length;
  census.summary.inaccessible = census.laws.filter(l => l.classification === 'inaccessible').length;
  census.summary.excluded = census.laws.filter(l => l.classification === 'excluded').length;

  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * Cambodia Law MCP -- Census Script
 *
 * Scrapes the camlawbox.com paginated listing (public, no auth) plus
 * the CDC (cdc.gov.kh) laws-and-regulations page to enumerate ALL
 * available Cambodian laws.
 *
 * Sources:
 *   - camlawbox.com   — 8,137 titles (paginated listing, titles only)
 *   - cdc.gov.kh      — ~177 English PDF laws (full text available)
 *
 * Output: data/census.json in golden standard format.
 *
 * Usage:
 *   npx tsx scripts/census.ts
 *   npx tsx scripts/census.ts --cdc-only       # Only census CDC PDFs
 *   npx tsx scripts/census.ts --limit 5        # First 5 pages of camlawbox
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRateLimit } from './lib/fetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const CENSUS_PATH = path.resolve(DATA_DIR, 'census.json');

const CAMLAWBOX_BASE = 'https://www.camlawbox.com';
const CDC_URL = 'https://cdc.gov.kh/laws-and-regulations/';

/* ---------- Types ---------- */

interface CensusLawEntry {
  id: string;
  title: string;
  identifier: string;
  url: string;
  status: 'in_force' | 'amended' | 'repealed';
  category: 'act' | 'regulation' | 'sub_decree' | 'prakas' | 'instruction' | 'notification' | 'other';
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

function parseArgs(): { cdcOnly: boolean; limit: number | null } {
  const args = process.argv.slice(2);
  let cdcOnly = false;
  let limit: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cdc-only') cdcOnly = true;
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { cdcOnly, limit };
}

function slugToId(slug: string): string {
  // Remove leading /laws/ and create a clean ID
  return slug
    .replace(/^\/laws\//, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 120);
}

function classifyLawType(title: string): CensusLawEntry['category'] {
  const t = title.toLowerCase();
  if (/\blaw\b/.test(t) || /\bcode\b/.test(t) || /\bconstitution\b/.test(t)) return 'act';
  if (/\bsub-decree\b|\bsub decree\b/.test(t)) return 'sub_decree';
  if (/\bprakas\b/.test(t)) return 'prakas';
  if (/\binstruction\b/.test(t)) return 'instruction';
  if (/\bnotification\b/.test(t)) return 'notification';
  if (/\bregulation\b|\bcircular\b|\bdecree\b|\broyal decree\b/.test(t)) return 'regulation';
  return 'other';
}

function extractYear(title: string, dateStr?: string): string {
  // Try from title (e.g., "... Law 2025")
  const titleMatch = title.match(/\b(19|20)\d{2}\b/);
  if (titleMatch) return titleMatch[0];
  // Try from date
  if (dateStr) {
    const dateMatch = dateStr.match(/\b(19|20)\d{2}\b/);
    if (dateMatch) return dateMatch[0];
  }
  return '';
}

function parseDate(dateStr: string): string {
  // Parse "DD Mon YYYY" format (e.g., "05 Feb 2026")
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const mon = months[match[2].toLowerCase().substring(0, 3)] ?? '01';
    return `${match[3]}-${mon}-${day}`;
  }
  return '';
}

/* ---------- Camlawbox Census ---------- */

async function censusCamlawbox(pageLimit: number | null): Promise<CensusLawEntry[]> {
  console.log('\n--- Camlawbox.com Census ---\n');
  const entries: CensusLawEntry[] = [];
  const seenSlugs = new Set<string>();

  // Page 1 is the home page with "Database Additions" list
  // Pages 2+ use /laws/page:N
  // Based on research: 272 pages, ~30 items per page
  const maxPage = pageLimit ?? 272;

  for (let page = 1; page <= maxPage; page++) {
    const url = page === 1
      ? `${CAMLAWBOX_BASE}/`
      : `${CAMLAWBOX_BASE}/laws/page:${page}`;

    process.stdout.write(`  Page ${page}/${maxPage}...`);

    try {
      const result = await fetchWithRateLimit(url);

      if (result.status !== 200) {
        console.log(` HTTP ${result.status}`);
        break;
      }

      // Extract law entries from the HTML
      // Format: <li><a href="/laws/SLUG">TITLE</a>\n<span class="label ...">(DATE)</span>
      const entryPattern = /<li><a href="(\/laws\/[a-z][^"]*)">\s*([\s\S]*?)\s*<\/a>\s*<span[^>]*>\(([^)]*)\)<\/span>/gi;
      let match: RegExpExecArray | null;
      let pageCount = 0;

      while ((match = entryPattern.exec(result.body)) !== null) {
        const slug = match[1];
        const title = match[2].replace(/\s+/g, ' ').trim();
        const dateStr = match[3].trim();

        if (seenSlugs.has(slug)) continue;
        seenSlugs.add(slug);

        const id = slugToId(slug);
        const year = extractYear(title, dateStr);
        const date = parseDate(dateStr);
        const category = classifyLawType(title);

        entries.push({
          id,
          title,
          identifier: `kh/${category}/${year}/${id}`,
          url: `${CAMLAWBOX_BASE}${slug}`,
          status: 'in_force',
          category,
          classification: 'title_only', // Individual pages require login
          source: 'camlawbox',
          date,
          year,
          ingested: false,
          provision_count: 0,
          ingestion_date: null,
        });
        pageCount++;
      }

      console.log(` ${pageCount} entries`);

      if (pageCount === 0 && page > 1) {
        console.log('  No more entries found, stopping.');
        break;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(` ERROR: ${msg}`);
      break;
    }
  }

  console.log(`  Total from camlawbox: ${entries.length}`);
  return entries;
}

/* ---------- CDC Census ---------- */

async function censusCdc(): Promise<CensusLawEntry[]> {
  console.log('\n--- CDC.gov.kh Census ---\n');

  process.stdout.write('  Fetching CDC laws page...');
  const result = await fetchWithRateLimit(CDC_URL);
  if (result.status !== 200) {
    console.log(` HTTP ${result.status}`);
    return [];
  }
  console.log(' OK');

  const entries: CensusLawEntry[] = [];
  const seenPdfs = new Set<string>();

  // Extract section headers to assign categories
  // Pattern: <h3>CATEGORY</h3> or <h4>CATEGORY</h4> followed by PDF links
  const html = result.body;

  // Split by section headers
  const sectionPattern = /<h[34][^>]*>(.*?)<\/h[34]>/gi;
  const pdfPattern = /<a[^>]*href="(https:\/\/cdc\.gov\.kh\/wp-content\/uploads\/[^"]*\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;

  // Find all sections and their positions
  const sections: { title: string; start: number; end: number }[] = [];
  let sMatch: RegExpExecArray | null;
  while ((sMatch = sectionPattern.exec(html)) !== null) {
    if (sections.length > 0) {
      sections[sections.length - 1].end = sMatch.index;
    }
    sections.push({
      title: sMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim(),
      start: sMatch.index,
      end: html.length,
    });
  }

  for (const section of sections) {
    const sectionHtml = html.substring(section.start, section.end);
    let pMatch: RegExpExecArray | null;
    const localPdfPattern = new RegExp(pdfPattern.source, pdfPattern.flags);

    while ((pMatch = localPdfPattern.exec(sectionHtml)) !== null) {
      const pdfUrl = pMatch[1];
      let linkText = pMatch[2].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, '').replace(/\s+/g, ' ').trim();

      if (seenPdfs.has(pdfUrl)) continue;
      seenPdfs.add(pdfUrl);

      // Skip Khmer-only PDFs (URLs with Khmer characters or filenames)
      const hasKhmer = /[\u1780-\u17FF]/.test(pdfUrl) || /[\u1780-\u17FF]/.test(linkText);
      if (hasKhmer && linkText.length < 10) continue;

      // Build a title from the link text or PDF filename
      if (!linkText || linkText.length < 5) {
        // Extract from PDF filename
        const filename = pdfUrl.split('/').pop()?.replace('.pdf', '') ?? '';
        linkText = filename
          .replace(/[-_]/g, ' ')
          .replace(/\d{6}$/, '') // Remove trailing dates like _070523
          .trim();
      }

      // Clean up the title
      let title = linkText
        .replace(/^[»\s]+/, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!title || title.length < 3) continue;

      // Generate a stable ID from the PDF filename
      const filename = pdfUrl.split('/').pop()?.replace('.pdf', '') ?? '';
      const id = `cdc-${filename.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 100).toLowerCase()}`;

      const year = extractYear(title, filename);
      const category = classifyLawType(title);

      entries.push({
        id,
        title,
        identifier: `kh/${category}/${year}/${id}`,
        url: pdfUrl,
        status: 'in_force',
        category,
        classification: 'ingestable', // PDFs are publicly accessible
        source: 'cdc',
        pdf_url: pdfUrl,
        cdc_category: section.title,
        year,
        ingested: false,
        provision_count: 0,
        ingestion_date: null,
      });
    }
  }

  // Filter out non-English PDFs (those with mainly Khmer filenames)
  const englishEntries = entries.filter(e => {
    const asciiRatio = e.title.split('').filter(c => c.charCodeAt(0) < 128).length / Math.max(e.title.length, 1);
    return asciiRatio > 0.6;
  });

  console.log(`  Total from CDC: ${entries.length} (${englishEntries.length} English)`);
  return englishEntries;
}

/* ---------- Main ---------- */

async function main(): Promise<void> {
  const { cdcOnly, limit } = parseArgs();

  console.log('Cambodia Law MCP -- Census');
  console.log('=========================\n');
  console.log('  Sources:');
  console.log('    1. camlawbox.com — paginated listing (titles, dates, types)');
  console.log('    2. cdc.gov.kh   — English PDF laws (full text)');
  if (cdcOnly) console.log('  Mode: CDC only');
  if (limit) console.log(`  Page limit: ${limit}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Census CDC PDFs first (these are ingestable)
  const cdcEntries = await censusCdc();

  // Census camlawbox if not --cdc-only
  let camlawboxEntries: CensusLawEntry[] = [];
  if (!cdcOnly) {
    camlawboxEntries = await censusCamlawbox(limit);
  }

  // Merge: CDC entries take priority (they have full text)
  // Camlawbox entries that match CDC entries by title similarity are deduplicated
  const allEntries = [...cdcEntries];
  const cdcTitleSet = new Set(cdcEntries.map(e => e.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()));

  for (const entry of camlawboxEntries) {
    const normalizedTitle = entry.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    // Check if a similar title already exists from CDC
    const isDuplicate = cdcTitleSet.has(normalizedTitle);
    if (!isDuplicate) {
      allEntries.push(entry);
    }
  }

  // Sort by title
  allEntries.sort((a, b) => a.title.localeCompare(b.title));

  // Build census file
  const census: CensusFile = {
    schema_version: '2.0',
    jurisdiction: 'KH',
    jurisdiction_name: 'Cambodia',
    portal: 'cdc.gov.kh + camlawbox.com',
    census_date: new Date().toISOString().split('T')[0],
    agent: 'census.ts',
    summary: {
      total_laws: allEntries.length,
      ingestable: allEntries.filter(e => e.classification === 'ingestable').length,
      title_only: allEntries.filter(e => e.classification === 'title_only').length,
      inaccessible: allEntries.filter(e => e.classification === 'inaccessible').length,
      excluded: allEntries.filter(e => e.classification === 'excluded').length,
      ocr_needed: 0,
    },
    laws: allEntries,
  };

  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2));

  // Report
  console.log('\n' + '='.repeat(60));
  console.log('Census Report');
  console.log('='.repeat(60));
  console.log(`\n  Total laws:       ${census.summary.total_laws}`);
  console.log(`  Ingestable (CDC): ${census.summary.ingestable}`);
  console.log(`  Title only:       ${census.summary.title_only}`);
  console.log(`  Inaccessible:     ${census.summary.inaccessible}`);
  console.log(`  Excluded:         ${census.summary.excluded}`);

  // Category breakdown
  const byCategory = new Map<string, number>();
  for (const e of allEntries) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);
  }
  console.log('\n  By category:');
  for (const [cat, count] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${count}`);
  }

  // Source breakdown
  const bySource = new Map<string, number>();
  for (const e of allEntries) {
    bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
  }
  console.log('\n  By source:');
  for (const [src, count] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${src}: ${count}`);
  }

  console.log(`\n  Output: ${CENSUS_PATH}`);
  console.log('');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

/**
 * Cambodia Law Parser
 *
 * Parses Cambodian legislation from PDF text extracted via pdftotext.
 * Handles multiple document types:
 *   - Laws (Chbab): "Article N" or "Section N" structure
 *   - Sub-Decrees (Anu-Kret): "Article N" structure
 *   - Prakas (ministerial orders): "Article N" structure
 *   - Constitution: "Article N" with Chapters
 *
 * Cambodian legislation typically uses "Article" as the provision unit
 * (influenced by the French civil law tradition).
 *
 * Source: cdc.gov.kh PDF downloads
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ActIndexEntry {
  id: string;
  title: string;
  titleEn: string;
  shortName: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issuedDate: string;
  inForceDate: string;
  url: string;
  description?: string;
  pdfUrl?: string;
  cdcCategory?: string;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: string;
  issued_date: string;
  in_force_date: string;
  url: string;
  description?: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

/**
 * Extract text from a PDF file using pdftotext.
 */
export function extractPdfText(pdfPath: string): string {
  try {
    const result = execSync(`pdftotext -layout "${pdfPath}" -`, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      timeout: 30000,
    });
    return result;
  } catch (error) {
    // Try without -layout flag
    try {
      const result = execSync(`pdftotext "${pdfPath}" -`, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 30000,
      });
      return result;
    } catch {
      throw new Error(`Failed to extract text from PDF: ${pdfPath}`);
    }
  }
}

/**
 * Parse the extracted PDF text to find provisions (articles/sections).
 */
export function parsePdfText(text: string, act: ActIndexEntry): ParsedAct {
  const provisions: ParsedProvision[] = [];
  const definitions: ParsedDefinition[] = [];

  // Clean up the text
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\f/g, '\n') // form feeds
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ');

  const lines = cleaned.split('\n');

  // Track current chapter
  let currentChapter = '';

  // Pattern for article/section headers
  // Cambodian law style: "Article 1:", "Article 1.", "Article 1 -", "ARTICLE 1"
  // Some use "Section" instead
  const articlePattern = /^\s*(?:Article|ARTICLE|Section|SECTION)\s+(\d+[a-z]?(?:bis|ter)?)\s*[.:\-–—]?\s*(.*)/i;
  const chapterPattern = /^\s*(?:CHAPTER|Chapter)\s+([IVXLCDM\d]+)\s*[.:\-–—]?\s*(.*)/i;
  const partPattern = /^\s*(?:PART|Part|TITLE|Title)\s+([IVXLCDM\d]+)\s*[.:\-–—]?\s*(.*)/i;

  let currentArticle: { ref: string; title: string; lines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines within headers
    if (!trimmed) {
      if (currentArticle) {
        currentArticle.lines.push('');
      }
      continue;
    }

    // Check for chapter headers
    const chapterMatch = trimmed.match(chapterPattern);
    if (chapterMatch) {
      // Save previous article
      if (currentArticle) {
        saveArticle(currentArticle, currentChapter, provisions);
        currentArticle = null;
      }
      const chapNum = chapterMatch[1];
      const chapTitle = chapterMatch[2]?.trim() || '';
      // Look ahead for chapter title on next line
      let fullTitle = chapTitle;
      if (!fullTitle && i + 1 < lines.length) {
        const nextLine = lines[i + 1]?.trim();
        if (nextLine && !articlePattern.test(nextLine) && !chapterPattern.test(nextLine)) {
          fullTitle = nextLine;
        }
      }
      currentChapter = `Chapter ${chapNum}${fullTitle ? ': ' + fullTitle : ''}`;
      continue;
    }

    // Check for part/title headers
    const partMatch = trimmed.match(partPattern);
    if (partMatch) {
      if (currentArticle) {
        saveArticle(currentArticle, currentChapter, provisions);
        currentArticle = null;
      }
      const partNum = partMatch[1];
      const partTitle = partMatch[2]?.trim() || '';
      let fullPartTitle = partTitle;
      if (!fullPartTitle && i + 1 < lines.length) {
        const nextLine = lines[i + 1]?.trim();
        if (nextLine && !articlePattern.test(nextLine) && !partPattern.test(nextLine)) {
          fullPartTitle = nextLine;
        }
      }
      currentChapter = `Part ${partNum}${fullPartTitle ? ': ' + fullPartTitle : ''}`;
      continue;
    }

    // Check for article headers
    const articleMatch = trimmed.match(articlePattern);
    if (articleMatch) {
      // Save previous article
      if (currentArticle) {
        saveArticle(currentArticle, currentChapter, provisions);
      }
      const artNum = articleMatch[1];
      const artTitle = articleMatch[2]?.trim() || '';
      currentArticle = {
        ref: artNum,
        title: artTitle,
        lines: [],
      };

      // If the title is empty, the rest of this line might be the start of content
      // or the next line might be the title
      if (!artTitle) {
        // Check next line for title
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1]?.trim();
          if (nextLine && !articlePattern.test(nextLine) && nextLine.length < 200) {
            // Likely a title line
            currentArticle.title = nextLine;
            i++; // skip the title line
          }
        }
      }
      continue;
    }

    // Accumulate content for current article
    if (currentArticle) {
      currentArticle.lines.push(trimmed);
    }
  }

  // Save last article
  if (currentArticle) {
    saveArticle(currentArticle, currentChapter, provisions);
  }

  // If no articles found, try a more relaxed parsing approach
  if (provisions.length === 0) {
    parseRelaxed(cleaned, act, provisions);
  }

  // Extract definitions (look for "Definition" articles or sections)
  for (const prov of provisions) {
    if (/\bdefinit/i.test(prov.title) || /\binterpretation\b/i.test(prov.title)) {
      extractDefinitions(prov.content, prov.provision_ref, definitions);
    }
  }

  return {
    id: act.id,
    type: 'statute',
    title: act.title,
    title_en: act.titleEn,
    short_name: act.shortName,
    status: act.status,
    issued_date: act.issuedDate,
    in_force_date: act.inForceDate,
    url: act.url,
    description: act.description,
    provisions,
    definitions,
  };
}

function saveArticle(
  article: { ref: string; title: string; lines: string[] },
  chapter: string,
  provisions: ParsedProvision[],
): void {
  // Join content lines, trimming excessive blank lines
  const content = article.lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Skip empty articles
  if (!content && !article.title) return;

  provisions.push({
    provision_ref: article.ref,
    chapter: chapter || undefined,
    section: article.ref,
    title: article.title,
    content: content || article.title || `Article ${article.ref}`,
  });
}

/**
 * Relaxed parsing for PDFs that do not use standard Article/Section numbering.
 * Splits by numbered paragraphs or other structural markers.
 */
function parseRelaxed(text: string, act: ActIndexEntry, provisions: ParsedProvision[]): void {
  // Try splitting by numbered paragraphs: "1.", "2.", etc.
  const numberedPattern = /^(\d+)\.\s+/gm;
  const matches = [...text.matchAll(numberedPattern)];

  if (matches.length >= 3) {
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const num = match[1];
      const start = match.index! + match[0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
      const content = text.substring(start, end).trim();

      if (content.length > 10) {
        provisions.push({
          provision_ref: num,
          section: num,
          title: '',
          content,
        });
      }
    }
    return;
  }

  // Fallback: treat the entire document as a single provision
  const cleaned = text.replace(/\n{3,}/g, '\n\n').trim();
  if (cleaned.length > 20) {
    provisions.push({
      provision_ref: '1',
      section: '1',
      title: act.title,
      content: cleaned.substring(0, 50000), // Cap at 50K chars
    });
  }
}

/**
 * Extract legal definitions from a provision's content.
 */
function extractDefinitions(
  content: string,
  sourceProvision: string,
  definitions: ParsedDefinition[],
): void {
  // Pattern: "term" means ... ; or "term" means ... .
  const defPattern = /[""]([^""]+)[""][,\s]*(?:means?|refers?\s+to|shall\s+mean)\s+([^;.]+[;.])/gi;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((match = defPattern.exec(content)) !== null) {
    const term = match[1].trim();
    const definition = match[2].trim();

    if (!seen.has(term.toLowerCase()) && term.length > 1 && definition.length > 5) {
      seen.add(term.toLowerCase());
      definitions.push({
        term,
        definition,
        source_provision: sourceProvision,
      });
    }
  }
}

/**
 * Main parser function called by ingest.ts.
 * Downloads PDF, extracts text, parses provisions.
 */
export function parseCambodiaLawHtml(html: string, act: ActIndexEntry): ParsedAct {
  // For CDC PDFs, `html` is actually the PDF text content (already extracted)
  // For any HTML content (future camlawbox support), parse as HTML
  if (html.startsWith('%PDF')) {
    throw new Error('Raw PDF binary passed -- extract text first using extractPdfText()');
  }

  // If it looks like HTML, try basic HTML parsing
  if (html.includes('<html') || html.includes('<!DOCTYPE')) {
    return parseHtmlContent(html, act);
  }

  // Otherwise, treat as plain text (from pdftotext)
  return parsePdfText(html, act);
}

/**
 * Parse HTML content (for future camlawbox.com support).
 */
function parseHtmlContent(html: string, act: ActIndexEntry): ParsedAct {
  // Strip HTML tags
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '--');

  return parsePdfText(text, act);
}

// Keep backward compatibility with the old export name
export { parseCambodiaLawHtml as parseHtml };

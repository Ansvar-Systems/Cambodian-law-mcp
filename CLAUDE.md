# Cambodia Law MCP Server -- Developer Guide

## Git Workflow

- **Never commit directly to `main`.** Always create a feature branch and open a Pull Request.
- Branch protection requires: verified signatures, PR review, and status checks to pass.
- Use conventional commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, etc.

## Project Overview

Cambodia Law MCP server providing Cambodian legislation search via Model Context Protocol. Strategy A deployment (Vercel, bundled SQLite DB). Covers the Constitution, labor law, taxation, investment, commercial enterprises, customs, land law, forestry, tourism, anti-corruption, and other key Acts.

## Architecture

- **Transport:** Dual-channel -- stdio (npm package) + Streamable HTTP (Vercel serverless)
- **Database:** SQLite + FTS5 via `@ansvar/mcp-sqlite` (WASM-compatible, no WAL mode)
- **Entry points:** `src/index.ts` (stdio), `api/mcp.ts` (Vercel HTTP)
- **Tool registry:** `src/tools/registry.ts` -- shared between both transports
- **Capability gating:** `src/capabilities.ts` -- detects available DB tables at runtime

## Key Conventions

- All database queries use parameterized statements (never string interpolation)
- FTS5 queries go through `buildFtsQueryVariants()` with primary + fallback strategy
- User input is sanitized via `sanitizeFtsInput()` before FTS5 queries
- Every tool returns `ToolResponse<T>` with `results` + `_metadata` (freshness, disclaimer)
- Tool descriptions are written for LLM agents -- explain WHEN and WHY to use each tool
- Capability-gated tools only appear in `tools/list` when their DB tables exist
- Cambodia uses "Article N" for all law types (civil law tradition, French-influenced)

## Testing

- Unit tests: `tests/` (vitest, in-memory SQLite fixtures)
- Contract tests: `__tests__/contract/golden.test.ts` with `fixtures/golden-tests.json`
- Nightly mode: `CONTRACT_MODE=nightly` enables network assertions
- Run: `npm test` (unit), `npm run test:contract` (golden), `npm run validate` (both)

## Database

- Schema defined inline in `scripts/build-db.ts`
- Journal mode: DELETE (not WAL -- required for Vercel serverless)
- Runtime: copied to `/tmp/database.db` on Vercel cold start
- Metadata: `db_metadata` table stores tier, schema_version, built_at, builder
- Env var: `KH_LAW_DB_PATH` overrides default database path

## Data Pipeline

1. `scripts/census.ts` -> enumerates laws from CDC + camlawbox.com -> `data/census.json`
2. `scripts/ingest.ts` -> downloads CDC PDFs, extracts text via pdftotext, parses provisions -> `data/seed/*.json`
3. `scripts/build-db.ts` -> seed JSON -> SQLite database in `data/database.db`
4. `scripts/drift-detect.ts` -> verifies upstream content has not changed

## Data Sources

- **CDC (cdc.gov.kh)**: Council for the Development of Cambodia -- ~175 English PDF translations of key laws
  - License: Government Open Data
  - Language: English
  - Coverage: Constitution, major legislation across all sectors (labor, taxation, investment, commerce, land, environment, etc.)
- **Camlawbox (camlawbox.com)**: Cambodia Law Box -- 8,000+ law titles with dates and types
  - Individual law pages require authentication (title-only in census)
  - Used for census metadata only

## Cambodia-Specific Notes

- Cambodia follows a civil law tradition inherited from French colonial administration
- The Constitution of the Kingdom of Cambodia was adopted on 21 September 1993
- Legislation uses "Article" as the provision unit (not "Section")
- Law types: Laws (Chbab), Sub-Decrees (Anu-Kret), Royal Decrees (Preah Reach Kret), Prakas (ministerial orders), Instructions, Notifications, Circulars
- Khmer is the official language but English translations are available for major laws
- The National Assembly and Senate are the two legislative chambers
- Some PDFs from CDC are scanned images in Khmer (zero provisions extracted via pdftotext)

## Deployment

- Vercel Strategy A: DB bundled in `data/database.db`, included via `vercel.json` includeFiles
- npm package: `@ansvar/cambodian-law-mcp` with bin entry for stdio

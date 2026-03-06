/**
 * Response metadata utilities for Cambodia Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
  note?: string;
  query_strategy?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'Cambodia Law (moj.gov.kh / clc.gov.kh) — Ministry of Justice of Cambodia',
    jurisdiction: 'KH',
    disclaimer:
      'This data is sourced from the Ministry of Justice of Cambodia legal portal. ' +
      'The authoritative versions are maintained by the Ministry of Justice (moj.gov.kh) and the ' +
      'Constitutional Law Center (clc.gov.kh). ' +
      'Always verify with the official Cambodian legal portal (moj.gov.kh).',
    freshness,
  };
}

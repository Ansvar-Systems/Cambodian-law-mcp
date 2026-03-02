# Cambodian Law MCP Server

**The National Assembly of Cambodia alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fcambodian-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/cambodian-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Cambodian-law-mcp?style=social)](https://github.com/Ansvar-Systems/Cambodian-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Cambodian-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Cambodian-law-mcp/actions/workflows/ci.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/INTERNATIONAL_INTEGRATION_GUIDE.md)
[![Provisions](https://img.shields.io/badge/provisions-13%2C691-blue)](docs/INTERNATIONAL_INTEGRATION_GUIDE.md)

Query **7,982 Cambodian laws** -- from the Law on Telecommunications and the Criminal Code to the Law on Commercial Enterprises, Labour Law, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Cambodian legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Cambodian legal research is scattered across the National Assembly website, cambodialawcenter.org, OHCHR Cambodia, and un.org/cambodia. Whether you're:
- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking if a statute is still in force
- A **legal tech developer** building tools on Cambodian law
- A **researcher** tracing Cambodian legislation across national and international frameworks

...you shouldn't need dozens of browser tabs and manual PDF cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Cambodian law **searchable, cross-referenceable, and AI-readable** in both Khmer and English.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://cambodian-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add cambodian-law --transport http https://cambodian-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cambodian-law": {
      "type": "url",
      "url": "https://cambodian-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "cambodian-law": {
      "type": "http",
      "url": "https://cambodian-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/cambodian-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cambodian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/cambodian-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "cambodian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/cambodian-law-mcp"]
    }
  }
}
```

---

## Example Queries

Once connected, just ask naturally:

- *"ស្វែងរក​ច្បាប់​ការ​ការពារ​ទិន្នន័យ​ផ្ទាល់ខ្លួន"* (Search for personal data protection law)
- *"What does the Law on Telecommunications say about data privacy?"*
- *"Find provisions in the Criminal Code about cybercrime"*
- *"ស្វែងរក​ច្បាប់​ការងារ​អំពី​ម៉ោង​ធ្វើការ"* (Search Labour Law provisions on working hours)
- *"Is the Law on Commercial Enterprises still in force?"*
- *"Find provisions about electronic transactions in Cambodian law"*
- *"What ASEAN frameworks does Cambodia's cybersecurity law align with?"*
- *"Validate the citation: Law on Telecommunications, Article 97"*
- *"Build a legal stance on consumer protection obligations in Cambodia"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Laws** | 7,982 laws | Comprehensive Cambodian legislation |
| **Provisions** | 13,691 sections | Full-text searchable with FTS5 |
| **Database Size** | ~17 MB | Optimized SQLite, portable |
| **Languages** | Khmer and English | Bilingual coverage |
| **Freshness Checks** | Automated | Drift detection against official sources |

**Verified data only** -- every citation is validated against official sources (National Assembly of Cambodia, OHCHR Cambodia). Zero LLM-generated content.

---

## Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from national-assembly.org.kh, cambodialawcenter.org, and OHCHR Cambodia official sources
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains law text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by law identifier + chapter/article
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
National Assembly Portal --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                               ^                        ^
                        Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search National Assembly by law title | Search in Khmer or English: *"ទិន្នន័យ​ផ្ទាល់ខ្លួន"* |
| Navigate multi-chapter laws manually | Get the exact provision with context |
| Manual cross-referencing between laws | `build_legal_stance` aggregates across sources |
| "Is this law still in force?" -- check manually | `check_currency` tool -- answer in seconds |
| Find ASEAN/UN basis -- dig through treaty databases | `get_eu_basis` -- linked international frameworks instantly |
| No API, no integration | MCP protocol -- AI-native |

**Traditional:** Search National Assembly portal --> Download PDF --> Search in Khmer --> Cross-reference with another law --> Check OHCHR for UN basis --> Repeat

**This MCP:** *"What does Cambodia's Law on Telecommunications say about data privacy, and how does it align with ASEAN frameworks?"* --> Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across 13,691 provisions with BM25 ranking. Supports Khmer and English queries |
| `get_provision` | Retrieve specific provision by law identifier + chapter/article |
| `check_currency` | Check if a law is in force, amended, or repealed |
| `validate_citation` | Validate citation against database -- zero-hallucination check |
| `build_legal_stance` | Aggregate citations from multiple laws for a legal topic |
| `format_citation` | Format citations per Cambodian conventions (full/short/pinpoint) |
| `list_sources` | List all available laws with metadata, coverage scope, and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### International Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get international frameworks (ASEAN, UN conventions) that a Cambodian law aligns with |
| `get_cambodian_implementations` | Find Cambodian laws implementing a specific international instrument |
| `search_eu_implementations` | Search international documents with Cambodian implementation counts |
| `get_provision_eu_basis` | Get international law references for a specific provision |
| `validate_eu_compliance` | Check alignment status of Cambodian laws against international frameworks |

---

## International Law Alignment

Cambodia is not an EU member state or candidate country. Cambodian law aligns with international frameworks through:

- **ASEAN frameworks** -- Cambodia is an ASEAN founding member; laws on digital economy, data, and trade align with ASEAN agreements
- **UN conventions** -- Cambodia has ratified multiple UN human rights and commercial law conventions
- **OHCHR Cambodia** -- Human rights legislation aligns with UN Human Rights frameworks
- **UNCITRAL** -- Electronic transactions and commercial law follow UNCITRAL model law principles
- **Bar Association of the Kingdom of Cambodia (BAKC)** -- Professional legal practice regulated by the BAKC (bakc.org.kh)

The international bridge tools allow you to explore these alignment relationships -- checking which Cambodian provisions correspond to ASEAN or UN requirements, and vice versa.

> **Note:** International cross-references reflect alignment and treaty obligation relationships. Cambodia adopts its own legislative approach, and the tools help identify where Cambodian and international law address the same domains.

---

## Data Sources & Freshness

All content is sourced from authoritative Cambodian legal databases:

- **[National Assembly of Cambodia](https://national-assembly.org.kh/)** -- Official laws passed by the National Assembly
- **[Cambodia Law Center](https://cambodialawcenter.org/)** -- Comprehensive law database with English translations
- **[OHCHR Cambodia](https://www.ohchr.org/en/countries/cambodia)** -- UN human rights treaty ratifications and related legislation
- **[UN Cambodia](https://cambodia.un.org/)** -- UN-referenced Cambodian legislation

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | National Assembly of Cambodia |
| **Languages** | Khmer and English |
| **Coverage** | 7,982 laws across all legislative areas |
| **Last ingested** | 2026-02-28 |

### Automated Freshness Checks

A GitHub Actions workflow monitors all data sources:

| Check | Method |
|-------|--------|
| **Law amendments** | Drift detection against known provision anchors |
| **New laws** | Comparison against National Assembly index |
| **Repealed laws** | Status change detection |

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from the National Assembly of Cambodia, cambodialawcenter.org, and OHCHR Cambodia. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** -- do not rely solely on this for case law research
> - **Verify critical citations** against primary sources for court filings
> - **International cross-references** reflect alignment relationships, not formal transposition
> - **English translations** are provided for reference; the authoritative text is in Khmer
> - For professional legal advice in Cambodia, consult a member of the **Bar Association of the Kingdom of Cambodia (BAKC)**

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [SECURITY.md](SECURITY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Cambodian-law-mcp
cd Cambodian-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest              # Ingest laws from official sources
npm run build:db            # Rebuild SQLite database
npm run check-updates       # Check for amendments and new laws
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** ~17 MB (efficient, portable)
- **Reliability:** 100% ingestion success rate

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

### [@ansvar/sanctions-mcp](https://github.com/Ansvar-Systems/Sanctions-MCP)
**Offline-capable sanctions screening** -- OFAC, EU, UN sanctions lists. `pip install ansvar-sanctions-mcp`

**70+ national law MCPs** covering Australia, Brazil, Canada, China, Denmark, Finland, France, Germany, Ghana, Iceland, India, Ireland, Israel, Italy, Japan, Kenya, Netherlands, Nigeria, Norway, Singapore, Slovenia, South Korea, Sweden, Switzerland, Thailand, UAE, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Expanded Khmer-language provision coverage
- Court case law (Court of Appeal, Supreme Court decisions)
- Historical law versions and amendment tracking
- Sub-decree and royal decree coverage

---

## Roadmap

- [x] Core law database with FTS5 search
- [x] Full corpus ingestion (7,982 laws, 13,691 provisions)
- [x] International law alignment tools
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Court case law expansion
- [ ] Historical law versions (amendment tracking)
- [ ] Sub-decree and royal decree coverage
- [ ] Expanded English translations

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{cambodian_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Cambodian Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Cambodian-law-mcp},
  note = {7,982 Cambodian laws with 13,691 provisions in Khmer and English}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** National Assembly of Cambodia (public domain)
- **English Translations:** Cambodia Law Center (open access)
- **UN/OHCHR Materials:** United Nations (public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server started as our internal reference tool -- turns out everyone building compliance tools has the same research frustrations.

So we're open-sourcing it. Navigating 7,982 Cambodian laws shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>

import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { atomicWriteFile, Mutex } from "@/lib/store/atomic";
import { normalizeText } from "@/lib/correction/matching";

import {
  correctionFilename,
  parseCorrectionMarkdown,
  renderCorrectionMarkdown,
} from "@/lib/correction/render";
import {
  correctionRecordSchema,
  type CorrectionFilter,
  type CorrectionRecord,
} from "@/lib/correction/schema";

/**
 * Match a configured single-word trigger without treating it as an
 * arbitrary substring. The small inflection set covers common English
 * endings while avoiding false positives such as `leave` in `believe`.
 */
function tokenMatchesKeyword(token: string, keyword: string): boolean {
  if (token === keyword) return true;
  if (token === `${keyword}s` || token === `${keyword}es`) return true;
  if (keyword.endsWith("y") && token === `${keyword.slice(0, -1)}ies`) return true;
  if (token === `${keyword}ed` || token === `${keyword}ing`) return true;
  if (keyword.endsWith("e")) {
    if (token === `${keyword}d` || token === `${keyword.slice(0, -1)}ing`) return true;
  }
  return false;
}

/** Conservative normalization for corroborating content words. */
function retrievalTokenRoot(token: string): string {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ied") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (/[aeiou]ted$/.test(token) && token.length > 5) return token.slice(0, -1);
  if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("ly") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 4) {
    return token.slice(0, -1);
  }
  return token;
}

// Common actors, cadence words, and generic verbs are poor independent
// evidence. They may still be configured as triggers, but they cannot be
// the second signal that turns a broad trigger into a retrieval hit.
const RETRIEVAL_CONTEXT_STOP_WORDS = new Set([
  "annual", "day", "daily", "employee", "month", "monthly", "people",
  "staff", "use", "user", "week", "weekly", "year", "yearly",
]);

// These words make an otherwise broad trigger part of a fact-shaped query.
// For example, "settlement" plus "window" and "dispute" plus "cost" are
// materially narrower than "settle" or "dispute" in isolation.
//
// Every entry must be a generic quantity or interval word that any domain
// would use. Nouns belonging to one corpus ("sla", "retention",
// "allowance") were removed after measurement showed they carried no
// recall — they only imported evaluation vocabulary into the core.
const RETRIEVAL_FACT_QUALIFIERS = new Set([
  "amount", "cost", "fee", "hours", "much", "period", "rate", "window",
]);

export class CorrectionStore {
  private readonly corrections = new Map<string, CorrectionRecord>();
  private readonly writeLock = new Mutex();
  private initialized = false;

  constructor(private readonly directory: string) {}

  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    if (!this.initialized) {
      await this.reload();
      this.initialized = true;
    }
  }

  async reload(): Promise<void> {
    this.corrections.clear();
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch {
      return;
    }
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const markdown = await readFile(join(this.directory, file), "utf8");
      try {
        const record = parseCorrectionMarkdown(markdown);
        this.corrections.set(record.correctionId, record);
      } catch {
        // Skip files that do not parse as valid corrections.
      }
    }
  }

  async save(correction: CorrectionRecord): Promise<void> {
    const record = correctionRecordSchema.parse(correction);
    await this.writeLock.run(async () => {
      await mkdir(this.directory, { recursive: true });
      const markdown = renderCorrectionMarkdown(record);
      await atomicWriteFile(join(this.directory, correctionFilename(record.correctionId)), markdown);
      this.corrections.set(record.correctionId, record);
    });
  }

  get(correctionId: string): CorrectionRecord | undefined {
    return this.corrections.get(correctionId);
  }

  list(filter: CorrectionFilter = {}): CorrectionRecord[] {
    let results = [...this.corrections.values()];
    if (filter.status !== undefined) {
      results = results.filter((record) => record.status === filter.status);
    }
    if (filter.domain !== undefined) {
      results = results.filter((record) => record.domain === filter.domain);
    }
    if (filter.keyword !== undefined) {
      const keyword = filter.keyword.toLowerCase();
      results = results.filter(
        (record) =>
          record.trigger.keywords.some((k) => k.toLowerCase().includes(keyword)) ||
          record.wrongPattern.toLowerCase().includes(keyword) ||
          record.correctAnswer.toLowerCase().includes(keyword),
      );
    }
    return results.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  get size(): number {
    return this.corrections.size;
  }

  match(query: string, domain?: string): CorrectionRecord[] {
    const normalizedQuery = normalizeText(query);
    const tokens = normalizedQuery.split(" ");
    const tokenSet = new Set(tokens);
    const active = this.list({ status: "active", domain });

    return active
      .map((correction) => {
        let score = 0;
        let phraseKeywordHits = 0;
        let qualifiedPhraseKeywordHits = 0;
        let singleKeywordHits = 0;
        let qualifiedSingleKeywordHits = 0;
        let exactKeywordQuery = false;
        const matchedKeywordTokens = new Set<string>();
        const normalizedCorrectionText =
          `${normalizeText(correction.wrongPattern)} ${normalizeText(correction.correctAnswer)}`;
        for (const keyword of correction.trigger.keywords) {
          const needle = normalizeText(keyword);
          if (!needle) continue;
          // Short keywords must match a token exactly — substring matching
          // on 1-2 char keywords would match nearly every query. Multi-word
          // keywords are phrases, so compare them to the normalized query;
          // asking one token to contain "annual leave" can never succeed.
          const isPhrase = needle.includes(" ");
          const hit = isPhrase
            ? ` ${normalizedQuery} `.includes(` ${needle} `)
            : needle.length >= 3
              ? tokens.some((token) => tokenMatchesKeyword(token, needle))
              : tokenSet.has(needle);
          if (hit) {
            for (const token of needle.split(" ")) {
              matchedKeywordTokens.add(retrievalTokenRoot(token));
            }
            if (isPhrase) {
              phraseKeywordHits += 1;
              if (needle.split(" ").some((token) => RETRIEVAL_FACT_QUALIFIERS.has(token))) {
                qualifiedPhraseKeywordHits += 1;
              }
            } else {
              singleKeywordHits += 1;
              if (tokens.some((token) => RETRIEVAL_FACT_QUALIFIERS.has(token))) {
                qualifiedSingleKeywordHits += 1;
              }
            }
            exactKeywordQuery ||= normalizedQuery === needle;
            score += isPhrase ? 4 : 2;
          }
        }
        let entityHit = false;
        for (const entity of correction.trigger.entities) {
          const normalizedEntity = normalizeText(entity);
          if (
            normalizedEntity &&
            ` ${normalizedQuery} `.includes(` ${normalizedEntity} `)
          ) {
            entityHit = true;
            score += 3;
          }
        }
        // Content fallback: corrections stay findable even when trigger
        // keywords were never set at capture time. Requires at least two
        // overlapping tokens so a single shared word is not enough.
        const contentTokens = new Set(
          normalizedCorrectionText
            .split(" ")
            .filter((token) => token.length >= 3)
            .map(retrievalTokenRoot)
            .filter((token) => !RETRIEVAL_CONTEXT_STOP_WORDS.has(token)),
        );
        let contentHits = 0;
        for (const token of tokenSet) {
          if (
            token.length >= 3 &&
            !RETRIEVAL_CONTEXT_STOP_WORDS.has(retrievalTokenRoot(token)) &&
            !matchedKeywordTokens.has(retrievalTokenRoot(token)) &&
            contentTokens.has(retrievalTokenRoot(token))
          ) {
            contentHits += 1;
          }
        }
        if (contentHits >= 2) score += contentHits;

        // Broad triggers are candidates, not proof of relevance. Require an
        // independent signal unless the query is exactly the configured
        // trigger. This rejects "training room", "private car park", and
        // similar near-neighbours without maintaining domain-specific deny
        // lists. Records without triggers keep the two-token content fallback.
        const keywordHits = phraseKeywordHits + singleKeywordHits;
        const qualified =
          exactKeywordQuery ||
          entityHit ||
          (correction.trigger.keywords.length === 1 && singleKeywordHits === 1) ||
          qualifiedPhraseKeywordHits >= 1 ||
          qualifiedSingleKeywordHits >= 1 ||
          keywordHits >= 2 ||
          (phraseKeywordHits >= 1 && contentHits >= 1) ||
          (singleKeywordHits >= 1 && contentHits >= 2) ||
          (keywordHits === 0 && contentHits >= 2);

        return { correction, score, qualified };
      })
      .filter((entry) => entry.qualified)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.correction);
  }
}

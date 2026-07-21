import { CodingAdapter } from "@/lib/adapter/coding";
import {
  DEFAULT_CORRECTIONS_DIR,
  commandActivate,
  commandAdd,
  commandCheck,
  commandInit,
  commandList,
  commandMatch,
  commandValidate,
} from "@/lib/cli/commands";
import { CorrectionStore } from "@/lib/correction/store";
import { idempotencyScenario } from "@/lib/scenario/idempotency";
import { softDeleteScenario } from "@/lib/scenario/soft-delete";
import { tenantIsolationScenario } from "@/lib/scenario/tenant-isolation";
import { secretHandlingScenario } from "@/lib/scenario/secret-handling";

const HELP = `
memosprout — correction intelligence engine

Usage:
  memosprout init [dir]                          Create corrections directory
  memosprout add --domain <d> --wrong <w> --correct <c> [options]
                                                 Add a correction
  memosprout list [--status <s>] [--domain <d>]  List corrections
  memosprout validate <id>                       Validate a correction
  memosprout activate <id>                       Activate a validated correction
  memosprout check <query> <answer>              Check an answer against corrections
  memosprout match <query>                       Find relevant corrections for a query

Options for add:
  --domain <d>       Domain (required): coding, rag-chat, finance, ...
  --wrong <w>        The wrong pattern (required)
  --correct <c>      The correct answer (required)
  --keywords <k>     Comma-separated trigger keywords
  --entities <e>     Comma-separated trigger entities
  --explanation <x>  Explanation text
  --source <s>       Source reference
  --by <b>           Submitted by

Options for list:
  --status <s>       Filter by status: suggested, quarantined, validated, active, deprecated
  --domain <d>       Filter by domain
  --keyword <k>      Filter by keyword
`.trim();

function parseArgs(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      flags[key] = value;
    } else {
      positional.push(args[i]);
    }
  }
  return { positional, flags };
}

function createCodingAdapter(): CodingAdapter {
  const adapter = new CodingAdapter();
  adapter.registerScenario(idempotencyScenario);
  adapter.registerScenario(softDeleteScenario);
  adapter.registerScenario(tenantIsolationScenario);
  adapter.registerScenario(secretHandlingScenario);
  return adapter;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help") {
    console.log(HELP);
    return;
  }

  const { positional, flags } = parseArgs(args.slice(1));
  const correctionsDir = flags.dir ?? DEFAULT_CORRECTIONS_DIR;
  const store = new CorrectionStore(correctionsDir);
  await store.init();

  switch (command) {
    case "init": {
      const result = await commandInit(positional[0] ?? correctionsDir);
      console.log(`Initialized corrections directory: ${result.directory}`);
      break;
    }

    case "add": {
      if (!flags.domain || !flags.wrong || !flags.correct) {
        console.error("Error: --domain, --wrong, and --correct are required.");
        process.exit(1);
      }
      const correction = await commandAdd(store, {
        domain: flags.domain,
        wrongPattern: flags.wrong,
        correctAnswer: flags.correct,
        keywords: flags.keywords?.split(",").map((k) => k.trim()),
        entities: flags.entities?.split(",").map((e) => e.trim()),
        explanation: flags.explanation,
        sourceRef: flags.source,
        submittedBy: flags.by,
      });
      console.log(`Added correction: ${correction.correctionId}`);
      console.log(`  Status: ${correction.status}`);
      console.log(`  Wrong:  ${correction.wrongPattern}`);
      console.log(`  Right:  ${correction.correctAnswer}`);
      break;
    }

    case "list": {
      const result = commandList(store, {
        status: flags.status,
        domain: flags.domain,
        keyword: flags.keyword,
      });
      if (result.total === 0) {
        console.log("No corrections found.");
      } else {
        console.log(`${result.total} correction(s):\n`);
        for (const correction of result.corrections) {
          console.log(`  ${correction.correctionId}  [${correction.status}]  ${correction.domain}`);
          console.log(`    Wrong:   ${correction.wrongPattern}`);
          console.log(`    Correct: ${correction.correctAnswer}`);
          console.log();
        }
      }
      break;
    }

    case "validate": {
      const correctionId = positional[0];
      if (!correctionId) {
        console.error("Error: correction ID is required.");
        process.exit(1);
      }
      const adapter = createCodingAdapter();
      const result = await commandValidate(store, adapter, correctionId);
      console.log(`Validation: ${result.passed ? "PASSED" : "FAILED"}`);
      console.log(`  Detail: ${result.detail}`);
      console.log(`  Status: ${result.newStatus}`);
      break;
    }

    case "activate": {
      const correctionId = positional[0];
      if (!correctionId) {
        console.error("Error: correction ID is required.");
        process.exit(1);
      }
      try {
        const result = await commandActivate(store, correctionId);
        console.log(`Activated: ${result.correctionId} (${result.previousStatus} → ${result.newStatus})`);
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
      break;
    }

    case "check": {
      const query = positional[0];
      const answer = positional[1];
      if (!query || !answer) {
        console.error("Error: query and answer are required.");
        process.exit(1);
      }
      const result = commandCheck(store, query, answer, flags.domain);
      if (result.blocked) {
        console.log("BLOCKED — answer matches a known-wrong pattern:\n");
        for (const match of result.matchedCorrections) {
          console.log(`  Correction: ${match.correctionId}`);
          console.log(`  Correct:    ${match.correctAnswer}`);
          if (match.sourceRef) console.log(`  Source:     ${match.sourceRef}`);
          console.log();
        }
      } else {
        console.log("OK — no known-wrong patterns matched.");
      }
      break;
    }

    case "match": {
      const query = positional[0];
      if (!query) {
        console.error("Error: query is required.");
        process.exit(1);
      }
      const adapter = createCodingAdapter();
      const result = commandMatch(store, adapter, query);
      if (result.corrections.length === 0) {
        console.log("No relevant corrections found.");
      } else {
        console.log(`${result.corrections.length} relevant correction(s):\n`);
        for (const correction of result.corrections) {
          console.log(`  ${correction.correctionId}: ${correction.correctAnswer}`);
        }
        if (result.context) {
          console.log(`\nContext to inject:\n\n${result.context}`);
        }
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

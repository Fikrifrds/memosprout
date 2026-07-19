import { pathInScope } from "@/lib/delivery/get-task-context";
import { createDeterministicId } from "@/lib/domain/ids";
import {
  fileEditTools,
  reflexRuleSchema,
  toolCallSchema,
  type ReflexAction,
  type ReflexDecision,
  type ReflexRule,
  type ToolCall,
} from "@/lib/reflex/schema";

export interface CompileReflexRulesOptions {
  sproutId: string;
  scenario: string;
  guardedPaths: string[];
  description?: string;
  action?: ReflexAction;
}

export function compileReflexRule(options: CompileReflexRulesOptions): ReflexRule {
  const ruleId = createDeterministicId(
    "reflex",
    `${options.sproutId}:${options.scenario}:${[...options.guardedPaths].sort().join(",")}`,
  );
  return reflexRuleSchema.parse({
    ruleId,
    sproutId: options.sproutId,
    scenario: options.scenario,
    description:
      options.description ?? "Do not modify guarded provided or enforcement files.",
    protectedPaths: options.guardedPaths,
    action: options.action ?? "block",
  });
}

function isFileEditTool(tool: string): boolean {
  return (fileEditTools as readonly string[]).includes(tool);
}

export class ReflexGate {
  private readonly rules: ReflexRule[] = [];

  addRule(rule: ReflexRule): void {
    this.rules.push(reflexRuleSchema.parse(rule));
  }

  listRules(): ReflexRule[] {
    return [...this.rules];
  }

  evaluate(toolCall: ToolCall): ReflexDecision {
    const call = toolCallSchema.parse(toolCall);
    if (!isFileEditTool(call.tool) || call.targetPath === undefined) {
      return {
        allowed: true,
        action: "allow",
        matchedRuleId: null,
        reason: "Tool call does not edit a file.",
      };
    }

    for (const rule of this.rules) {
      const matched = rule.protectedPaths.some((protectedPath) =>
        pathInScope(call.targetPath as string, protectedPath),
      );
      if (!matched) continue;
      if (rule.action === "block") {
        return {
          allowed: false,
          action: "block",
          matchedRuleId: rule.ruleId,
          reason: `Blocked: ${rule.description}`,
        };
      }
      return {
        allowed: true,
        action: "warn",
        matchedRuleId: rule.ruleId,
        reason: `Warning: ${rule.description}`,
      };
    }

    return {
      allowed: true,
      action: "allow",
      matchedRuleId: null,
      reason: "No reflex rule matched.",
    };
  }
}

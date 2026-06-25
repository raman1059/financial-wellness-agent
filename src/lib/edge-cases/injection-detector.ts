/**
 * Prompt Injection Detector
 *
 * Scans user messages for patterns that indicate an attempt to override the
 * system prompt, extract model instructions, or manipulate Claude into ignoring
 * its grounding constraints.
 *
 * This is a defence-in-depth layer. The intent classifier already limits which
 * tools Claude can call. This layer catches explicit override attempts and logs
 * them as SUSPICIOUS_REQUEST events so security teams can review patterns.
 *
 * Severity:
 *   HIGH    — direct instruction override attempt; block the request
 *   MEDIUM  — potential injection; allow but log and restrict to general intent
 *   LOW     — weak signal; log silently, no behaviour change
 */

export type InjectionSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface InjectionTrigger {
  pattern: string;
  category: InjectionCategory;
  severity: InjectionSeverity;
}

export type InjectionCategory =
  | "instruction_override"   // "ignore previous instructions"
  | "persona_hijack"         // "you are now DAN", "act as an unrestricted AI"
  | "prompt_leakage"         // "reveal your system prompt", "show your instructions"
  | "delimiter_injection"    // </s>, <|im_start|>, [INST], ##SYSTEM
  | "unicode_exploit"        // RTL override, zero-width chars, invisible text
  | "data_exfiltration"      // attempts to extract payroll data for other users
  | "role_confusion";        // "as a developer", "in developer mode"

export interface InjectionResult {
  isSuspicious: boolean;
  severity: InjectionSeverity;
  triggers: InjectionTrigger[];
  categories: InjectionCategory[];
}

// ─── Pattern catalogue ────────────────────────────────────────────────────────

interface PatternRule {
  re: RegExp;
  category: InjectionCategory;
  severity: InjectionSeverity;
  label: string;
}

const RULES: PatternRule[] = [
  // ── Instruction override (HIGH) ──────────────────────────────────────────
  {
    re: /ignore\s+(all\s+)?(previous|prior|above|earlier|your)\s+(instructions?|prompts?|context|rules?|guidelines?|system)/i,
    category: "instruction_override",
    severity: "HIGH",
    label: "ignore-previous-instructions",
  },
  {
    re: /forget\s+(everything|all|your\s+instructions?|what\s+you\s+(were|have\s+been)\s+(told|given))/i,
    category: "instruction_override",
    severity: "HIGH",
    label: "forget-instructions",
  },
  {
    re: /disregard\s+(your|all|previous|prior|the)\s+(instructions?|rules?|guidelines?|constraints?|prompts?)/i,
    category: "instruction_override",
    severity: "HIGH",
    label: "disregard-instructions",
  },
  {
    re: /override\s+(your|the|all|previous)\s+(instructions?|rules?|constraints?|safety|system)/i,
    category: "instruction_override",
    severity: "HIGH",
    label: "override-instructions",
  },
  {
    re: /new\s+instructions?\s*:/i,
    category: "instruction_override",
    severity: "HIGH",
    label: "new-instructions-prefix",
  },
  {
    re: /from\s+now\s+on[\s,]+you\s+(will|must|should|are\s+to)/i,
    category: "instruction_override",
    severity: "HIGH",
    label: "from-now-on-override",
  },

  // ── Persona hijack (HIGH) ────────────────────────────────────────────────
  {
    re: /\bDAN\b.*\bdo\s+anything\s+now\b/i,
    category: "persona_hijack",
    severity: "HIGH",
    label: "DAN-jailbreak",
  },
  {
    re: /you\s+are\s+now\s+(an?\s+)?(unrestricted|uncensored|unfiltered|evil|jailbroken|freed)/i,
    category: "persona_hijack",
    severity: "HIGH",
    label: "unrestricted-persona",
  },
  {
    re: /pretend\s+(you\s+are|to\s+be)\s+(an?\s+)?(AI|model|assistant|bot)\s+(without|with\s+no|that\s+(ignores?|has\s+no))\s+(rules?|restrictions?|guidelines?|constraints?)/i,
    category: "persona_hijack",
    severity: "HIGH",
    label: "pretend-unrestricted-AI",
  },
  {
    re: /act\s+as\s+(if\s+you\s+(have\s+no|don'?t\s+have)|an?\s+unrestricted|a\s+jailbroken)/i,
    category: "persona_hijack",
    severity: "MEDIUM",
    label: "act-as-unrestricted",
  },

  // ── Prompt leakage (MEDIUM) ──────────────────────────────────────────────
  {
    re: /(reveal|show|print|output|display|tell\s+me|repeat|share)\s+(your|the)\s+(system\s+prompt|instructions?|prompt|context|rules?|guidelines?)/i,
    category: "prompt_leakage",
    severity: "MEDIUM",
    label: "reveal-system-prompt",
  },
  {
    re: /what\s+(are|were)\s+your\s+(initial|original|starting|system)\s+(instructions?|prompt|rules?|guidelines?)/i,
    category: "prompt_leakage",
    severity: "MEDIUM",
    label: "ask-system-prompt",
  },
  {
    re: /(ignore|bypass|circumvent)\s+(your|the)\s+(grounding|safety|financial|tax|payroll)\s+(rules?|checks?|constraints?)/i,
    category: "prompt_leakage",
    severity: "HIGH",
    label: "bypass-grounding-rules",
  },

  // ── Delimiter injection (HIGH) ───────────────────────────────────────────
  {
    re: /<\|im_(start|end|sep)\|>/i,
    category: "delimiter_injection",
    severity: "HIGH",
    label: "chatml-delimiter",
  },
  {
    re: /\[INST\]|\[\/INST\]|\[\[INST\]\]/,
    category: "delimiter_injection",
    severity: "HIGH",
    label: "llama-delimiter",
  },
  {
    re: /<\/?system>|<\/?assistant>|<\/?human>/i,
    category: "delimiter_injection",
    severity: "HIGH",
    label: "role-tag-delimiter",
  },
  {
    re: /###\s*(system|human|assistant|instruction)/i,
    category: "delimiter_injection",
    severity: "HIGH",
    label: "markdown-role-delimiter",
  },
  {
    re: /##\s*SYSTEM|##\s*INSTRUCTIONS?/i,
    category: "delimiter_injection",
    severity: "HIGH",
    label: "system-section-header",
  },

  // ── Unicode exploit (HIGH) ───────────────────────────────────────────────
  {
    // RTL override (U+202E), LTR override (U+202D), zero-width no-break space (U+FEFF),
    // zero-width joiner (U+200D), left-to-right embedding (U+202A)
    re: /[‮‭﻿‍‪‫​‌‎‏]/,
    category: "unicode_exploit",
    severity: "HIGH",
    label: "direction-override-char",
  },

  // ── Data exfiltration (MEDIUM) ───────────────────────────────────────────
  {
    re: /(get|show|fetch|retrieve|access|query)\s+(payroll|salary|tax|document|payslip)\s+(data|records?|information)\s+(for|of|belonging\s+to)\s+(another|other|all|every|any)\s+(user|employee|person)/i,
    category: "data_exfiltration",
    severity: "MEDIUM",
    label: "cross-user-data-request",
  },
  {
    re: /list\s+all\s+(users?|employees?|accounts?)/i,
    category: "data_exfiltration",
    severity: "MEDIUM",
    label: "list-all-users",
  },

  // ── Developer mode / role confusion (LOW) ───────────────────────────────
  {
    re: /\bdeveloper\s+mode\b/i,
    category: "role_confusion",
    severity: "LOW",
    label: "developer-mode",
  },
  {
    re: /\bjailbreak\b/i,
    category: "role_confusion",
    severity: "MEDIUM",
    label: "jailbreak-keyword",
  },
  {
    re: /\buncensored\s+mode\b|\bno\s+filter\s+mode\b/i,
    category: "role_confusion",
    severity: "MEDIUM",
    label: "no-filter-mode",
  },
];

// ─── Highest-severity helper ──────────────────────────────────────────────────

function maxSeverity(triggers: InjectionTrigger[]): InjectionSeverity {
  if (triggers.some((t) => t.severity === "HIGH"))   return "HIGH";
  if (triggers.some((t) => t.severity === "MEDIUM")) return "MEDIUM";
  return "LOW";
}

// ─── Main detector ────────────────────────────────────────────────────────────

export function detectPromptInjection(message: string): InjectionResult {
  const triggers: InjectionTrigger[] = [];
  const categorySet = new Set<InjectionCategory>();

  for (const rule of RULES) {
    if (rule.re.test(message)) {
      triggers.push({
        pattern:  rule.label,
        category: rule.category,
        severity: rule.severity,
      });
      categorySet.add(rule.category);
    }
  }

  return {
    isSuspicious: triggers.length > 0,
    severity:     triggers.length > 0 ? maxSeverity(triggers) : "LOW",
    triggers,
    categories:   [...categorySet],
  };
}

/**
 * Returns a safe user-facing message for HIGH-severity injection attempts.
 * Never discloses what pattern was matched — that would help adversaries tune.
 */
export function injectionRefusalMessage(): string {
  return (
    "Your message contains patterns that this assistant cannot process. " +
    "Please rephrase your question about payroll or tax information."
  );
}

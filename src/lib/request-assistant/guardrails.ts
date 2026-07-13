export type SensitiveContentFlag =
  | "private_key"
  | "api_key_or_token"
  | "credential_assignment"
  | "credential_uri"
  | "jwt_or_session"
  | "config_or_code"
  | "payment_card";

const secretPatterns: Array<{ flag: SensitiveContentFlag; pattern: RegExp }> = [
  {
    flag: "private_key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i,
  },
  {
    flag: "api_key_or_token",
    pattern:
      /\b(?:sk-(?:or-v1-|proj-)?[A-Za-z0-9_-]{16,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})\b/i,
  },
  {
    flag: "api_key_or_token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}\b/i,
  },
  {
    flag: "jwt_or_session",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    flag: "jwt_or_session",
    pattern: /\b(?:session|sessionid|auth[_-]?token|cookie)\s*[:=]\s*["']?[^\s"',;]{10,}/i,
  },
  {
    flag: "credential_uri",
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp|amqps):\/\/[^\s/:@]+:[^\s@]+@[^\s]+/i,
  },
  {
    flag: "credential_assignment",
    pattern:
      /\b(?:[A-Z0-9_]*(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_?KEY|SERVICE_ROLE|DATABASE_URL|REDIS_URL|MONGODB_URI)[A-Z0-9_]*)\s*[:=]\s*["']?[^\s"',;]{6,}/i,
  },
  {
    flag: "credential_assignment",
    pattern: /\b(?:password|passwd|api[_ -]?key|secret|token)\s*[:=]\s*["']?[^\s"',;]{8,}/i,
  },
  {
    flag: "config_or_code",
    pattern: /(?:^|\n)\s*(?:export\s+)?[A-Z][A-Z0-9_]{2,}\s*=\s*[^\s]+/m,
  },
];

function luhnValid(candidate: string) {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

export function scanSensitiveContent(values: string[]) {
  const flags = new Set<SensitiveContentFlag>();

  for (const value of values) {
    for (const check of secretPatterns) {
      if (check.pattern.test(value)) flags.add(check.flag);
    }

    const cardCandidates = value.match(/(?:\d[ -]?){13,19}/g) ?? [];
    if (cardCandidates.some(luhnValid)) flags.add("payment_card");
  }

  return [...flags];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactProviderText(value: string, knownNames: string[] = []) {
  const withoutKnownNames = knownNames.reduce((text, name) => {
    const normalized = name.trim();
    if (normalized.length < 2) return text;
    const escaped = escapeRegExp(normalized);
    return text.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"),
      "[name removed]",
    );
  }, value);

  return withoutKnownNames
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/gi, "[url removed]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, (match) =>
      /^\d{4}-\d{2}-\d{2}$/.test(match) ? match : "[phone removed]",
    )
    .replace(
      /\b(?:my name is|this is)\s+[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3}(?=\s*(?:[,.;!?]|$))/giu,
      "[name removed]",
    )
    .trim();
}

export function containsProviderRestrictedData(values: string[]) {
  return values.some((value) => redactProviderText(value) !== value.trim());
}

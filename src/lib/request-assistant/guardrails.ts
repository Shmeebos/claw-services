export type SensitiveContentFlag =
  | "private_key"
  | "api_key_or_token"
  | "credential_assignment"
  | "payment_card";

const secretPatterns: Array<{ flag: SensitiveContentFlag; pattern: RegExp }> = [
  {
    flag: "private_key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i,
  },
  {
    flag: "api_key_or_token",
    pattern: /\b(?:sk-(?:or-v1-|proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,})\b/,
  },
  {
    flag: "api_key_or_token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}\b/i,
  },
  {
    flag: "credential_assignment",
    pattern: /\b(?:password|passwd|api[_ -]?key|access[_ -]?token|secret|token)\s*[:=]\s*[^\s,;]{8,}/i,
  },
];

function passesLuhn(value: string) {
  let sum = 0;
  let doubleDigit = false;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

function containsPaymentCard(value: string) {
  const candidates = value.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
  });
}

export function scanSensitiveContent(values: string[]) {
  const flags = new Set<SensitiveContentFlag>();

  for (const value of values) {
    for (const rule of secretPatterns) {
      if (rule.pattern.test(value)) flags.add(rule.flag);
    }
    if (containsPaymentCard(value)) flags.add("payment_card");
  }

  return [...flags];
}

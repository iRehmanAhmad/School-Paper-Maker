export type QuestionLanguageMode = "English" | "Urdu" | "Both";

type ParsedBilingualText = {
  english: string;
  urdu: string;
  hasPair: boolean;
};

function normalize(value: string | null | undefined): string {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function parseLabeled(text: string): ParsedBilingualText | null {
  const englishMatch = text.match(/(?:^|\n)\s*(?:en|english)\s*[:\-]\s*([\s\S]*?)(?=(?:\n\s*(?:ur|urdu)\s*[:\-])|$)/i);
  const urduMatch = text.match(/(?:^|\n)\s*(?:ur|urdu)\s*[:\-]\s*([\s\S]*?)$/i);
  if (!englishMatch && !urduMatch) {
    return null;
  }
  const english = normalize(englishMatch?.[1]);
  const urdu = normalize(urduMatch?.[1]);
  if (!english && !urdu) {
    return null;
  }
  return { english: english || urdu, urdu: urdu || english, hasPair: true };
}

export function parseBilingualText(value: string | null | undefined): ParsedBilingualText {
  const text = normalize(value);
  if (!text) {
    return { english: "", urdu: "", hasPair: false };
  }

  const labeled = parseLabeled(text);
  if (labeled) {
    return labeled;
  }

  if (text.includes("||")) {
    const parts = text.split("||");
    const english = normalize(parts[0]);
    const urdu = normalize(parts.slice(1).join("||"));
    if (english || urdu) {
      return { english: english || urdu, urdu: urdu || english, hasPair: true };
    }
  }

  return { english: text, urdu: text, hasPair: false };
}

export function localizeBilingualText(
  value: string | null | undefined,
  mode: QuestionLanguageMode | string | null | undefined,
): string {
  const normalizedMode: QuestionLanguageMode = mode === "Urdu" || mode === "Both" ? mode : "English";
  const parsed = parseBilingualText(value);

  if (!parsed.hasPair) {
    return parsed.english;
  }

  if (normalizedMode === "Urdu") {
    return parsed.urdu || parsed.english;
  }
  if (normalizedMode === "Both") {
    if (parsed.english && parsed.urdu && parsed.english !== parsed.urdu) {
      return `${parsed.english} / ${parsed.urdu}`;
    }
    return parsed.english || parsed.urdu;
  }
  return parsed.english || parsed.urdu;
}

export function localizeAnswerText(
  value: string | null | undefined,
  mode: QuestionLanguageMode | string | null | undefined,
): string {
  const raw = normalize(value);
  if (!raw) {
    return "";
  }

  if (/^[A-D]$/i.test(raw)) {
    return raw.toUpperCase();
  }

  return localizeBilingualText(raw, mode);
}

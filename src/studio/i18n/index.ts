import { useTranslation } from "react-i18next";
import { i18n } from "../../i18";
import { studioEnglish } from "./messages";

export type UiLanguage = "zh" | "en";
export const UI_LANGUAGE_KEY = "momo-dataflow.language";
type LanguageStorage = Pick<Storage, "getItem">;

/** This preference belongs to the browser, never to a design document. */
export function preferredUiLanguage(storage?: LanguageStorage): UiLanguage {
  try {
    const saved = (
      storage ??
      (typeof window !== "undefined" ? window.localStorage : undefined)
    )?.getItem(UI_LANGUAGE_KEY);
    return saved === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

const chinese = Object.fromEntries(
  Object.keys(studioEnglish).map((key) => [key, key]),
);
i18n.addResourceBundle("en", "studio", studioEnglish, true, true);
i18n.addResourceBundle("zh", "studio", chinese, true, true);

export function getUiLanguage(): UiLanguage {
  return i18n.language?.startsWith("zh") ? "zh" : "en";
}

function updateDocumentLanguage(language: UiLanguage) {
  if (typeof document !== "undefined")
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
}

export async function changeUiLanguage(language: UiLanguage) {
  await i18n.changeLanguage(language);
  try {
    if (typeof window !== "undefined")
      window.localStorage.setItem(UI_LANGUAGE_KEY, language);
  } catch {
    /* Language still works when browser storage is unavailable. */
  }
  updateDocumentLanguage(language);
}

const initial = preferredUiLanguage();
void i18n.changeLanguage(initial);
updateDocumentLanguage(initial);

/** Subscribe each UI component without remounting it or discarding form drafts. */
export function useUiLanguage(): UiLanguage {
  useTranslation("studio");
  return getUiLanguage();
}

/** Only call with source-owned UI strings, never table names, field labels or notes. */
export function uiText(key: string, values?: Record<string, unknown>): string {
  return String(
    i18n.t(key, {
      ns: "studio",
      keySeparator: false,
      nsSeparator: false,
      defaultValue: key,
      ...values,
    }),
  );
}

function messagePattern(pattern: string) {
  const names: string[] = [];
  const chunks = pattern.split(/(\{\{v\d+\}\})/g);
  const escaped = chunks
    .map((chunk) => {
      if (/^\{\{v\d+\}\}$/.test(chunk)) {
        names.push(chunk.slice(2, -2));
        return "([\\s\\S]*?)";
      }
      return chunk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return { regex: new RegExp("^" + escaped + "$"), names };
}
const errorPatterns = Object.entries(studioEnglish)
  .filter(([key]) => key.includes("{{v"))
  .flatMap(([key, english]) => [
    { key, ...messagePattern(key) },
    { key, ...messagePattern(english) },
  ]);

const originalByEnglish = new Map(
  Object.entries(studioEnglish).map(([zh, en]) => [en, zh]),
);

/** Translate displayed system errors while preserving captured identifiers and raw technical details. */
export function uiError(value: unknown): string {
  if (value === null || value === undefined) return "";
  const message = value instanceof Error ? value.message : String(value);
  const source = originalByEnglish.get(message) ?? message;
  if (source in studioEnglish) return uiText(source);
  for (const pattern of errorPatterns) {
    const match = pattern.regex.exec(source);
    if (match)
      return uiText(
        pattern.key,
        Object.fromEntries(
          pattern.names.map((name, i) => [name, match[i + 1]]),
        ),
      );
  }
  for (const suffix of [
    "缺失或无效",
    "列表无效或过大",
    "必须是非负整数或空值",
    "必须为UUID",
  ]) {
    if (source.endsWith(suffix)) {
      const label = source.slice(0, -suffix.length);
      if (label in studioEnglish)
        return getUiLanguage() === "en"
          ? `${uiText(label)} ${uiText(suffix)}`
          : source;
    }
  }
  for (const prefix of ["设计包内ID重复：", "导入ID与现有数据冲突，未覆盖"]) {
    if (source.startsWith(prefix))
      return uiText(prefix) + source.slice(prefix.length);
  }
  return message;
}

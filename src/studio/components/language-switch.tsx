import { Languages } from "lucide-react";
import { changeUiLanguage, useUiLanguage, type UiLanguage } from "../i18n";

export function LanguageSwitch() {
  const language = useUiLanguage();
  return (
    <label
      className="studio-language-switch"
      title="界面语言 / Interface language"
    >
      <Languages size={15} aria-hidden="true" />
      <select
        aria-label="界面语言 / Interface language"
        data-testid="ui-language"
        value={language}
        onChange={(event) => {
          void changeUiLanguage(event.target.value as UiLanguage);
        }}
      >
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}

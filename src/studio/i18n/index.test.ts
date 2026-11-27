import { afterEach, describe, expect, it, vi } from "vitest";
import {
  changeUiLanguage,
  preferredUiLanguage,
  UI_LANGUAGE_KEY,
  uiError,
  uiText,
} from "./index";

afterEach(async () => {
  vi.unstubAllGlobals();
  await changeUiLanguage("zh");
});

describe("workbench interface languages", () => {
  it("defaults to Chinese and tolerates blocked preference storage", () => {
    expect(preferredUiLanguage({ getItem: () => null })).toBe("zh");
    expect(preferredUiLanguage({ getItem: () => "fr" })).toBe("zh");
    expect(
      preferredUiLanguage({
        getItem: () => {
          throw Error("blocked");
        },
      }),
    ).toBe("zh");
  });
  it("recognizes a saved English preference", () => {
    expect(
      preferredUiLanguage({
        getItem: (key) => (key === UI_LANGUAGE_KEY ? "en" : null),
      }),
    ).toBe("en");
  });
  it("switches system labels in both directions", async () => {
    await changeUiLanguage("en");
    expect(uiText("表字段")).toBe("Tables and fields");
    expect(uiText("保存关系")).toBe("Save relationship");
    await changeUiLanguage("zh");
    expect(uiText("表字段")).toBe("表字段");
  });
  it("keeps Chinese user-authored names literal inside English labels", async () => {
    const name = "采购表字段 {{token}} <example>";
    await changeUiLanguage("en");
    expect(uiText("编辑字段 {{v0}}", { v0: name })).toBe(`Edit field ${name}`);
  });
  it("persists only the browser language preference", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem } });
    await changeUiLanguage("en");
    expect(setItem).toHaveBeenCalledWith(UI_LANGUAGE_KEY, "en");
  });
  it("still switches if localStorage writes fail", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw Error("denied");
        },
      },
    });
    await expect(changeUiLanguage("en")).resolves.toBeUndefined();
    expect(uiText("已保存")).toBe("Saved");
  });
  it("translates import validation errors without changing identifiers", async () => {
    await changeUiLanguage("en");
    expect(uiError("表名缺失或无效")).toBe("Table name is missing or invalid");
    expect(uiError("设计包不能超过30MiB")).toBe(
      "Design package must not exceed 30 MiB",
    );
    expect(uiError("字段不存在：原始字段ID")).toBe(
      "Field not found: 原始字段ID",
    );
  });
  it("translates dynamic validation messages and keeps business names", async () => {
    await changeUiLanguage("en");
    expect(uiError("匹配条件第 2 行两侧字段都必须选择")).toBe(
      "Choose both fields in match condition 2",
    );
    expect(
      uiError("规则「原业务名称」匹配条件第 1 行类型不兼容：text ↔ numeric"),
    ).toBe(
      "Rule “原业务名称”: incompatible types in match condition 1: text ↔ numeric",
    );
  });
});

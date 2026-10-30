import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CollectionConsent } from "./CollectionConsent";

describe("collection consent disclosure", () => {
  it("describes public raw data and offers separate consent and cancellation", () => {
    const markup = renderToStaticMarkup(
      <CollectionConsent locale="ja" visibility="public" onCancel={vi.fn()} onAgree={vi.fn()} />,
    );
    expect(markup).toContain("ログインしていない人も読み取れます");
    expect(markup).toContain("生レスポンス全体");
    expect(markup).toContain("同意して取得");
    expect(markup).toContain("キャンセル");
    expect(markup).toContain('href="./privacy.html"');
  });

  it("describes private access in English without the public warning", () => {
    const markup = renderToStaticMarkup(
      <CollectionConsent locale="en" visibility="private" onCancel={vi.fn()} onAgree={vi.fn()} />,
    );
    expect(markup).toContain("Only administrators can read");
    expect(markup).not.toContain("Anyone, including visitors");
    expect(markup).toContain("Agree and fetch");
  });
});

import { test, expect } from "bun:test";
import { reduceBrowseState, renderBrowseScreen, type BrowseItem, type BrowseState } from "../src/browseTui";

function mkState(): BrowseState {
  const items: BrowseItem[] = [
    { provider: "clawhub", id: "a", title: "Alpha", sourceUrl: "u1", securityStatus: "verified" },
    { provider: "playbooks", id: "b", title: "Beta", sourceUrl: "u2", securityStatus: "unknown" },
    { provider: "clawhub", id: "c", title: "Gamma", sourceUrl: "u3", securityStatus: "warning" },
  ];
  return { items, filtered: items, cursor: 0, selected: new Set(), filter: "" };
}

test("browse reducer > j/k move cursor", () => {
  let s = mkState();
  s = reduceBrowseState(s, { kind: "down" });
  expect(s.cursor).toBe(1);
  s = reduceBrowseState(s, { kind: "up" });
  expect(s.cursor).toBe(0);
});

test("browse reducer > space toggles selection", () => {
  let s = mkState();
  s = reduceBrowseState(s, { kind: "toggle" });
  expect(s.selected.has("clawhub:a")).toBe(true);
  s = reduceBrowseState(s, { kind: "toggle" });
  expect(s.selected.has("clawhub:a")).toBe(false);
});

test("browse reducer > filter narrows list and resets cursor", () => {
  let s = mkState();
  s = reduceBrowseState(s, { kind: "filter", value: "beta" });
  expect(s.filtered.length).toBe(1);
  expect(s.filtered[0]?.id).toBe("b");
  expect(s.cursor).toBe(0);
});

test("browse render > includes security panel and detail preview for focused item", () => {
  const s = mkState();
  const screen = renderBrowseScreen(s);
  expect(screen).toContain("Security panel");
  expect(screen).toContain("Detail preview");
  expect(screen).toContain("- item: clawhub:a");
  expect(screen).toContain("- title: Alpha");
  expect(screen).toContain("- source: u1");
  expect(screen).toContain("- reasons:");
});

test("browse render > empty filtered set shows no focused result", () => {
  let s = mkState();
  s = reduceBrowseState(s, { kind: "filter", value: "no-match" });
  const screen = renderBrowseScreen(s);
  expect(screen).toContain("(no results)");
  expect(screen).toContain("- no focused result");
});

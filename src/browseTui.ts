import type { ImportSearchResult } from "./importProviders/types";
import { evaluateTrustPolicy } from "./trustPolicy";

export type BrowseItem = ImportSearchResult & { provider: string };

export type BrowseState = {
  items: BrowseItem[];
  filtered: BrowseItem[];
  cursor: number;
  selected: Set<string>;
  filter: string;
};

export type BrowseAction =
  | { kind: "up" }
  | { kind: "down" }
  | { kind: "toggle" }
  | { kind: "filter"; value: string };

function keyOf(item: BrowseItem): string {
  return `${item.provider}:${item.id}`;
}

function applyFilter(items: BrowseItem[], filter: string): BrowseItem[] {
  const q = filter.trim().toLowerCase();
  if (!q) return items;
  return items.filter((x) => `${x.provider} ${x.id} ${x.title} ${x.sourceUrl}`.toLowerCase().includes(q));
}

export function reduceBrowseState(state: BrowseState, action: BrowseAction): BrowseState {
  if (action.kind === "filter") {
    const filtered = applyFilter(state.items, action.value);
    return { ...state, filter: action.value, filtered, cursor: 0 };
  }

  if (state.filtered.length === 0) return state;

  if (action.kind === "up") {
    return { ...state, cursor: state.cursor <= 0 ? 0 : state.cursor - 1 };
  }

  if (action.kind === "down") {
    return { ...state, cursor: Math.min(state.filtered.length - 1, state.cursor + 1) };
  }

  const item = state.filtered[state.cursor]!;
  const k = keyOf(item);
  const selected = new Set(state.selected);
  if (selected.has(k)) selected.delete(k);
  else selected.add(k);
  return { ...state, selected };
}

function activeItem(state: BrowseState): BrowseItem | null {
  if (state.filtered.length === 0) return null;
  return state.filtered[state.cursor] ?? null;
}

export function renderBrowseScreen(state: BrowseState): string {
  const lines: string[] = [];
  lines.push(`replix browse  filter: ${state.filter || "(none)"}`);
  lines.push("j/k or arrows move · space select · enter install · / filter · q quit");
  lines.push("");

  const rows = state.filtered.slice(0, 20);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const active = i === state.cursor ? ">" : " ";
    const mark = state.selected.has(`${r.provider}:${r.id}`) ? "[x]" : "[ ]";
    const trust = evaluateTrustPolicy({ provider: r.provider, sourceUrl: r.sourceUrl, securityStatus: (r.securityStatus ?? "unknown") as any });
    lines.push(`${active} ${mark} ${r.provider}:${r.id}  ${r.title}  sec:${r.securityStatus ?? "unknown"}  trust:${trust.channel}/${trust.riskLevel}`);
  }
  if (rows.length === 0) lines.push("(no results)");

  lines.push("");
  lines.push("Security panel");
  const current = activeItem(state);
  if (!current) {
    lines.push("- no focused result");
    return lines.join("\n");
  }

  const trust = evaluateTrustPolicy({
    provider: current.provider,
    sourceUrl: current.sourceUrl,
    securityStatus: (current.securityStatus ?? "unknown") as any,
  });

  lines.push(`- item: ${current.provider}:${current.id}`);
  lines.push(`- risk: ${trust.riskLevel} (${trust.channel}, score:${trust.score})`);
  lines.push(`- security: ${current.securityStatus ?? "unknown"}`);
  if (current.securityReportUrl) lines.push(`- report: ${current.securityReportUrl}`);
  lines.push("- reasons:");
  for (const reason of trust.reasons) lines.push(`  - ${reason}`);

  lines.push("");
  lines.push("Detail preview");
  lines.push(`- title: ${current.title}`);
  lines.push(`- source: ${current.sourceUrl}`);
  if (current.summary) lines.push(`- summary: ${current.summary}`);
  if (current.tags?.length) lines.push(`- tags: ${current.tags.join(", ")}`);

  return lines.join("\n");
}

export async function runBrowseTui(args: {
  items: BrowseItem[];
  onInstall: (selected: BrowseItem[]) => Promise<void>;
}): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("browse TUI requires an interactive TTY");
  }

  let state: BrowseState = { items: args.items, filtered: args.items, cursor: 0, selected: new Set(), filter: "" };

  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  const repaint = () => {
    process.stdout.write("\x1Bc");
    process.stdout.write(renderBrowseScreen(state) + "\n");
  };

  repaint();

  let filtering = false;

  await new Promise<void>((resolve) => {
    const onData = async (chunk: string) => {
      if (chunk === "\u0003" || chunk === "q") {
        cleanup();
        resolve();
        return;
      }

      if (chunk === "\r") {
        const selected = state.items.filter((x) => state.selected.has(`${x.provider}:${x.id}`));
        const finalSelection = selected.length > 0 ? selected : state.filtered[state.cursor] ? [state.filtered[state.cursor]!] : [];
        cleanup();
        await args.onInstall(finalSelection);
        resolve();
        return;
      }

      if (filtering) {
        if (chunk === "\u001b") {
          filtering = false;
          repaint();
          return;
        }
        if (chunk === "\u007f") {
          state = reduceBrowseState(state, { kind: "filter", value: state.filter.slice(0, -1) });
          repaint();
          return;
        }
        if (/^[\w\s\-_/.:]$/.test(chunk)) {
          state = reduceBrowseState(state, { kind: "filter", value: state.filter + chunk });
          repaint();
        }
        return;
      }

      if (chunk === "/") {
        filtering = true;
        repaint();
        return;
      }

      if (chunk === "j" || chunk === "\u001b[B") state = reduceBrowseState(state, { kind: "down" });
      else if (chunk === "k" || chunk === "\u001b[A") state = reduceBrowseState(state, { kind: "up" });
      else if (chunk === " ") state = reduceBrowseState(state, { kind: "toggle" });

      repaint();
    };

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };

    stdin.on("data", (c) => void onData(c));
  });
}

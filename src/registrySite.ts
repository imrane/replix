import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildLockSnapshot } from "./lockfile";
import { loadDotfilesConfigFromPath, resolveDotfilesConfigPath } from "./resolver/dotfilesConfig";
import { resolveDotfilesSourceToPath } from "./resolver/sourceResolver";
import { loadLocalPack } from "./resolver/localPack";

type RegistryEntry = {
  id: string;
  version: string;
  source: string;
  checksum?: string;
  signer?: string;
  install: string;
};

function html(entries: RegistryEntry[]): string {
  const rows = entries
    .map(
      (e) => `<tr>
<td><code>${e.id}</code></td>
<td>${e.version}</td>
<td><code>${e.checksum?.slice(0, 16) ?? "-"}</code></td>
<td><code>${e.signer ?? "-"}</code></td>
<td><code>${e.install}</code></td>
</tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Replix Pack Registry</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Replix Pack Registry</h1>
  <p>Download/install packs with pinned sources:</p>
  <table>
    <thead><tr><th>Pack</th><th>Version</th><th>Checksum</th><th>Signer</th><th>Install</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export async function buildRegistrySite(params: { cwd: string; outDir?: string }): Promise<{ outDir: string; count: number }> {
  const cfgPath = resolveDotfilesConfigPath({ cwd: params.cwd });
  if (!cfgPath) throw new Error("registry build requires .replix/packs.json or REPLIX_DOTFILES_CONFIG_JSON");

  const cfg = await loadDotfilesConfigFromPath(cfgPath);
  const packs = cfg.packs ?? [];
  const lock = await buildLockSnapshot(cfgPath);
  const lockBySource = new Map(lock.packs.map((p) => [p.source, p]));

  const entries: RegistryEntry[] = [];
  for (const p of packs) {
    const root = await resolveDotfilesSourceToPath(p.source, { allowUnpinned: p.allowUnpinned });
    const local = await loadLocalPack(root);
    const lockEntry = lockBySource.get(p.source);
    entries.push({
      id: local.meta.id,
      version: local.meta.version,
      source: p.source,
      checksum: lockEntry?.integritySha256,
      signer: lockEntry?.signatureKeyId,
      install: `replix pack install ${p.source}`,
    });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  const outDir = params.outDir ?? join(params.cwd, ".replix", "registry");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "index.json"), JSON.stringify({ generatedAt: new Date().toISOString(), packs: entries }, null, 2) + "\n", "utf8");
  await writeFile(join(outDir, "index.html"), html(entries), "utf8");

  return { outDir, count: entries.length };
}

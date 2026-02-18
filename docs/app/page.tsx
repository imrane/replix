function Cmd({ children }: { children: string }) {
  return (
    <pre
      style={{
        background: "#111827",
        color: "#e5e7eb",
        padding: "12px 14px",
        borderRadius: 10,
        overflowX: "auto",
        border: "1px solid #1f2937",
      }}
    >
      <code>{children}</code>
    </pre>
  );
}

export default function HomePage() {
  return (
    <main style={{ maxWidth: 860, margin: "36px auto", padding: "0 20px", lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: 8 }}>Replix Docs</h1>
      <p style={{ opacity: 0.9, marginTop: 0 }}>
        Start here if you want value fast. No Nix needed.
      </p>

      <section style={{ marginTop: 28 }}>
        <h2>Quick start (under 3 minutes)</h2>
        <p style={{ marginTop: 0 }}>What you get: pull one pack, apply it to a repo, and verify it worked.</p>

        <h3>macOS/Linux copy-paste commands</h3>
        <Cmd>{`# 1) go to your repo
cd /path/to/your/repo

# 2) install replix (choose one)
npm i -D replix
# pnpm add -D replix
# bun add -d replix

# 3) add a pack by name (easy mode)
npx replix add github:owner/rpacks starter

# 4) apply
npx replix

# 5) verify
npx replix check`}</Cmd>

        <h3>What each command does</h3>
        <ul>
          <li><code>replix add ... starter</code> picks a named pack without making you type rev/path.</li>
          <li><code>replix</code> applies pack outputs to your repo.</li>
          <li><code>replix check</code> confirms your generated files are in sync.</li>
        </ul>

        <h3>3) Add a pack (easy mode)</h3>
        <Cmd>{`npx replix add github:owner/rpacks starter`}</Cmd>

        <p style={{ marginTop: 8, opacity: 0.9 }}>
          Advanced/reproducible mode: use a pinned source with <code>?rev=...</code> and explicit path.
        </p>

        <h3>4) Run it</h3>
        <Cmd>{`npx replix`}</Cmd>

        <h3>5) Verify</h3>
        <Cmd>{`npx replix check`}</Cmd>
        <p style={{ marginTop: 8 }}>If check is clean, your repo is in sync with the pack config.</p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Beginner path (the happy path)</h2>
        <p style={{ marginTop: 0 }}>If you only remember one flow, remember this:</p>
        <ol>
          <li>
            <strong>Install Replix in your repo</strong> so your project can run packs.
          </li>
          <li>
            <strong>Pull one pack by name</strong> from a pack repo (for example: <code>starter</code>).
          </li>
          <li>
            <strong>Apply + verify</strong> so you know exactly what changed and that it is in sync.
          </li>
        </ol>
        <p style={{ opacity: 0.9 }}>
          Benefit: this gives you value quickly without learning advanced flags first.
        </p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Why this flow works</h2>
        <ul>
          <li>You get a working baseline quickly.</li>
          <li>You can pin versions for reproducible installs.</li>
          <li>You can verify changes before trusting them.</li>
        </ul>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Common first errors</h2>
        <ul>
          <li>
            <strong>"unknown provider"</strong>: use a direct <code>github:</code> or <code>path:</code> source first.
          </li>
          <li>
            <strong>Verifier blocked install</strong>: the converted draft is unsafe or incomplete; use a pinned source.
          </li>
          <li>
            <strong>Missing vars in doctor</strong>: add required secrets in <code>.replix/vars/</code>.
          </li>
        </ul>
      </section>
    </main>
  );
}

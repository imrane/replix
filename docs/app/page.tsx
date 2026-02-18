import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 860, margin: "36px auto", padding: "0 20px", lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: 8 }}>Replix Docs</h1>
      <p style={{ marginTop: 0 }}>Beginner-first docs. Start fast, then go deeper only when needed.</p>
      <p>
        <Link href="/docs/quickstart">Go to Quickstart →</Link>
      </p>
    </main>
  );
}

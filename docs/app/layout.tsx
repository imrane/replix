import type { ReactNode } from "react";

export const metadata = {
  title: "Replix Docs",
  description: "Beginner-first docs for Replix",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Inter, system-ui, sans-serif", margin: 0, background: "#0b1020", color: "#f8fafc" }}>
        {children}
      </body>
    </html>
  );
}

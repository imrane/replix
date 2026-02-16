import { test, expect } from "bun:test";
import { parseGithubSource } from "../src/resolver/sourceResolver";

test("source resolver > parse github ?rev pinned", () => {
  const p = parseGithubSource("github:acme/humanizer?rev=abc123#skills/humanizer");
  expect(p).toEqual({
    owner: "acme",
    repo: "humanizer",
    ref: "abc123",
    subpath: "skills/humanizer",
    include: [],
    floating: false,
  });
});

test("source resolver > parse github branch ref", () => {
  const p = parseGithubSource("github:acme/humanizer/main#skills/humanizer");
  expect(p).toEqual({
    owner: "acme",
    repo: "humanizer",
    ref: "main",
    subpath: "skills/humanizer",
    include: [],
    floating: true,
  });
});

test("source resolver > parse github unpinned default", () => {
  const p = parseGithubSource("github:acme/humanizer#skills/humanizer");
  expect(p).toEqual({
    owner: "acme",
    repo: "humanizer",
    ref: null,
    subpath: "skills/humanizer",
    include: [],
    floating: true,
  });
});

test("source resolver > parse github include allowlist", () => {
  const p = parseGithubSource("github:acme/humanizer?rev=abc123&include=skills/humanizer,commands/review.md#skills/humanizer");
  expect(p).toEqual({
    owner: "acme",
    repo: "humanizer",
    ref: "abc123",
    subpath: "skills/humanizer",
    include: ["skills/humanizer", "commands/review.md"],
    floating: false,
  });
});

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

test("GitHub Pages fallback boots the current app from a repository URL", async () => {
  const dist = new URL("../dist/", import.meta.url);
  const [index, fallback] = await Promise.all([
    readFile(new URL("index.html", dist), "utf8"),
    readFile(new URL("404.html", dist), "utf8"),
  ]);
  const document = new JSDOM(fallback, {
    url: "https://dashboard.example/example/project?branch=main&days=90",
  }).window.document;
  assert.ok(
    document.querySelector("#root"),
    "Fallback must mount the dashboard",
  );
  const entry = document.querySelector('script[type="module"][src]');
  assert.ok(entry, "Fallback must load the app's JavaScript entry point");
  assert.equal(
    entry.getAttribute("src"),
    new JSDOM(index).window.document
      .querySelector('script[type="module"][src]')
      ?.getAttribute("src"),
    "Fallback must load the same app version as the homepage",
  );
  for (const asset of document.querySelectorAll(
    'script[src], link[rel="stylesheet"][href]',
  )) {
    const url = new URL(asset.src ?? asset.href);
    assert.equal(url.origin, "https://dashboard.example");
    const file = await stat(new URL(url.pathname.slice(1), dist));
    assert.ok(
      file.isFile() && file.size > 0,
      `${url.pathname} must resolve from the nested route`,
    );
  }
});

// Builds the self-contained test pages in web/ (they work offline, no server needed).
// Usage: npm install, then npm run build:web
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const pages = [
  { entry: "src/browser.ts", global: "TrucoEngine", template: "web/ui.template.html", out: "web/index.html" },
  { entry: "src/browser-online.ts", global: "TrucoOnline", template: "web/online.template.html", out: "web/online.html" },
];
for (const p of pages) {
  const result = await build({ entryPoints: [p.entry], bundle: true, minify: true, format: "iife", globalName: p.global, write: false });
  const js = result.outputFiles[0].text;
  if (js.includes("</script")) throw new Error("Bundle contains </script; cannot inline it.");
  writeFileSync(p.out, readFileSync(p.template, "utf8").replace("/*ENGINE*/", () => js)); // function form: no $-pattern surprises
  console.log("Wrote " + p.out + " (" + Math.round(readFileSync(p.out).length / 1024) + " KB)");
}

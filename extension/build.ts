import { mkdirSync, existsSync, writeFileSync, copyFileSync } from "fs"
import { join } from "path"

const SRC = import.meta.dir
const DIST = join(SRC, "dist")

async function build() {
  if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true })

  const result = await Bun.build({
    entrypoints: [
      join(SRC, "background.ts"),
      join(SRC, "popup.ts"),
    ],
    outdir: DIST,
    target: "browser",
    format: "esm",
    minify: false,
  })

  if (!result.success) {
    console.error("Build failed:", result.logs)
    process.exit(1)
  }

  copyFileSync(join(SRC, "manifest.json"), join(DIST, "manifest.json"))
  copyFileSync(join(SRC, "popup.html"), join(DIST, "popup.html"))

  const iconsDir = join(DIST, "icons")
  if (!existsSync(iconsDir)) mkdirSync(iconsDir)

  for (const size of [16, 48, 128]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="20" fill="#3b82f6"/>
      <text x="64" y="80" text-anchor="middle" fill="white" font-size="64" font-family="monospace" font-weight="bold">CB</text>
    </svg>`
    writeFileSync(join(iconsDir, `icon${size}.svg`), svg)

    writeFileSync(join(iconsDir, `icon${size}.png`), Buffer.alloc(0))
  }

  console.log("Extension built to:", DIST)
  console.log("Note: Replace placeholder icons in dist/icons/ with real PNGs")
}

build()

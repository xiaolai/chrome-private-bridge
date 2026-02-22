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
    const src = join(SRC, "icons", `icon${size}.png`)
    if (existsSync(src)) {
      copyFileSync(src, join(iconsDir, `icon${size}.png`))
    }
  }

  console.log("Extension built to:", DIST)
}

build()

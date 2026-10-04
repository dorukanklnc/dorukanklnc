// Copies dist/index.html to dist/404.html so static hosts such as GitHub Pages
// serve the app for deep links like /projects/rolebluff.
import { copyFileSync, existsSync } from 'node:fs'

const src = new URL('../dist/index.html', import.meta.url)
const dest = new URL('../dist/404.html', import.meta.url)
if (existsSync(src)) {
  copyFileSync(src, dest)
  console.log('spa-fallback: wrote dist/404.html')
}

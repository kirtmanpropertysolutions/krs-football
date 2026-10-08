// Fast static guard for light/dark mode safety. Runs before every build
// (npm "prebuild", so Vercel deploys fail too) and before the dev server.
//
// It blocks the patterns that caused unreadable text in light mode:
//   - hard-coded Tailwind grays (bg-gray-800, text-zinc-400, border-slate-600 ...)
//     -> use theme tokens: bg-surface-inset, text-fg-dim, border-line-input ...
//   - hard-coded navy hex backgrounds/colors in inline styles (#111827 ...)
//     -> use var(--bg-card), var(--bg-page), var(--text-primary) ...
//   - brand maroon/gold used as TEXT color (too dim on navy or white)
//     -> var(--crimson-text) / text-accent-crimson-text, var(--accent-gold-readable) / text-accent-gold
//   - text colour tokens used as backgrounds (bg-text-muted)
//   - white inline text with no background next to it
//
// A line that genuinely needs one of these (a video player that is black in
// both themes, say) can end with the comment  theme-ok  to opt out.
//
// The full contrast audit (renders every page in both modes) is
// npm run audit:theme.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'src')

const RULES = [
  {
    re: /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|divide|ring|from|via|to|placeholder|outline|fill|stroke|decoration|shadow)-(?:gray|zinc|slate|neutral|stone)-\d{2,3}(?:\/\d+)?(?![\w-])/,
    msg: 'hard-coded Tailwind gray. Use a theme token (bg-surface-inset, bg-surface-inset-strong, border-line-input, border-line-subtle, text-fg-soft, text-fg-dim, text-fg-faint, text-fg-secondary ...).',
  },
  {
    re: /['"`]#(?:0a0e1a|111827|131b2c|0f1729|0f172a|1e293b|1f2937|0F1E36|1B2A4A)\b/i,
    msg: 'hard-coded navy color. Use var(--bg-page), var(--bg-card), var(--bg-card-hover), var(--border-default) or var(--text-primary).',
  },
  {
    re: /rgba\(\s*(?:10\s*,\s*14\s*,\s*26|15\s*,\s*23\s*,\s*41|17\s*,\s*24\s*,\s*39|5\s*,\s*8\s*,\s*18)\s*,/,
    msg: 'hard-coded navy rgba. Use var(--bg-card-hover) or var(--kanban-col-bg).',
  },
  {
    re: /(?<![A-Za-z-])color:\s*['"`]?var\(--(?:crimson|crimson-2|crimson-3|gold|club-primary|club-secondary)\)/,
    msg: 'brand maroon/gold as text color. Use var(--crimson-text) or var(--accent-gold-readable).',
  },
  {
    re: /(?<![\w-])(?:[a-z-]+:)*text-(?:club-primary|club-secondary|brand-primary|brand-gold|accent-crimson)(?:-light|-dark)?(?![\w/-])/,
    msg: 'brand maroon/gold as text color. Use text-accent-crimson-text or text-accent-gold.',
  },
  {
    re: /(?<![\w-])(?:[a-z-]+:)*bg-(?:text-|fg-)[a-z]+(?![\w-])/,
    msg: 'text color token used as a background. Use bg-neutral-solid (with text-white) or a surface token.',
  },
  {
    re: /(?<![A-Za-z-])color:\s*['"`](?:white|#fff|#ffffff)['"`]/i,
    test: (line) => !/background/i.test(line),
    msg: 'white inline text with no background on the same element. Use var(--text-primary), or set the background beside it.',
  },
]

const files = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p)
  }
}
walk(srcDir)

const problems = []
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (/theme-ok/.test(line)) return
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
    if (/^\s*(\*|\/\/|\{\/\*)/.test(line)) return
    for (const r of RULES) {
      if (r.re.test(code) && (!r.test || r.test(code))) {
        problems.push(`${path.relative(root, f)}:${i + 1}  ${r.msg}\n    ${line.trim().slice(0, 160)}`)
      }
    }
  })
}

if (problems.length) {
  console.error(`\nTheme check failed: ${problems.length} problem(s) that break light or dark mode.\n`)
  for (const p of problems) console.error('  ' + p + '\n')
  console.error('Fix these, or end the line with  // theme-ok  if it is truly meant to look the same in both themes.\n')
  process.exit(1)
}
console.log(`Theme check passed (${files.length} files).`)

# 🚨 SECURITY — READ BEFORE EVERY COMMAND

NEVER write a Supabase key as a string literal. Not in JS files. Not in curl commands. Not in shell pipelines. Not in scripts. NOT EVER.

If you need the service role key for a script:
1. Write a Node script in scripts/
2. Add `import 'dotenv/config'` as the FIRST line
3. Use `process.env.SUPABASE_SERVICE_ROLE_KEY`
4. Run it with `node scripts/your-script.mjs`

If you need it for a curl command:
DO NOT. Write a Node script instead. The script can do exactly what curl does using fetch() with the env var.

Pre-commit hook will block any commit with hardcoded keys. predev npm script will refuse to start the dev server if any hardcoded keys exist. These are non-negotiable.
# LIGHT AND DARK MODE — EVERY UI CHANGE

The app has a light mode and a dark mode. Text must be readable in both.

- Use theme tokens only: `bg-surface-card`, `bg-surface-inset`, `bg-surface-inset-strong`, `border-line-input`, `border-line-subtle`, `text-fg-primary`, `text-fg-secondary`, `text-fg-soft`, `text-fg-dim`, `text-fg-faint`, `text-accent-crimson-text`, `text-accent-gold`, or `var(--...)` in inline styles.
- Never hard-code Tailwind grays (`bg-gray-800`, `text-zinc-400`, `border-slate-600`) or navy hex (`#111827`, `#0a0e1a`).
- Brand maroon/gold as TEXT: `var(--crimson-text)` / `var(--accent-gold-readable)`, never `var(--crimson)` / `var(--gold)`.
- Text on a school or brand color: `readableTextOn(color)` from `src/lib/schoolColors.js`.
- `npm run check:theme` runs before every build and commit and blocks these patterns.
- Before pushing any UI change, run `npm run audit:theme`. It renders every page in both modes at desktop and phone size and fails on any hard-to-read text. Add new pages to `scripts/theme-audit/audit.mjs` scenarios.

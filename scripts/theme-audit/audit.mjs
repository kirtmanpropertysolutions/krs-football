// Theme audit: renders every page of the app in light AND dark mode
// against a fake backend and runs axe-core's color-contrast check on all
// visible text. Fails (exit 1) if any text is below WCAG AA contrast.
//
//   npm run audit:theme            (builds first)
//   node scripts/theme-audit/audit.mjs --no-build --shots=<dir>
//
// No network access or real Supabase project is needed. All Supabase
// calls go to a fake host and are answered from fixtures.mjs.
import fs from 'fs'
import path from 'path'
import http from 'http'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { chromium } from 'playwright-core'
import { PNG } from 'pngjs'
import { tablesFor, rpcs, ATHLETE_ID, ADMIN_ID, schools, coaches } from './fixtures.mjs'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = path.join(root, 'node_modules/.theme-audit-dist')
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]))
const shotsDir = args.shots ? path.resolve(args.shots) : null
const only = args.only ? String(args.only).split(',') : null
const MOCK_HOST = 'mock.supabase.co'
const mobile = args.viewport === 'mobile'

// ---------- build ----------
if (!args['no-build']) {
  execSync(`npx vite build --outDir ${outDir} --emptyOutDir`, {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, VITE_SUPABASE_URL: `https://${MOCK_HOST}`, VITE_SUPABASE_PUBLISHABLE_KEY: 'theme-audit-placeholder' },
  })
}

// ---------- static server (SPA fallback) ----------
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/json', '.ico': 'image/x-icon' }
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(outDir, p)
  if (!file.startsWith(outDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(outDir, 'index.html')
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

// ---------- fake Supabase ----------
function filterRows(rows, params) {
  let out = rows
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'or', 'and', 'columns', 'on_conflict'].includes(k)) continue
    const m = /^(not\.)?(eq|neq|in|is|gte|lte|gt|lt|ilike|like)\.(.*)$/.exec(v)
    if (!m) continue
    const [, not, op, raw] = m
    const test = (row) => {
      const val = row[k]
      if (op === 'eq') return String(val) === raw
      if (op === 'neq') return String(val) !== raw
      if (op === 'is') return raw === 'null' ? val == null : String(val) === raw
      if (op === 'in') return raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/"/g, '')).includes(String(val))
      if (op === 'ilike' || op === 'like') return new RegExp('^' + raw.replace(/\*|%/g, '.*') + '$', 'i').test(String(val ?? ''))
      return true
    }
    out = out.filter((row) => (not ? !test(row) : test(row)))
  }
  const limit = params.get('limit')
  return limit ? out.slice(0, Number(limit)) : out
}

function embed(rows, select = '') {
  return rows.map((r) => {
    const o = { ...r }
    if (/schools\s*\(/.test(select) && r.school_id) o.schools = schools.find((s) => s.id === r.school_id) || null
    if (/coaches\s*\(/.test(select) && r.coach_id) o.coaches = coaches.find((c) => c.id === r.coach_id) || null
    return o
  })
}

async function installMock(page, role, mode) {
  const tables = role ? tablesFor(role, mode) : {}
  const userId = role === 'admin' ? ADMIN_ID : ATHLETE_ID
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: role === 'admin' ? 'coach@example.com' : 'player@example.com',
    email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() }
  await page.route(`https://${MOCK_HOST}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.pathname.startsWith('/auth/v1/user')) return role ? json(user) : json({ message: 'no session' }, 401)
    if (url.pathname.startsWith('/auth/v1/')) return json({})
    if (url.pathname.startsWith('/storage/v1/')) return json([])
    if (url.pathname.startsWith('/functions/v1/')) return json({})
    const rpc = /^\/rest\/v1\/rpc\/(\w+)/.exec(url.pathname)
    if (rpc) return json(rpcs[rpc[1]] ? rpcs[rpc[1]]() : [])
    const t = /^\/rest\/v1\/(\w+)/.exec(url.pathname)
    if (!t) return json({})
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return json([])
    const rows = embed(filterRows(tables[t[1]] || [], url.searchParams), url.searchParams.get('select') || '')
    const range = { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` }
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', ...range } })
    if ((req.headers()['accept'] || '').includes('vnd.pgrst.object')) {
      return rows.length ? json(rows[0], 200, range) : json({ code: 'PGRST116', message: 'no rows', details: '', hint: null }, 406)
    }
    return json(rows, 200, range)
  })
  // Anything else on the internet (fonts, video embeds): drop it.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|mock\.supabase\.co)/, (route) => route.abort())

  const session = role ? {
    access_token: 'theme-audit', refresh_token: 'theme-audit', token_type: 'bearer', expires_in: 360000,
    expires_at: Math.floor(Date.now() / 1000) + 360000, user,
  } : null
  await page.addInitScript(({ session, mode, onboarding }) => {
    try {
      localStorage.setItem('krs_color_mode', mode)
      localStorage.setItem('krs_install_dismissed', '1')
      if (!onboarding) localStorage.setItem('krs_onboarded', '1')
      if (session) localStorage.setItem('sb-mock-auth-token', JSON.stringify(session))
    } catch { /* ignore */ }
  }, { session, mode, onboarding: false })
}

// ---------- scenarios ----------
const clickText = (re) => async (page) => {
  const el = page.getByText(re).first()
  await el.click({ timeout: 4000 })
  await page.waitForTimeout(600)
}
const clickRole = (name) => async (page) => {
  await page.getByRole('button', { name }).first().click({ timeout: 4000 })
  await page.waitForTimeout(600)
}

const scenarios = [
  { role: null, name: 'login', path: '/login' },
  { role: null, name: 'signup', path: '/signup' },
  { role: null, name: 'forgot-password', path: '/forgot-password' },
  { role: null, name: 'public-profile', path: `/p/${ATHLETE_ID}` },
  { role: 'athlete', name: 'dashboard', path: '/' },
  { role: 'athlete', name: 'dashboard-onboarding', path: '/', onboarding: true },
  { role: 'athlete', name: 'profile', path: '/profile' },
  { role: 'athlete', name: 'school-fit-quiz', path: '/school-fit-quiz' },
  { role: 'athlete', name: 'coach-finder', path: '/coach-finder' },
  { role: 'athlete', name: 'coach-finder-school-modal', path: '/coach-finder', action: clickText(/University of Washington|Washington/) },
  { role: 'athlete', name: 'my-schools', path: '/my-schools' },
  { role: 'athlete', name: 'outreach-compose', path: '/outreach' },
  { role: 'athlete', name: 'outreach-preview', path: '/outreach', action: clickText(/Initial Contact/) },
  { role: 'athlete', name: 'outreach-preview-coach', path: `/outreach?school=${encodeURIComponent('University of Washington')}&coach_id=${coaches.find((c) => c.email)?.id}`, action: clickText(/Initial Contact/) },
  { role: 'athlete', name: 'outreach-pipeline', path: '/outreach', action: clickRole(/MY PIPELINE/) },
  { role: 'athlete', name: 'outreach-inbox', path: '/outreach', action: clickRole(/INBOX/) },
  { role: 'athlete', name: 'outreach-sent', path: '/outreach', action: clickRole(/SENT/) },
  { role: 'athlete', name: 'recruiting-events', path: '/recruiting-events' },
  { role: 'athlete', name: 'highlights', path: '/highlights' },
  { role: 'athlete', name: 'video-studio', path: '/video-studio' },
  { role: 'athlete', name: 'nil-deals', path: '/nil-deals' },
  { role: 'athlete', name: 'milestones', path: '/milestones' },
  { role: 'athlete', name: 'budget', path: '/budget' },
  { role: 'admin', name: 'admin-dashboard', path: '/admin' },
  { role: 'admin', name: 'admin-athletes', path: '/admin/athletes' },
  { role: 'admin', name: 'admin-invites', path: '/admin/invites' },
  { role: 'admin', name: 'admin-announcements', path: '/admin/announcements' },
  { role: 'admin', name: 'admin-nil-deals', path: '/admin/nil-deals' },
  { role: 'admin', name: 'admin-camps', path: '/admin/camps' },
].filter((s) => !only || only.includes(s.name))


// ---------- pixel check for text axe can't measure (gradients, images) ----------
const lum = (r, g, b) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a, b) => { const [x, y] = [a, b].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

async function pixelCheck(page, target) {
  const info = await page.evaluate((sel) => {
    let el
    try { el = document.querySelector(sel) } catch { return null }
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return null
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden') return null
    let op = 1
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity)
    if (op < 0.05) return null
    const fs = parseFloat(cs.fontSize)
    const bold = parseInt(cs.fontWeight, 10) >= 700
    const color = cs.color // read BEFORE hiding the text
    // Skip text covered by a modal backdrop or overlay: it isn't meant to be read.
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) return null
    el.setAttribute('data-audit-hide', '1')
    if (!document.getElementById('audit-hide-style')) {
      const st = document.createElement('style')
      st.id = 'audit-hide-style'
      st.textContent = '[data-audit-hide], [data-audit-hide] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; border-color: transparent !important; outline: none !important; } [data-audit-hide] svg, [data-audit-hide] img { visibility: hidden !important; }'
      document.head.appendChild(st)
    }
    return { x: r.left, y: r.top, w: r.width, h: r.height, color, opacity: op, large: fs >= 24 || (fs >= 18.66 && bold), vw: innerWidth, vh: innerHeight }
  }, target)
  if (!info) return null
  const x = Math.max(0, Math.floor(info.x)), y = Math.max(0, Math.floor(info.y))
  const w = Math.min(info.vw - x, Math.ceil(info.w)), h = Math.min(info.vh - y, Math.ceil(info.h))
  if (w < 2 || h < 2) { await page.evaluate((sel) => document.querySelector(sel)?.removeAttribute('data-audit-hide'), target); return null }
  // Shot with the text hidden (background only), then with the text shown.
  // Pixels that differ between the two are glyph pixels; contrast is
  // measured only there, against the real background under each glyph.
  const clip = { x, y, width: w, height: h }
  const bgBuf = await page.screenshot({ clip, animations: 'disabled' })
  await page.evaluate((sel) => document.querySelector(sel)?.removeAttribute('data-audit-hide'), target)
  const txBuf = await page.screenshot({ clip, animations: 'disabled' })
  const bgPng = PNG.sync.read(bgBuf), txPng = PNG.sync.read(txBuf)
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(info.color)
  if (!m) return null
  const alpha = (m[4] === undefined ? 1 : parseFloat(m[4])) * info.opacity
  const ratios = []
  for (let i = 0; i < bgPng.data.length; i += 4) {
    const d = Math.abs(bgPng.data[i] - txPng.data[i]) + Math.abs(bgPng.data[i + 1] - txPng.data[i + 1]) + Math.abs(bgPng.data[i + 2] - txPng.data[i + 2])
    if (d < 24) continue
    const br = bgPng.data[i], bg = bgPng.data[i + 1], bb = bgPng.data[i + 2]
    const fr = m[1] * alpha + br * (1 - alpha), fg = m[2] * alpha + bg * (1 - alpha), fb = m[3] * alpha + bb * (1 - alpha)
    ratios.push(ratio(lum(fr, fg, fb), lum(br, bg, bb)))
  }
  if (ratios.length < 8) {
    // Text drew no visible pixels at all: same color as its background.
    const any = bgPng.data.length >= 4
    if (!any) return null
    const br = bgPng.data[0], bg = bgPng.data[1], bb = bgPng.data[2]
    const r0 = ratio(lum(+m[1], +m[2], +m[3]), lum(br, bg, bb))
    return { ratio: Math.round(r0 * 100) / 100, need: info.large ? 3 : 4.5, color: info.color }
  }
  ratios.sort((a, b) => a - b)
  const worst = ratios[Math.floor(ratios.length * 0.1)] // 10th percentile of glyph pixels
  return { ratio: Math.round(worst * 100) / 100, need: info.large ? 3 : 4.5, color: info.color }
}

// ---------- run ----------
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true })
const failures = []
const reviewList = []
const notes = []

for (const mode of ['light', 'dark']) {
  for (const sc of scenarios) {
    const ctx = await browser.newContext(mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await installMock(page, sc.role, mode)
    if (sc.onboarding) await page.addInitScript(() => { try { localStorage.removeItem('krs_onboarded') } catch { /* ignore */ } })
    await page.goto(base + sc.path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    let actionNote = ''
    if (sc.action) {
      try { await sc.action(page) } catch (e) { actionNote = `action failed: ${e.message.split('\n')[0]}` }
    }
    const bodyClass = await page.evaluate(() => document.body.className)
    const text = (await page.evaluate(() => document.body.innerText)).trim()
    if (!bodyClass.includes(mode)) notes.push(`${mode}/${sc.name}: body class is "${bodyClass}"`)
    if (text.length < 40 || /^Loading/.test(text)) notes.push(`${mode}/${sc.name}: page looks empty (${JSON.stringify(text.slice(0, 60))})`)
    if (actionNote) notes.push(`${mode}/${sc.name}: ${actionNote}`)
    if (errors.length) notes.push(`${mode}/${sc.name}: page error ${errors[0]}`)
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${mobile ? 'mobile-' : ''}${mode}-${sc.name}.png`), fullPage: true })

    await page.addScriptTag({ content: axeSource })
    const result = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document, { runOnly: ['color-contrast'], resultTypes: ['violations', 'incomplete'] })
      const pick = (list, kind) => list.flatMap((v) => v.nodes.map((n) => ({
        kind,
        target: n.target.join(' '),
        html: n.html.slice(0, 160),
        summary: (n.any[0]?.message || '').slice(0, 200),
        data: n.any[0]?.data || {},
      })))
      return [...pick(r.violations, 'fail'), ...pick(r.incomplete, 'review')]
    })
    const fails = result.filter((r) => r.kind === 'fail')
    const reviews = []
    const seen = new Set()
    for (const r of result.filter((x) => x.kind === 'review')) {
      if (/too short|non-text/.test(r.summary) || seen.has(r.target)) continue
      seen.add(r.target)
      const px = await pixelCheck(page, r.target).catch(() => null)
      if (!px) { reviews.push(r); continue }
      if (px.ratio < px.need) fails.push({ ...r, kind: 'fail', summary: 'pixel check', data: { fgColor: px.color, bgColor: '(pixels)', contrastRatio: px.ratio, expectedContrastRatio: px.need + ':1' } })
    }
    for (const r of fails) failures.push({ mode, page: sc.name, ...r })
    for (const r of reviews) reviewList.push({ mode, page: sc.name, ...r })
    console.log(`${mobile ? 'phone ' : ''}${mode.padEnd(5)} ${sc.name.padEnd(28)} ${fails.length ? `FAIL ${fails.length}` : 'ok'}${reviews.length ? `  (review ${reviews.length})` : ''}`)
    await ctx.close()
  }
}

await browser.close()
server.close()

if (notes.length) {
  console.log('\nNotes:')
  for (const n of notes) console.log('  ' + n)
}
fs.writeFileSync(path.join(root, 'node_modules/.theme-audit-review.json'), JSON.stringify(reviewList, null, 1))
fs.writeFileSync(path.join(root, 'node_modules/.theme-audit-report.json'), JSON.stringify(failures, null, 1))
if (failures.length) {
  console.log(`\n${failures.length} low-contrast text element(s):`)
  for (const f of failures) {
    console.log(`\n[${f.mode}] ${f.page}  ${f.data.fgColor || ''} on ${f.data.bgColor || ''}  ratio ${f.data.contrastRatio ?? '?'} (needs ${f.data.expectedContrastRatio || '4.5:1'})`)
    console.log('  ' + f.html.replace(/\s+/g, ' '))
  }
  fs.writeFileSync(path.join(root, 'node_modules/.theme-audit-report.json'), JSON.stringify(failures, null, 1))
  process.exit(1)
}
console.log(`\nAll pages pass contrast in light and dark mode (${mobile ? 'phone' : 'desktop'}).`)

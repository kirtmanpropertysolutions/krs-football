// Scrapes public football coaching staff (name, title, email, phone) and the
// recruiting questionnaire link for every school in scripts/data/football-*-2026.json.
//
// Only records emails that literally appear on the school's own athletics pages
// (mailto: links or printed addresses). Never guesses addresses.
//
// Usage: node scripts/football/scrape-coaches.mjs [outFile] [--only=Name1,Name2]
// Needs internet access; run it somewhere with an open network (e.g. a Vercel Sandbox).
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as cheerio from 'cheerio'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const outFile = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(root, 'scripts/data/coaches/scraped.json')
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null

const schools = [
  ...JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/football-fbs-2026.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/football-fcs-2026.json'), 'utf8')),
].filter((s) => !only || only.has(s.name) || only.has(s.short_name))

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE_RE = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/
const COACH_WORDS = /(coach|coordinator|recruit|personnel|director of football|chief of staff|quality control|analyst|graduate assistant)/i
const SKIP_TITLES = /(strength|conditioning|athletic trainer|equipment|video|nutrition|dietitian|sports medicine|massage|chaplain|mental|team physician)/i
const RECRUIT_WORDS = /(recruit|personnel)/i
const Q_HREF = /(questionnaire|collegewarroom|frontrush|jumpforward|armssoftware|recruitform|recruit-form|prospect|xosdigital|teamworksapp|questionnaires|forms\.office|jotform|formstack|airtable|smartsheet)/i
const Q_TEXT = /(questionnaire|recruit form|recruiting form|prospect form|prospective student|prospect info|recruit me|future (tiger|husky|star)|recruiting information)/i

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 20000)
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: ctrl.signal })
      clearTimeout(t)
      if (!res.ok) return { status: res.status, html: null, url: res.url }
      const html = await res.text()
      return { status: res.status, html, url: res.url }
    } catch (e) {
      if (attempt === 1) return { status: 0, html: null, error: String(e.message || e) }
      await sleep(1500)
    }
  }
}

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
const decodeCf = (hex) => {
  // Cloudflare email protection: data-cfemail
  const key = parseInt(hex.slice(0, 2), 16)
  let out = ''
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key)
  return out
}

function emailsIn($, el) {
  const found = new Set()
  $(el).find('a[href^="mailto:"]').each((_, a) => {
    const m = ($(a).attr('href') || '').replace(/^mailto:/i, '').split('?')[0].trim()
    if (m.includes('@')) found.add(m.toLowerCase())
  })
  $(el).find('[data-cfemail]').each((_, a) => {
    try { found.add(decodeCf($(a).attr('data-cfemail')).toLowerCase()) } catch {}
  })
  // Text addresses: strip tags to spaces so adjacent cells don't run together
  const txt = ($(el).html() || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
  for (const m of txt.match(EMAIL_RE) || []) found.add(m.toLowerCase())
  return [...found].filter((e) => !/example\.com|sidearm|wixpress|sentry/.test(e))
}

// Parse a Sidearm-style coaches page or any page with coach rows/cards.
function parseCoaches($, pageUrl) {
  const people = []
  const seen = new Set()
  const push = (name, title, email, phone) => {
    name = clean(name).replace(/^(name|coach)\s*:?\s*/i, '')
    title = clean(title)
    if (!name || name.length > 60 || name.split(' ').length > 6) return
    if (!title || !COACH_WORDS.test(title) || SKIP_TITLES.test(title)) return
    const key = name.toLowerCase()
    if (seen.has(key)) {
      const p = people.find((x) => x.name.toLowerCase() === key)
      if (p && !p.email && email) p.email = email
      return
    }
    seen.add(key)
    people.push({ name, title, email: email || null, phone: phone || null, is_recruiting_contact: RECRUIT_WORDS.test(title), source_url: pageUrl })
  }

  // 1) Table rows (Sidearm table view and many others)
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td,th').map((__, c) => clean($(c).text())).get()
    if (cells.length < 2) return
    const emails = emailsIn($, tr)
    const titleIdx = cells.findIndex((c) => COACH_WORDS.test(c))
    if (titleIdx < 0) return
    const nameCell = cells.find((c, i) => i !== titleIdx && c && !c.includes('@') && !PHONE_RE.test(c) && /^[A-Za-z.'\- ]+$/.test(c) && c.split(' ').length >= 2)
    const phone = (cells.join(' ').match(PHONE_RE) || [null])[0]
    push(nameCell, cells[titleIdx], emails[0], phone)
  })

  // 2) Card layouts (Sidearm cards, WMT, PrestoSports)
  const cardSel = [
    '.sidearm-coaches-coach', '.s-person-card', '.sidearm-staff-member', '[class*="coach-card"]', '[class*="staff-card"]',
    '[class*="person-card"]', '.roster-staff-members-card-item', '.c-rosterpage__players-list-item', '.coach', '.staff-member',
  ].join(',')
  $(cardSel).each((_, card) => {
    const $c = $(card)
    const name = $c.find('[class*="name"], h3, h4, h5').first().text()
    let title = $c.find('[class*="title"], [class*="position"], [class*="details"] span').first().text()
    if (!COACH_WORDS.test(title)) {
      const t = $c.text().split('\n').map(clean).find((l) => COACH_WORDS.test(l) && l.length < 120)
      if (t) title = t
    }
    const emails = emailsIn($, card)
    const phone = ($c.text().match(PHONE_RE) || [null])[0]
    push(name, title, emails[0], phone)
  })
  return people
}

// Sidearm staff directory: rows grouped under category headers; keep the Football group.
function parseStaffDirectory($, pageUrl) {
  const people = []
  let inFootball = false
  $('table tr').each((_, tr) => {
    const $tr = $(tr)
    const cells = $tr.find('td,th')
    const text = clean($tr.text())
    const isHeader = cells.length <= 1 || $tr.find('th').length === cells.length || /category|heading/i.test($tr.attr('class') || '')
    if (isHeader) {
      inFootball = /\bfootball\b/i.test(text) && !/flag football|women/i.test(text)
      return
    }
    if (!inFootball) return
    const vals = cells.map((__, c) => clean($(c).text())).get()
    const emails = emailsIn($, tr)
    const title = vals.find((v) => COACH_WORDS.test(v)) || vals[1]
    const name = vals[0]
    const phone = (vals.join(' ').match(PHONE_RE) || [null])[0]
    if (name && title && !SKIP_TITLES.test(title) && COACH_WORDS.test(title)) {
      people.push({ name, title, email: emails[0] || null, phone, is_recruiting_contact: RECRUIT_WORDS.test(title), source_url: pageUrl })
    }
  })
  return people
}

function findQuestionnaire($, pageUrl) {
  const hits = []
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || ''
    const text = clean($(a).text())
    if (/^(mailto|tel|javascript):/i.test(href)) return
    if (Q_HREF.test(href) || Q_TEXT.test(text)) {
      let abs
      try { abs = new URL(href, pageUrl).toString() } catch { return }
      let score = 0
      if (/football/i.test(href + ' ' + text)) score += 3
      if (/questionnaire/i.test(href + ' ' + text)) score += 3
      if (/collegewarroom|frontrush|jumpforward|armssoftware|teamworks/i.test(href)) score += 2
      if (/(women|softball|volleyball|soccer|basketball|baseball|lacrosse|golf|tennis|swim|track|rowing|hockey|wrestling|gymnastics|cheer|dance)/i.test(href + ' ' + text)) score -= 5
      if (/camp|ticket|donat|shop|store/i.test(href + ' ' + text)) score -= 4
      hits.push({ url: abs, score, text })
    }
  })
  hits.sort((a, b) => b.score - a.score)
  return hits[0] && hits[0].score > 0 ? hits[0] : null
}

function mergePeople(a, b) {
  const out = [...a]
  for (const p of b) {
    const m = out.find((x) => x.name.toLowerCase() === p.name.toLowerCase())
    if (m) { if (!m.email && p.email) { m.email = p.email; m.source_url = p.source_url } if (!m.phone && p.phone) m.phone = p.phone }
    else out.push(p)
  }
  return out
}

async function scrapeSchool(s) {
  const base = (s.athletics_website || '').replace(/\/$/, '')
  const result = { name: s.name, questionnaire_url: null, questionnaire_found_on: null, program_email: null, coaches: [], notes: [] }
  if (!base) { result.notes.push('no athletics website'); return result }

  const coachUrls = [`${base}/sports/football/coaches`, `${base}/sports/football/coaches?view=2`, `${base}/sports/fball/coaches/index`, `${base}/sports/football/staff`]
  let coachPage = null
  for (const u of coachUrls) {
    const r = await get(u)
    if (r.html && /coach/i.test(r.html)) { coachPage = r; break }
  }
  const pages = []
  if (coachPage) {
    const $ = cheerio.load(coachPage.html)
    result.coaches = parseCoaches($, coachPage.url)
    pages.push([$, coachPage.url])
  } else result.notes.push('coaches page not reachable')

  const withEmail = result.coaches.filter((c) => c.email).length
  if (withEmail < 3) {
    for (const u of [`${base}/staff-directory`, `${base}/staff.aspx`, `${base}/staff-directory?path=football`]) {
      const r = await get(u)
      if (r.html && /football/i.test(r.html)) {
        const $ = cheerio.load(r.html)
        result.coaches = mergePeople(result.coaches, parseStaffDirectory($, r.url))
        pages.push([$, r.url])
        break
      }
    }
  }

  // Questionnaire: coaches page, football landing, recruiting page
  let q = null
  for (const [$, u] of pages) { q = q || findQuestionnaire($, u) }
  if (!q || !/questionnaire|collegewarroom|frontrush|jumpforward|armssoftware|teamworks/i.test(q.url)) {
    for (const u of [`${base}/sports/football`, `${base}/sports/football/recruiting`, `${base}/sports/football/questionnaire`, `${base}/sb_output.aspx?form=3`]) {
      const r = await get(u)
      if (!r.html) continue
      const $ = cheerio.load(r.html)
      const cand = findQuestionnaire($, r.url)
      if (cand && (!q || cand.score > q.score)) q = cand
      if (/questionnaire|form/i.test(u) && r.status === 200 && /questionnaire|prospect/i.test(r.html) && !q) {
        q = { url: r.url, score: 1, text: 'questionnaire page' }
      }
      if (q && q.score >= 6) break
    }
  }
  if (q) { result.questionnaire_url = q.url; result.questionnaire_found_on = base }

  // Program email: a football@ / recruiting-style address printed on the pages
  for (const [$] of pages) {
    const all = emailsIn($, 'body')
    const prog = all.find((e) => /football|fb|recruit/i.test(e.split('@')[0]))
    if (prog && !result.coaches.some((c) => c.email === prog)) { result.program_email = prog; break }
  }
  result.notes = result.notes.join('; ') || null
  return result
}

async function main() {
  const out = []
  let i = 0
  const CONC = 6
  async function worker() {
    while (i < schools.length) {
      const s = schools[i++]
      try {
        const r = await scrapeSchool(s)
        out.push(r)
        console.log(`${out.length}/${schools.length} ${s.short_name}: ${r.coaches.length} coaches, ${r.coaches.filter((c) => c.email).length} emails, q=${r.questionnaire_url ? 'yes' : 'no'}`)
      } catch (e) {
        out.push({ name: s.name, coaches: [], questionnaire_url: null, notes: 'error: ' + e.message })
        console.log(`ERR ${s.short_name}: ${e.message}`)
      }
      if (out.length % 10 === 0) fs.writeFileSync(outFile, JSON.stringify(out, null, 1))
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))
  const order = new Map(schools.map((s, idx) => [s.name, idx]))
  out.sort((a, b) => order.get(a.name) - order.get(b.name))
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1))
  const coaches = out.flatMap((r) => r.coaches)
  console.log(`DONE schools=${out.length} coaches=${coaches.length} withEmail=${coaches.filter((c) => c.email).length} schoolsWithEmail=${out.filter((r) => r.coaches.some((c) => c.email) || r.program_email).length} questionnaires=${out.filter((r) => r.questionnaire_url).length}`)
}

main()

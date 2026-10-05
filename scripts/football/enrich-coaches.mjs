// Second pass: finds more public coach emails.
//  1. Opens each coach's own bio page (most Sidearm sites print the email there,
//     even when the staff list hides it) for coaches still missing an email.
//  2. Always checks the athletics staff directory (several URL variants).
//  3. Retries schools whose coaches page was unreachable in the first pass,
//     with alternate URLs.
// Reads scripts/data/coaches/coaches.json, writes scripts/data/coaches/enriched.json.
// Only records addresses printed on the school's own pages — never guesses.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as cheerio from 'cheerio'
import { get, parseCoaches, parseStaffDirectory, emailsIn, findQuestionnaire, mergePeople, clean } from './scrape-coaches.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const inFile = path.join(root, 'scripts/data/coaches/coaches.json')
const outFile = path.join(root, 'scripts/data/coaches/enriched.json')
const schools = Object.fromEntries([
  ...JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/football-fbs-2026.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/football-fcs-2026.json'), 'utf8')),
].map((s) => [s.name, s]))
const data = JSON.parse(fs.readFileSync(inFile, 'utf8'))

const norm = (n) => clean(n).toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()
const lastName = (n) => norm(n).split(' ').filter(Boolean).pop() || ''

// Links on a coaches page that point at an individual coach bio.
function bioLinks($, pageUrl) {
  const links = new Map()
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || ''
    if (!/\/(roster\/)?coaches\/[^/?#]+\/\d+|\/staff-directory\/[^/?#]+\/\d+|\/coaches\/[a-z0-9-]+\/?$|bio\.aspx|coaches\.aspx\?rc=|staff\.aspx\?staff=/i.test(href)) return
    const text = clean($(a).text())
    let abs
    try { abs = new URL(href, pageUrl).toString() } catch { return }
    if (text && text.split(' ').length >= 2 && text.length < 50 && !/full bio|view|email|more/i.test(text)) links.set(norm(text), abs)
    else if (!links.has(abs)) links.set(abs, abs)
  })
  return links
}

function emailForPerson($, name) {
  // Prefer an address near the person's name, else the only personal-looking address on the page.
  const all = emailsIn($, 'body').filter((e) => !/^(athletics|info|tickets|compliance|webmaster|sid|media|communications|football)@/.test(e))
  if (all.length === 1) return all[0]
  const ln = lastName(name)
  const first = norm(name).split(' ')[0] || ''
  return all.find((e) => e.split('@')[0].includes(ln) || (first.length > 2 && e.split('@')[0].startsWith(first[0]) && e.split('@')[0].includes(ln.slice(0, 4)))) || null
}

async function enrichSchool(rec) {
  const s = schools[rec.name] || {}
  const base = (s.athletics_website || '').replace(/\/$/, '')
  const before = rec.coaches.filter((c) => c.email).length
  if (!base) return { ...rec, added_emails: 0 }
  let coaches = rec.coaches.map((c) => ({ ...c }))
  const notes = []

  // A. coaches page again (alternate URLs too), collect bio links
  let page = null
  for (const u of [`${base}/sports/football/coaches`, `${base}/sports/football/coaches?view=1`, `${base}/sports/football/roster/coaches`, `${base}/sports/m-footbl/coaches/index`, `${base}/sports/fball/coaches`, `${base}/sport/m-footbl/coaches`]) {
    const r = await get(u)
    if (r.html && /coach/i.test(r.html)) { page = r; break }
  }
  if (page) {
    const $ = cheerio.load(page.html)
    if (coaches.length === 0) coaches = parseCoaches($, page.url)
    else coaches = mergePeople(coaches, parseCoaches($, page.url))
    if (!rec.questionnaire_url) {
      const q = findQuestionnaire($, page.url)
      if (q) rec.questionnaire_url = q.url
    }
    const links = bioLinks($, page.url)
    // B. bio pages for coaches missing email (cap per school)
    let fetched = 0
    for (const c of coaches) {
      if (c.email || fetched >= 30) continue
      const url = links.get(norm(c.name)) || [...links.entries()].find(([k]) => k.includes(lastName(c.name)) && k.includes(norm(c.name).split(' ')[0]))?.[1]
      if (!url) continue
      fetched++
      const r = await get(url)
      if (!r.html) continue
      const $b = cheerio.load(r.html)
      const e = emailForPerson($b, c.name)
      if (e) { c.email = e; c.source_url = r.url }
    }
  } else notes.push('coaches page still unreachable')

  // C. staff directory variants, always
  for (const u of [`${base}/staff-directory`, `${base}/staff-directory?path=football`, `${base}/staff.aspx`, `${base}/staff-directory?sport=football`, `${base}/sports/football/staff`]) {
    const r = await get(u)
    if (!r.html || !/football/i.test(r.html)) continue
    const $ = cheerio.load(r.html)
    const fromDir = parseStaffDirectory($, r.url)
    if (fromDir.length) { coaches = mergePeople(coaches, fromDir); break }
  }

  const after = coaches.filter((c) => c.email).length
  return { ...rec, coaches, added_emails: after - before, notes: [rec.notes, ...notes].filter(Boolean).join('; ') || null }
}

const out = []
let i = 0
async function worker() {
  while (i < data.length) {
    const rec = data[i++]
    try {
      const r = await enrichSchool(rec)
      out.push(r)
      console.log(`${out.length}/${data.length} ${rec.name}: +${r.added_emails} emails (${r.coaches.filter((c) => c.email).length}/${r.coaches.length})`)
    } catch (e) {
      out.push({ ...rec, added_emails: 0 })
      console.log(`ERR ${rec.name}: ${e.message}`)
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker))
const order = new Map(data.map((r, idx) => [r.name, idx]))
out.sort((a, b) => order.get(a.name) - order.get(b.name))
fs.writeFileSync(outFile, JSON.stringify(out, null, 1))
const co = out.flatMap((r) => r.coaches)
console.log(`DONE coaches=${co.length} withEmail=${co.filter((c) => c.email).length} added=${out.reduce((n, r) => n + (r.added_emails || 0), 0)} questionnaires=${out.filter((r) => r.questionnaire_url).length}`)

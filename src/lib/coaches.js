import { supabase } from './supabase'

// Supabase returns at most 1,000 rows per request, and the football coach
// table holds several thousand. Page through it so nothing is cut off.
export async function loadAllCoaches(select = '*, schools(name, short_name, id)') {
  const PAGE = 1000
  let from = 0
  const rows = []
  for (;;) {
    const { data, error } = await supabase
      .from('coaches')
      .select(select)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return { data: rows, error: null }
}

const isHeadCoach = (c) => /^head (football )?coach/i.test(c.title || '')

// Recruiting contacts with an email first, then other coaches with email,
// then the head coach, then everyone else.
export function rankCoach(c) {
  let r = 0
  if (c.is_recruiting_contact && c.email) r -= 40
  if (c.email) r -= 20
  if (isHeadCoach(c)) r -= 10
  if (c.is_recruiting_contact) r -= 5
  return r
}

export function sortCoaches(list) {
  return [...(list || [])].sort((a, b) => rankCoach(a) - rankCoach(b) || (a.name || '').localeCompare(b.name || ''))
}

// Best person to email at a school, or null.
export function bestContact(list) {
  const withEmail = sortCoaches(list).filter((c) => c.email)
  return withEmail[0] || null
}

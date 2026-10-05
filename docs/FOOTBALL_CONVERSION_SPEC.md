# Football conversion spec (shared by everyone editing src/)

This repo is a fork of the KRS College Connect women's soccer app (Eastside FC, ECNL clubs).
It is being converted into a **Division 1 college football recruiting app for Mercer Island High School football players** (boys, grades 9–12, Mercer Island, WA). Schools are all **FBS + FCS** programs (266 rows already seeded in the `schools` table).

## Terminology (apply everywhere in user-facing copy, comments you touch, and alt text)
| Soccer app | Football app |
|---|---|
| Eastside FC / Eastside FC Washington / Est. 1970 / Bellevue | Mercer Island Football / Mercer Island High School / Mercer Island, WA — use `BRAND` from `src/lib/brand.js`, never hard-code |
| ECNL, club soccer, "your club", club director, club admin | high school program, "your program"/"your team", head coach / coaching staff, program admin |
| girls / women's soccer / she/her | football players / they (neutral); the athletes are boys |
| ID camp / ID camps | camps & combines (college prospect camps, junior days, combines) |
| Goalkeeper/Defender/Midfielder/Forward | football positions from `POSITIONS` in `src/lib/football.js` |
| goals, assists, clean sheets, minutes, shots, pass completion, dominant foot | football stats/measurables from `src/lib/football.js` (`STATS`, `MEASURABLES`, `statsForPosition`) |
| Trace, Veo | remove; Hudl is the primary film source (YouTube still fine) |
| D1/D2/D3/NAIA division filters | FBS / FCS subdivision filters (`schools.subdivision`), conference filters |
| "club team" field | "7v7 / camp team (optional)" — column is still `club_team` |
| club colors crimson/navy | Mercer Island maroon (CSS var `--crimson`, Tailwind `brand-primary`, `accent-crimson`) — keep using the existing tokens, don't add new hex values |

Keep the product voice: short, direct, encouraging, no emojis.

## Shared modules (already written — import, don't duplicate)
- `src/lib/brand.js` → `BRAND` (appName, orgName, orgShortName, teamName, location, logoPath, primaryColor…)
- `src/components/BrandLogo.jsx` → logo component (replaces EastsideFC_Logo; already swapped in imports)
- `src/lib/football.js` → `POSITIONS`, `positionLabel`, `positionGroup`, `MEASURABLES`, `STATS`, `statsForPosition`, `formatHeight`, `SUBDIVISIONS`

## Database (live, already migrated — do not write migrations)
- `athletes` football columns: `position` (store POSITIONS value e.g. 'QB'), `secondary_position`, `height_cm` (UI in inches, as before), `weight` (lbs), `forty_yard`, `shuttle_time`, `vertical_in`, `broad_jump_in`, `bench_reps`, `wingspan_in`, `games_played`, `pass_yards`, `pass_tds`, `completion_pct`, `interceptions_thrown`, `rush_yards`, `rush_tds`, `receptions`, `rec_yards`, `rec_tds`, `pancakes`, `sacks_allowed`, `tackles`, `tackles_for_loss`, `sacks`, `interceptions`, `pass_breakups`, `forced_fumbles`, `fg_made`, `fg_long`, `punt_avg`, `recruiting_profile_url` (247/On3/Rivals/NCSA link), plus existing `hudl_url`, `youtube_highlights_url`, `highlight_reel_url`, `phone`, `gpa`, `sat_score`, `act_score`, `class_year`, `jersey_number`, `high_school`, `city`, `state`, socials, `bio`, `profile_photo_url`.
- Soccer columns `goals, assists, minutes_played, clean_sheets, shots_on_goal, pass_completion_percent, dominant_foot, veo_link_url` still physically exist but **must not be read or written** by the app anymore.
- `schools`: adds `subdivision` ('FBS'|'FCS'), `football_roster_url`. `division` is 'D1' for all rows. `region` uses the existing region list. `conference` values include SEC, Big Ten, Big 12, ACC, Pac-12, Mountain West, American, Sun Belt, Conference USA, MAC, FBS Independent, Big Sky, Missouri Valley, CAA, Patriot League, Ivy League, Southland, SWAC, MEAC, NEC, Pioneer, Ohio Valley, SoCon, United Athletic Conference, FCS Independent.
- `school_fit_quiz_responses`: `academic_priority` allowed values `ivy_tier|strong_academic|balanced|football_first`; `division_target` allowed values `fbs_only|fcs_only|fbs_fcs`.
- `outreach_templates` already rewritten for football; they use tokens `{{measurables}}` (e.g. `6'2" · 205 lbs · 4.62 40`) and `{{high_school}}` in the signature.
- `coaches` table is empty for now (football coach data not scraped yet) — empty states must read well ("No coaches loaded for this school yet — use the program's recruiting email or the staff directory link").
- Signup: `useAuth().signUp(email, password, inviteCode, fullName)` returns `{ data, error, needsConfirmation }`.

## Rules
- Only edit the files assigned to you. If you need a change in a shared module, put it in your report instead.
- Do not run `npm install`, do not commit, do not touch `supabase/`.
- Keep behavior and structure; this is a domain conversion, not a redesign. Remove dead soccer-only UI rather than leaving it greyed out.
- When done, run `npm run build` from the repo root and fix any errors in your files. Then run
  `grep -rniE "eastside|ecnl|soccer|goalkeeper|midfield|clean.?sheet|dominant.?foot|veo|trace(up)?\\b|club director|girls|women" <your files>` and resolve every hit (or explain why it stays).

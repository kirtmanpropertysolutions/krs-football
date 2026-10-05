"""Cleans scripts/data/coaches/scraped.json -> scripts/data/coaches/coaches.json.

Fixes scraper noise:
- one email repeated across many coaches at a school is a shared office inbox,
  not a personal address -> becomes the program email, removed from coaches
- rows whose "name" is really a title, and titles that are social handles
- title text that starts with the coach's own name or ends with link chrome
- program emails that belong to another sport
Run: python3 scripts/football/clean-coaches.py
"""
import json, pathlib, re
from collections import Counter

root = pathlib.Path(__file__).resolve().parents[2]
import sys
src = json.load(open(root / 'scripts/data/coaches' / (sys.argv[1] if len(sys.argv) > 1 else 'scraped.json')))
schools = {s['name']: s for s in json.load(open(root / 'scripts/data/football-fbs-2026.json')) + json.load(open(root / 'scripts/data/football-fcs-2026.json'))}

TITLE_WORDS = re.compile(r'(coach|coordinator|recruit|personnel|director|chief of staff|quality control|analyst|graduate assistant|assistant)', re.I)
OTHER_SPORTS = re.compile(r'(vb|volley|softball|soccer|wsoc|msoc|bball|basketball|baseball|lax|lacrosse|golf|tennis|swim|track|xc|rowing|hockey|wrestl|gym|cheer|dance|wbb|mbb)', re.I)
NAME_RE = re.compile(r"^[A-Z][A-Za-z.'’\"“”\-]+(,? [A-Za-z.'’\"“”\-]+){1,4}$")

out, stats = [], Counter()
for r in src:
    coaches = r.get('coaches') or []
    s = schools.get(r['name'], {})
    # shared inbox detection
    counts = Counter(c['email'] for c in coaches if c.get('email'))
    shared = {e for e, n in counts.items() if n >= 3}
    program_email = r.get('program_email')
    if program_email and (OTHER_SPORTS.search(program_email.split('@')[0]) and 'football' not in program_email):
        program_email = None
        stats['dropped_other_sport_program_email'] += 1
    good_shared = [e for e in shared if not re.search(r'ticket|contactus|webmaster|compliance|marketing|media|sid@|info@', e) and not OTHER_SPORTS.search(e.split('@')[0])]
    if good_shared:
        preferred = sorted(good_shared, key=lambda e: (not re.search(r'football|fb|recruit', e.split('@')[0]), -counts[e]))[0]
        if not program_email or (re.search(r'football|fb|recruit', preferred) and not re.search(r'football|fb|recruit', program_email)):
            program_email = preferred
    clean = []
    for c in coaches:
        name = (c.get('name') or '').strip()
        title = (c.get('title') or '').strip()
        if not name or TITLE_WORDS.search(name) or not NAME_RE.match(name):
            stats['dropped_bad_name'] += 1
            continue
        if title.lower().startswith(name.lower()):
            title = title[len(name):].strip(' -|:')
        title = re.sub(r'\s*(Twitter|X|Instagram|Email|Phone)?\s*Opens in a new window.*$', '', title, flags=re.I).strip()
        title = re.sub(r'\s+', ' ', title)
        if not title or title.startswith('@') or ' ' not in title and not re.match(r'^(coach|analyst|coordinator)$', title, re.I):
            stats['dropped_bad_title'] += 1
            continue
        email = c.get('email')
        if email in shared:
            email = None
            stats['removed_shared_email'] += 1
        # Office / role inboxes (football@, recruiting@, athletics@ ...) are not a person's address
        if email and re.search(r'^(football|fb|recruit|athletics|ath|info|admin|office|staff|.*football.*|.*adcats.*)@', email.split('+')[0]) and not re.search(r'[a-z]{3,}', email.split('@')[0].replace('football','').replace('recruiting','').replace('athletics','')):
            program_email = program_email or email
            email = None
            stats['moved_role_inbox'] += 1
        if email and not re.match(r'^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$', email):
            email = None
        clean.append({**c, 'name': name, 'title': title[:140], 'email': email,
                      'is_recruiting_contact': bool(re.search(r'recruit|personnel', title, re.I))})
    q = r.get('questionnaire_url')
    if q and OTHER_SPORTS.search(q) and 'football' not in q.lower():
        q = None
        stats['dropped_other_sport_questionnaire'] += 1
    out.append({**r, 'coaches': clean, 'program_email': program_email, 'questionnaire_url': q})

json.dump(out, open(root / 'scripts/data/coaches/coaches.json', 'w'), indent=1)
co = [c for r in out for c in r['coaches']]
print('program_emails', sum(1 for r in out if r['program_email']), 'schools', len(out), 'coaches', len(co), 'with_email', sum(1 for c in co if c['email']),
      'schools_with_any_email', sum(1 for r in out if any(c['email'] for c in r['coaches']) or r['program_email']),
      'questionnaires', sum(1 for r in out if r['questionnaire_url']), dict(stats))

# Football coach + questionnaire research — instructions for each batch

Input: scripts/data/coaches/batch-NN-input.json (list of schools with athletics_website, football_roster_url, email_domain).
Output: scripts/data/coaches/batch-NN-output.json — a JSON array, one object per input school, in input order:

{
  "name": "<exact input name>",
  "questionnaire_url": "<URL of the football recruiting questionnaire / prospect form, or null>",
  "questionnaire_found_on": "<page URL where you saw the questionnaire link, or null>",
  "program_email": "<general football office / recruiting email shown on an official page, or null>",
  "coaches": [
    {"name": "Jane Doe", "title": "Wide Receivers Coach / Recruiting Coordinator", "email": "jdoe@school.edu" or null,
     "phone": "555-555-5555" or null, "is_recruiting_contact": true/false, "source_url": "<page where you saw this person>"}
  ],
  "notes": "<anything odd, e.g. emails hidden behind contact forms>"
}

## How to research each school (use WebFetch; the shell has no internet)
1. Fetch `<football_roster_url with /roster replaced>/coaches`, i.e. `<athletics_website>/sports/football/coaches`.
   Ask WebFetch to list every coach with name, title, and the email/phone EXACTLY as printed on the page (mailto links count).
2. If fewer than 3 coaches have emails, fetch the athletics staff directory: `<athletics_website>/staff-directory`
   (also try `/staff-directory?path=football` or `/sports/football/staff` if the first 404s) and pull football staff emails from there.
3. Questionnaire: look for links named "Recruiting Questionnaire", "Prospect Questionnaire", "Recruit Form", "Prospective Student-Athlete",
   or hosts like collegewarroom.com, frontrush.com, xosdigital/xos, jumpforward, armssoftware, questionnaire.*, forms.* .
   Check the coaches page first, then `<athletics_website>/sports/football` and `<athletics_website>/sports/football/recruiting` (or `/questionnaire`).
   Use the football-specific questionnaire, not a generic all-sports one, unless that is all there is.
4. Do at most ~5 fetches per school. If a site blocks you or times out, record what you have and note it.

## Rules (important)
- Only record emails that literally appear on an official school/athletics page. NEVER construct or guess an email from a name pattern.
- Only record real people currently listed as football staff. Include the head coach, coordinators, position coaches, recruiting
  coordinator/director/personnel staff, and anyone with a listed email. Skip trainers, equipment, video, and strength staff unless they are the recruiting contact.
- `is_recruiting_contact` = true for titles containing "Recruiting" or "Personnel" (Director of Recruiting, Recruiting Coordinator, Player Personnel, etc.).
- Keep titles as printed. Phones as printed.
- Write valid JSON (verify with: python3 -c "import json;json.load(open('PATH'))"). Write the file incrementally (e.g. every 5 schools) so work isn't lost.
- Do not edit any other files.

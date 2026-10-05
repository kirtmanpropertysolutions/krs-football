-- 120_coach_contacts.sql
-- Columns for scraped public coaching-staff contacts and recruiting questionnaires.
-- Data is loaded from scripts/data/coaches/scraped.json by scripts/football/build-coach-seed.py.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS recruiting_questionnaire_url text,
  ADD COLUMN IF NOT EXISTS coaches_checked_at timestamptz;
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS is_recruiting_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_url text;

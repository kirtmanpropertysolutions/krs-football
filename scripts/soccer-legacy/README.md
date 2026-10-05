# Soccer-era scripts (not used by the football app)

Carried over from the KRS College Connect soccer codebase for reference. They target
women's soccer pages, the soccer Supabase projects, or soccer school lists, so do not run
them against the football project as-is. `scrape-coaches.js` is the starting point for a
football coach scraper: swap the women's-soccer URL patterns for `/sports/football/coaches`
and point it at the `football_roster_url` column.

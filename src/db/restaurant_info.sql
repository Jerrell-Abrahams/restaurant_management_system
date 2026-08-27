-- Restaurant info shown behind the burger menu on the diner page. Run in the same project as
-- schema.sql, after it.

alter table restaurant.restaurants
  -- Free text, one or more lines. Rendered as a tap-to-map link built by string concatenation
  -- (maps.google.com/?q=...), not a Places API call -- same posture as the review link.
  add column if not exists address text,

  -- Day key -> array of [open, close] periods, "HH:MM", 24h. An empty array means closed that day;
  -- an absent key means the same. An array rather than one period per day so a restaurant that
  -- starts doing lunch service is an editor change, not a migration on a live column:
  --
  --   {"mon": [["11:00","22:00"]],
  --    "tue": [["11:00","14:30"],["18:00","22:00"]],
  --    "wed": [],
  --    "thu": [["18:00","02:00"]]}
  --
  -- thu closes AFTER midnight. close <= open means the period runs into the next day, which is
  -- normal here -- a grill that shuts at 02:00 must not read as closed all evening.
  --
  -- Validated in src/lib/hours.js before it ever reaches this column: PATCH takes JSON from a
  -- browser, and jsonb will happily store any shape at all.
  add column if not exists hours jsonb,

  -- The escape hatch for the days structured hours get wrong -- public holidays, a private
  -- function, a burst geyser. While this is set it displays on the diner page AND suppresses the
  -- open/closed badge entirely, because a confident "Open now" on 25 December is worse than
  -- saying nothing. Cheaper than a date-exception calendar and the owner already knows the fact.
  add column if not exists closed_note text;

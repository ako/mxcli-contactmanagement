-- Seed data for runtime performance analysis (dev only, never production).
--
-- 5,000 contacts, 2 addresses each, 3 notes each = 30,000 rows. Enough that
-- full-table reads and per-row queries show up in metrics and in the browser.
--
-- Mendix ID = (short_id << 48) | (sequence << 7) | random(0..127); the sequence
-- counters in mendixsystem$entityidentifier are advanced at the end so the running
-- runtime never reissues an ID used here.
--
--   psql -h 127.0.0.1 -U mendix -d contactmanagement -f scripts/seed-perf-data.sql

BEGIN;

INSERT INTO "contactmanagement$contact"
  (id, firstname, lastname, company, jobtitle, email, phone, mobile)
SELECT
  (63::bigint << 48) | ((1000 + i)::bigint << 7) | floor(random() * 128)::bigint,
  (ARRAY['Ada','Grace','Alan','Edsger','Barbara','Donald','Katherine','Tony',
         'Frances','Ken','Margaret','Dennis'])[1 + (i % 12)],
  (ARRAY['Lovelace','Hopper','Turing','Dijkstra','Liskov','Knuth','Johnson','Hoare',
         'Allen','Thompson','Hamilton','Ritchie'])[1 + (i % 12)] || '-' || i,
  (ARRAY['Analytical Engines','Harvard Mark','Bletchley','Eindhoven Systems',
         'MIT Labs','Stanford AI'])[1 + (i % 6)],
  (ARRAY['Engineer','Analyst','Director','Researcher'])[1 + (i % 4)],
  'contact' || i || '@example.org',
  '+44 20 7946 ' || lpad((i % 10000)::text, 4, '0'),
  '+44 7700 ' || lpad((i % 1000000)::text, 6, '0')
FROM generate_series(0, 4999) AS i;

-- Two addresses per contact, linked by FK column (column storage).
INSERT INTO "contactmanagement$address"
  (id, addresstype, street, housenumber, postalcode, city, region, country,
   isprimary, "contactmanagement$address_contact")
SELECT
  (64::bigint << 48) | ((1000 + (c.rn * 2) + a.n)::bigint << 7) | floor(random() * 128)::bigint,
  CASE a.n WHEN 0 THEN 'Home' ELSE 'Work' END,
  (ARRAY['Savile Row','Baker Street','Abbey Road','Fleet Street'])[1 + ((c.rn + a.n) % 4)],
  ((c.rn % 200) + 1)::text,
  'EC' || (1 + (c.rn % 4)) || 'A ' || (1 + (c.rn % 9)) || 'BB',
  (ARRAY['London','Manchester','Bristol','Leeds','Cambridge'])[1 + (c.rn % 5)],
  (ARRAY['Greater London','North West','South West'])[1 + (c.rn % 3)],
  'United Kingdom',
  (a.n = 0),
  c.id
FROM (SELECT id, (row_number() OVER (ORDER BY id)) - 1 AS rn
      FROM "contactmanagement$contact") c
CROSS JOIN generate_series(0, 1) AS a(n);

-- Three notes per contact.
INSERT INTO "contactmanagement$note"
  (id, notetext, "contactmanagement$note_contact")
SELECT
  (62::bigint << 48) | ((1000 + (c.rn * 3) + n.n)::bigint << 7) | floor(random() * 128)::bigint,
  (ARRAY['Met at the Analytical Engine demo. Follow up about Menabrea.',
         'Prefers email over phone. Sent the revised proposal.',
         'Moving office next quarter — check the address again then.'])[1 + n.n],
  c.id
FROM (SELECT id, (row_number() OVER (ORDER BY id)) - 1 AS rn
      FROM "contactmanagement$contact") c
CROSS JOIN generate_series(0, 2) AS n(n);

-- Advance the sequence counters well past everything used above.
UPDATE mendixsystem$entityidentifier ei
   SET object_sequence = 30000
  FROM mendixsystem$entity e
 WHERE e.id = ei.id
   AND e.entity_name IN ('ContactManagement.Contact',
                         'ContactManagement.Address',
                         'ContactManagement.Note');

COMMIT;

ANALYZE "contactmanagement$contact";
ANALYZE "contactmanagement$address";
ANALYZE "contactmanagement$note";

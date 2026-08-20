-- Jahi commitment detail derived from the certified Fund Retirement Statement dated 8 Jul 2026.
-- Idempotent: only inserts the six source rows once for JAHI-01.
with target as (
  select id from public.projects where project_code = 'JAHI-01' limit 1
),
src(description, approved_amount, paid_amount, outstanding_amount, status) as (
  values
    ('Andrew — Tiling balance', 2000000::numeric, 2000000::numeric, 0::numeric, 'settled'),
    ('Screeder', 400000::numeric, 200000::numeric, 200000::numeric, 'outstanding'),
    ('Bamboo carpenter', 300000::numeric, 150000::numeric, 150000::numeric, 'outstanding'),
    ('Plumber — washing machine piping', 200000::numeric, 200000::numeric, 0::numeric, 'settled'),
    ('Waterproofing balance', 1000000::numeric, 500000::numeric, 500000::numeric, 'outstanding'),
    ('Site imprest', 100000::numeric, 0::numeric, 100000::numeric, 'outstanding')
)
insert into public.project_commitments (
  project_id, description, approved_amount, paid_amount, outstanding_amount, status, source_label
)
select
  target.id,
  src.description,
  src.approved_amount,
  src.paid_amount,
  src.outstanding_amount,
  src.status,
  'Jahi Fund Retirement Statement · 8 Jul 2026'
from target
cross join src
where not exists (
  select 1
  from public.project_commitments pc
  where pc.project_id = target.id
    and pc.description = src.description
    and pc.source_label = 'Jahi Fund Retirement Statement · 8 Jul 2026'
);

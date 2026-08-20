alter table public.companies add column if not exists product_edition text not null default 'standard';

alter table public.companies drop constraint if exists companies_product_edition_check;
alter table public.companies add constraint companies_product_edition_check
  check (product_edition in ('standard','enterprise_custom'));

comment on column public.companies.product_edition is
  'standard = small/medium contractor product; enterprise_custom = bespoke large-company extension using the same core.';

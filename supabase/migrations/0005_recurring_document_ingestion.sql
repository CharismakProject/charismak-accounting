-- Recurring bank statement + financial document ingestion foundation.
-- This migration is intentionally designed for monthly/overlapping imports.

create type public.financial_account_type as enum ('bank','fintech_wallet','cash','petty_cash','site_imprest','loan_credit','other');
create type public.source_document_type as enum ('bank_statement','invoice','bill','quotation','receipt','boq','other');
create type public.import_status as enum ('uploaded','parsing','needs_review','confirmed','failed');
create type public.row_detection_status as enum ('new','already_known','possible_duplicate','changed','needs_review');
create type public.match_decision_status as enum ('suggested','confirmed','rejected');
create type public.project_candidate_status as enum ('suggested','created','merged','ignored');

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  account_type public.financial_account_type not null default 'bank',
  institution_name text,
  account_name text not null,
  account_number_masked text,
  currency_code text not null default 'NGN',
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  document_type public.source_document_type not null,
  file_name text not null,
  storage_path text,
  file_hash text,
  document_date date,
  source_name text,
  amount numeric(18,2),
  currency_code text not null default 'NGN',
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  unique(company_id, document_type, file_hash)
);

create table if not exists public.statement_imports (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.source_documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  financial_account_id uuid references public.financial_accounts(id) on delete set null,
  detected_institution_name text,
  detected_account_name text,
  detected_account_number_masked text,
  period_start date,
  period_end date,
  opening_balance numeric(18,2),
  closing_balance numeric(18,2),
  status public.import_status not null default 'uploaded',
  exact_file_duplicate_of uuid references public.statement_imports(id) on delete set null,
  overlapping_import_id uuid references public.statement_imports(id) on delete set null,
  detected_as_new_account boolean not null default false,
  rows_total integer not null default 0,
  rows_new integer not null default 0,
  rows_already_known integer not null default 0,
  rows_need_review integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.statement_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.statement_imports(id) on delete cascade,
  row_index integer not null,
  transaction_date date,
  value_date date,
  narration text,
  reference text,
  counterparty text,
  debit numeric(18,2),
  credit numeric(18,2),
  signed_amount numeric(18,2),
  running_balance numeric(18,2),
  normalized_fingerprint text,
  comparison_key text,
  detection_status public.row_detection_status not null default 'needs_review',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(import_id, row_index)
);

create table if not exists public.canonical_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  financial_account_id uuid references public.financial_accounts(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  transaction_date date not null,
  value_date date,
  narration text,
  reference text,
  counterparty text,
  signed_amount numeric(18,2) not null,
  running_balance numeric(18,2),
  normalized_fingerprint text,
  classification text,
  category_name text,
  status text not null default 'needs_review',
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.statement_row_transaction_links (
  statement_row_id uuid not null references public.statement_rows(id) on delete cascade,
  canonical_transaction_id uuid not null references public.canonical_transactions(id) on delete cascade,
  confidence numeric(5,2),
  reason jsonb not null default '{}'::jsonb,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(statement_row_id, canonical_transaction_id)
);

create table if not exists public.statement_project_matches (
  id uuid primary key default gen_random_uuid(),
  statement_row_id uuid not null references public.statement_rows(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  confidence numeric(5,2) not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  status public.match_decision_status not null default 'suggested',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique(statement_row_id, project_id)
);

create table if not exists public.statement_project_candidates (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.statement_imports(id) on delete cascade,
  candidate_key text not null,
  suggested_name text,
  suggested_code text,
  confidence numeric(5,2) not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  status public.project_candidate_status not null default 'suggested',
  linked_project_id uuid references public.projects(id) on delete set null,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique(import_id, candidate_key)
);

create table if not exists public.document_project_suggestions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.source_documents(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  suggested_new_project_name text,
  confidence numeric(5,2) not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  status public.match_decision_status not null default 'suggested',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.financial_accounts enable row level security;
alter table public.source_documents enable row level security;
alter table public.statement_imports enable row level security;
alter table public.statement_rows enable row level security;
alter table public.canonical_transactions enable row level security;
alter table public.statement_row_transaction_links enable row level security;
alter table public.statement_project_matches enable row level security;
alter table public.statement_project_candidates enable row level security;
alter table public.document_project_suggestions enable row level security;

create policy financial_accounts_member_select on public.financial_accounts for select to authenticated using ((select private.is_company_member(company_id)));
create policy financial_accounts_owner_write on public.financial_accounts for all to authenticated using ((select private.is_company_owner(company_id))) with check ((select private.is_company_owner(company_id)));
create policy source_documents_member_select on public.source_documents for select to authenticated using ((select private.is_company_member(company_id)));
create policy source_documents_owner_write on public.source_documents for all to authenticated using ((select private.is_company_owner(company_id))) with check ((select private.is_company_owner(company_id)));
create policy statement_imports_member_select on public.statement_imports for select to authenticated using ((select private.is_company_member(company_id)));
create policy statement_imports_owner_write on public.statement_imports for all to authenticated using ((select private.is_company_owner(company_id))) with check ((select private.is_company_owner(company_id)));

create index if not exists financial_accounts_company_idx on public.financial_accounts(company_id);
create index if not exists source_documents_company_type_idx on public.source_documents(company_id, document_type);
create index if not exists statement_imports_company_idx on public.statement_imports(company_id);
create index if not exists statement_imports_account_period_idx on public.statement_imports(financial_account_id, period_start, period_end);
create index if not exists statement_rows_import_idx on public.statement_rows(import_id);
create index if not exists statement_rows_fingerprint_idx on public.statement_rows(normalized_fingerprint);
create index if not exists canonical_transactions_company_account_date_idx on public.canonical_transactions(company_id, financial_account_id, transaction_date);
create index if not exists canonical_transactions_fingerprint_idx on public.canonical_transactions(normalized_fingerprint);

create table if not exists private.pipeline_versions(name text primary key, version integer not null, updated_at timestamptz not null default now());
insert into private.pipeline_versions(name,version) values('universal_statement_identity',1) on conflict(name) do update set version=excluded.version,updated_at=now();

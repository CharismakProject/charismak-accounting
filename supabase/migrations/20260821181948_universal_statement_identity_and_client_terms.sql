create or replace function private.expand_project_relationship_terms()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_terms text[];
begin
  if new.relationship_type not in ('client','sponsor') then
    return new;
  end if;

  select coalesce(array_agg(distinct term order by term),'{}'::text[])
  into v_terms
  from (
    select lower(trim(x)) as term
    from unnest(coalesce(new.match_terms,'{}'::text[]) || array[coalesce(new.display_name,'')]) x
    where length(trim(x)) >= 3

    union

    select lower(token) as term
    from regexp_split_to_table(coalesce(new.display_name,''),'[^A-Za-z0-9]+') token
    where length(token) >= 4
      and lower(token) not in (
        'bank','limited','ltd','plc','nigeria','nigerian','international','group','company','co','project','projects',
        'services','service','enterprise','enterprises','ventures','venture','global','holdings','holding','investment',
        'investments','construction','engineering','properties','property','resources','resource','business','businesses'
      )
  ) s
  where term <> '';

  new.match_terms := v_terms;
  return new;
end;
$$;

drop trigger if exists trg_expand_project_relationship_terms on public.project_relationships;
create trigger trg_expand_project_relationship_terms
before insert or update of display_name,match_terms,relationship_type
on public.project_relationships
for each row execute function private.expand_project_relationship_terms();

update public.project_relationships
set match_terms = match_terms
where relationship_type in ('client','sponsor');

comment on function private.expand_project_relationship_terms() is
'Expands client/sponsor matching into safe significant name tokens so bank narrations can match truncated client names without depending on a project title.';

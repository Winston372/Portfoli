begin;

create table if not exists public.portfolio_drafts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  draft jsonb not null check (jsonb_typeof(draft) = 'object')
);
alter table public.portfolio_drafts enable row level security;
revoke all on public.portfolio_drafts from anon, authenticated;
grant select, insert, update on public.portfolio_drafts to authenticated;

drop policy if exists portfolio_own_draft on public.portfolio_drafts;
create policy portfolio_own_draft on public.portfolio_drafts
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Only explicitly published snapshots go into this separate table.
create table if not exists public.portfolio_publications (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  published_at timestamptz not null default now()
);
alter table public.portfolio_publications enable row level security;
revoke all on public.portfolio_publications from anon, authenticated;
grant select, insert, update, delete on public.portfolio_publications to authenticated;

drop policy if exists portfolio_public_read on public.portfolio_publications;
drop policy if exists portfolio_own_publication on public.portfolio_publications;
create policy portfolio_own_publication on public.portfolio_publications
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Anonymous visitors can fetch one intentionally published snapshot by UUID.
-- The table itself is readable only by the owner.
create or replace function public.portfolio_read_publication(site_id uuid)
returns table (snapshot jsonb, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.snapshot, p.published_at
  from public.portfolio_publications as p
  where p.owner_id = site_id;
$$;
revoke all on function public.portfolio_read_publication(uuid) from public, anon, authenticated;
grant execute on function public.portfolio_read_publication(uuid) to anon, authenticated;

commit;

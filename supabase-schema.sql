-- 1. games 테이블
create table if not exists public.games (
  id text primary key,
  title text not null,
  config jsonb not null,
  created_at timestamptz default now()
);

-- 2. claims 테이블 (slot은 PK로 중복 방지)
create table if not exists public.claims (
  game_id text not null references public.games(id) on delete cascade,
  slot integer not null,
  real_name text not null,
  claimed_at timestamptz default now(),
  primary key (game_id, slot)
);

-- 3. RLS 활성화
alter table public.games enable row level security;
alter table public.claims enable row level security;

-- 4. games: 누구나 읽기 가능, 누구나 쓰기 가능 (anon 포함)
create policy "games_select" on public.games for select using (true);
create policy "games_insert" on public.games for insert with check (true);

-- 5. claims: 누구나 읽기/쓰기 가능 (anon 포함)
create policy "claims_select" on public.claims for select using (true);
create policy "claims_insert" on public.claims for insert with check (true);

-- 6. Realtime 활성화
alter publication supabase_realtime add table public.claims;

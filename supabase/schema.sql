-- 리프트로그 동기화 테이블. Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- 키 단위 key-value 저장: settings | exercises | routines | w:<YYYY-MM-DD>
create table if not exists public.liftlog_kv (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb,
  deleted    boolean     not null default false,   -- tombstone: 삭제 전파용
  updated_at timestamptz not null default now(),   -- 클라이언트가 보낸 수정 시각 (last-write-wins)
  primary key (user_id, key)
);

alter table public.liftlog_kv enable row level security;

drop policy if exists "liftlog own rows" on public.liftlog_kv;
create policy "liftlog own rows" on public.liftlog_kv
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- (선택) SQL로 분석할 때 편한 뷰: 날짜별 운동 기록을 행으로 펼침
create or replace view public.liftlog_sets as
select
  k.user_id,
  substring(k.key from 3)::date                         as workout_date,
  (it ->> 'exId')                                       as exercise_id,
  (ex ->> 'name')                                       as exercise_name,
  (ex ->> 'part')                                       as part,
  (s.ord)::int                                          as set_no,
  nullif(s.val ->> 'kg', '')::numeric                   as kg,
  nullif(s.val ->> 'reps', '')::numeric                 as reps,
  (s.val ->> 'done')::boolean                           as done
from public.liftlog_kv k
cross join lateral jsonb_array_elements(k.value -> 'items') as it
cross join lateral jsonb_array_elements(it -> 'sets') with ordinality as s(val, ord)
left join public.liftlog_kv e
  on e.user_id = k.user_id and e.key = 'exercises' and not e.deleted
left join lateral (
  select x from jsonb_array_elements(e.value) x where x ->> 'id' = it ->> 'exId' limit 1
) ex_row on true
cross join lateral (select ex_row.x as ex) ex
where k.key like 'w:%' and not k.deleted;

alter view public.liftlog_sets set (security_invoker = on);

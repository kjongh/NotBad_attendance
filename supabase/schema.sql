-- MVP data schema for the current frontend sync prototype.
-- Do not treat the policies at the bottom of this file as public-launch security.
-- A public release needs Supabase Auth or Edge Functions so RLS can verify the actor.

create table if not exists public.members (
  id text primary key,
  name text not null unique,
  role text not null default 'member' check (role in ('member', 'admin', 'owner')),
  pin_hash text,
  created_at timestamptz not null default now()
);

alter table public.members drop constraint if exists members_role_check;
alter table public.members
  add constraint members_role_check check (role in ('member', 'admin', 'owner'));

create table if not exists public.signup_requests (
  id text primary key,
  name text not null unique,
  pin_hash text not null,
  requested_at timestamptz not null default now()
);

create table if not exists public.events (
  id text primary key,
  title text not null,
  location text not null,
  note text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity integer,
  min_attendees integer,
  cancel_at timestamptz,
  canceled_at timestamptz,
  canceled_reason text,
  canceled_by text,
  created_by text references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by text references public.members(id) on delete set null,
  updated_at timestamptz,
  finalized_at timestamptz,
  finalized_by text references public.members(id) on delete set null
);

create table if not exists public.rsvps (
  event_id text not null references public.events(id) on delete cascade,
  member_id text not null references public.members(id) on delete cascade,
  status text not null check (status in ('attending', 'maybe', 'absent')),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create table if not exists public.attendance_drafts (
  event_id text not null references public.events(id) on delete cascade,
  member_id text not null references public.members(id) on delete cascade,
  attended boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create table if not exists public.confirmed_attendance (
  event_id text not null references public.events(id) on delete cascade,
  member_id text not null references public.members(id) on delete cascade,
  attended boolean not null default true,
  finalized_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create table if not exists public.final_approvals (
  event_id text not null references public.events(id) on delete cascade,
  admin_member_id text not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, admin_member_id)
);

create table if not exists public.feedback_items (
  id text primary key,
  member_id text references public.members(id) on delete set null,
  member_name text not null,
  type text not null default 'idea' check (type in ('idea', 'ux', 'bug', 'other')),
  subject text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'reviewing', 'done', 'closed')),
  page_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by text references public.members(id) on delete set null
);

insert into public.members (id, name, role, pin_hash)
values
  ('member-owner', 'admin', 'owner', null),
  ('member-juice', '쥬스', 'admin', null)
on conflict (id) do nothing;

alter table public.members enable row level security;
alter table public.signup_requests enable row level security;
alter table public.events enable row level security;
alter table public.rsvps enable row level security;
alter table public.attendance_drafts enable row level security;
alter table public.confirmed_attendance enable row level security;
alter table public.final_approvals enable row level security;
alter table public.feedback_items enable row level security;

drop policy if exists "MVP read members" on public.members;
drop policy if exists "MVP write members" on public.members;
drop policy if exists "MVP read signup requests" on public.signup_requests;
drop policy if exists "MVP write signup requests" on public.signup_requests;
drop policy if exists "MVP read events" on public.events;
drop policy if exists "MVP write events" on public.events;
drop policy if exists "MVP read rsvps" on public.rsvps;
drop policy if exists "MVP write rsvps" on public.rsvps;
drop policy if exists "MVP read attendance drafts" on public.attendance_drafts;
drop policy if exists "MVP write attendance drafts" on public.attendance_drafts;
drop policy if exists "MVP read confirmed attendance" on public.confirmed_attendance;
drop policy if exists "MVP write confirmed attendance" on public.confirmed_attendance;
drop policy if exists "MVP read final approvals" on public.final_approvals;
drop policy if exists "MVP write final approvals" on public.final_approvals;
drop policy if exists "MVP read feedback items" on public.feedback_items;
drop policy if exists "MVP write feedback items" on public.feedback_items;

create policy "MVP read members" on public.members
  for select using (true);
create policy "MVP write members" on public.members
  for all using (true) with check (true);

create policy "MVP read signup requests" on public.signup_requests
  for select using (true);
create policy "MVP write signup requests" on public.signup_requests
  for all using (true) with check (true);

create policy "MVP read events" on public.events
  for select using (true);
create policy "MVP write events" on public.events
  for all using (true) with check (true);

create policy "MVP read rsvps" on public.rsvps
  for select using (true);
create policy "MVP write rsvps" on public.rsvps
  for all using (true) with check (true);

create policy "MVP read attendance drafts" on public.attendance_drafts
  for select using (true);
create policy "MVP write attendance drafts" on public.attendance_drafts
  for all using (true) with check (true);

create policy "MVP read confirmed attendance" on public.confirmed_attendance
  for select using (true);
create policy "MVP write confirmed attendance" on public.confirmed_attendance
  for all using (true) with check (true);

create policy "MVP read final approvals" on public.final_approvals
  for select using (true);
create policy "MVP write final approvals" on public.final_approvals
  for all using (true) with check (true);

create policy "MVP read feedback items" on public.feedback_items
  for select using (true);
create policy "MVP write feedback items" on public.feedback_items
  for all using (true) with check (true);

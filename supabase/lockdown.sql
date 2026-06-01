-- Public-launch guardrail.
-- Run this before exposing Supabase credentials in Vercel if Auth/Edge Functions
-- have not been added yet. It removes the MVP open policies so anon clients
-- cannot directly read or write the app tables.

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

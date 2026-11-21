-- Row Level Security tests for supabase/migrations (run: npm run test:sql, needs local Postgres 15+).
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'aman@example.com', '{"full_name":"Aman"}'),
  ('00000000-0000-0000-0000-00000000000b', 'riya@example.com', '{"full_name":"Riya"}'),
  ('00000000-0000-0000-0000-00000000000c', 'kabir@example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'dia@example.com', '{}');
update public.profiles set upi_id = 'riya@okaxis', phone = '+91 98765 43210', share_contact = true where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set upi_id = 'kabir@okicici', share_contact = false where id = '00000000-0000-0000-0000-00000000000c';

create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claims', '', false);
end $$;
create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
set client_min_messages = notice;

-- Aman creates a trip and becomes its owner
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.trips (id, owner_id, name, travellers) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'Goa', '{Aman,Riya,Kabir}');
select pg_temp.ok((select role from public.trip_members where trip_id = '11111111-1111-1111-1111-111111111111') = 'owner', 'creator is owner');
select pg_temp.ok((select display_name from public.profiles) = 'Aman', 'profile created from sign-in name; own row only');
insert into public.days (trip_id, id, position, dest_key) values ('11111111-1111-1111-1111-111111111111', 'd1', 1, 'goa');
insert into public.items (trip_id, id, day_id, position, title, cat) values ('11111111-1111-1111-1111-111111111111', 'i1', 'd1', 1, 'Fort', 'heritage');
insert into public.expenses (trip_id, id, description, amount, category) values ('11111111-1111-1111-1111-111111111111', 'e1', 'Dinner', 1200, 'food');
insert into public.expense_payers values ('11111111-1111-1111-1111-111111111111', 'e1', 0, 1200);

-- Someone can't create a trip owned by someone else
do $$ begin
  insert into public.trips (owner_id, name, travellers) values ('00000000-0000-0000-0000-00000000000b', 'x', '{a}');
  raise exception 'FAILED: inserted a trip for another owner';
exception when insufficient_privilege then raise notice 'ok - cannot create a trip for someone else';
end $$;
-- Members can't add themselves or others (invites go through the server function)
do $$ begin
  insert into public.trip_members values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d', 'editor');
  raise exception 'FAILED: inserted a member directly';
exception when insufficient_privilege then raise notice 'ok - cannot add members directly';
end $$;

-- the invite function (service role) adds Riya as editor and Kabir as viewer
select pg_temp.reset();
set role service_role;
insert into public.trip_members (trip_id, user_id, role, traveller_index) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000b', 'editor', 1),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'viewer', 2);
reset role;

-- Riya (editor) reads and edits; the version bumps and the change is logged
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from public.items) = 1, 'editor reads items');
update public.items set title = 'Fort Aguada', start_min = 600 where id = 'i1' and version = 1;
select pg_temp.ok((select version from public.items where id = 'i1') = 2, 'update bumps version');
select pg_temp.ok((select updated_by from public.items where id = 'i1') = '00000000-0000-0000-0000-00000000000b', 'updated_by is the editor');
update public.items set title = 'stale write' where id = 'i1' and version = 1;
select pg_temp.ok((select title from public.items where id = 'i1') = 'Fort Aguada', 'a write with an old version changes nothing (conflict)');
select pg_temp.ok((select diff -> 'title' ->> 1 from public.activity_log where entity = 'items' and action = 'update' order by id desc limit 1) = 'Fort Aguada', 'activity log has the field diff');
select pg_temp.ok((select count(*) from public.activity_log where entity = 'items' and action = 'update') = 1, 'no activity row for a write that changed nothing');
select pg_temp.ok((select upi_id from public.trip_people('11111111-1111-1111-1111-111111111111') where user_id = '00000000-0000-0000-0000-00000000000c') is null, 'contact details hidden unless shared');
select pg_temp.ok((select upi_id from public.trip_people('11111111-1111-1111-1111-111111111111') where user_id = '00000000-0000-0000-0000-00000000000b') = 'riya@okaxis', 'own contact details visible');
do $$ begin
  update public.trip_members set role = 'owner' where user_id = '00000000-0000-0000-0000-00000000000b';
  raise exception 'FAILED: editor changed a role';
exception when insufficient_privilege then raise notice 'ok - editors cannot change roles';
end $$;
do $$ begin
  delete from public.trips where id = '11111111-1111-1111-1111-111111111111';
  if found then raise exception 'FAILED: editor deleted the trip'; end if;
  raise notice 'ok - editors cannot delete the trip';
end $$;

-- Kabir (viewer): reads, comments and votes, but can't edit
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.expenses) = 1, 'viewer reads expenses');
update public.items set title = 'hacked' where id = 'i1';
select pg_temp.ok((select title from public.items where id = 'i1') = 'Fort Aguada', 'viewer update changes nothing');
do $$ begin
  insert into public.items (trip_id, id, position, title, cat) values ('11111111-1111-1111-1111-111111111111', 'i2', 2, 'x', 'sight');
  raise exception 'FAILED: viewer inserted an item';
exception when insufficient_privilege then raise notice 'ok - viewer cannot add items';
end $$;
insert into public.comments (trip_id, target_kind, target_id, body, author_id) values ('11111111-1111-1111-1111-111111111111', 'item', 'i1', 'Too early?', '00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.comments) = 1, 'viewer can comment');
insert into public.votes (trip_id, target_kind, target_id, user_id, value) values ('11111111-1111-1111-1111-111111111111', 'wish', 'i1', '00000000-0000-0000-0000-00000000000c', 1);
select pg_temp.ok((select count(*) from public.votes) = 1, 'viewer can vote');
do $$ begin
  insert into public.votes (trip_id, target_kind, target_id, user_id, value) values ('11111111-1111-1111-1111-111111111111', 'stay', 's1', '00000000-0000-0000-0000-00000000000b', 1);
  raise exception 'FAILED: voted as someone else';
exception when insufficient_privilege then raise notice 'ok - cannot vote as someone else';
end $$;
do $$ begin
  insert into public.polls (trip_id, question, created_by) values ('11111111-1111-1111-1111-111111111111', 'Dinner?', '00000000-0000-0000-0000-00000000000c');
  raise exception 'FAILED: viewer created a poll';
exception when insufficient_privilege then raise notice 'ok - viewers cannot create polls';
end $$;

-- polls: one vote per person; closed polls take no votes
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.polls (id, trip_id, question, created_by) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Which hotel?', '00000000-0000-0000-0000-00000000000b');
insert into public.poll_options (id, poll_id, trip_id, label) values
  ('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Haveli'),
  ('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Beach hut');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.votes (trip_id, target_kind, target_id, poll_id, user_id, value) values ('11111111-1111-1111-1111-111111111111', 'poll_option', '33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000c', 1);
do $$ begin
  insert into public.votes (trip_id, target_kind, target_id, poll_id, user_id, value) values ('11111111-1111-1111-1111-111111111111', 'poll_option', '33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000c', 1);
  raise exception 'FAILED: voted twice in one poll';
exception when unique_violation then raise notice 'ok - one vote per person per poll';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.polls set closed_at = now() where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  insert into public.votes (trip_id, target_kind, target_id, poll_id, user_id, value) values ('11111111-1111-1111-1111-111111111111', 'poll_option', '33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000a', 1);
  raise exception 'FAILED: voted in a closed poll';
exception when insufficient_privilege then raise notice 'ok - closed polls take no votes';
end $$;

-- Dia (not a member) sees nothing at all
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.ok((select count(*) from public.trips) = 0 and (select count(*) from public.items) = 0 and (select count(*) from public.expenses) = 0
  and (select count(*) from public.comments) = 0 and (select count(*) from public.activity_log) = 0 and (select count(*) from public.trip_members) = 0, 'outsider reads nothing');
select pg_temp.ok((select count(*) from public.trip_people('11111111-1111-1111-1111-111111111111')) = 0, 'outsider gets no trip people');
select pg_temp.ok((select count(*) from public.profiles) = 1, 'outsider sees only their own profile');

-- anon has no access to any table
select pg_temp.reset();
set role anon;
do $$ begin
  perform 1 from public.trips;
  raise exception 'FAILED: anon read trips';
exception when insufficient_privilege then raise notice 'ok - anon cannot read tables';
end $$;
reset role;

-- owner deletes the trip; everything goes with it
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.trips where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.reset();
select pg_temp.ok((select count(*) from public.items) = 0 and (select count(*) from public.trip_members) = 0, 'owner delete cascades');
\echo ALL RLS TESTS PASSED

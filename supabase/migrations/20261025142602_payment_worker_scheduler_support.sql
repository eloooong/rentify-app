-- Optional hosted scheduler transport. No jobs or secrets are created by migration.
begin;
create extension if not exists pg_net with schema extensions;
-- Worker requests temporarily contain the scoped bearer token in the queue.
-- App callers must have neither SQL transport privileges nor queue visibility.
revoke all on schema net from public,anon,authenticated;
revoke all on all tables in schema net from public,anon,authenticated;
revoke all on all functions in schema net from public,anon,authenticated;
commit;

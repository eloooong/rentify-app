-- Reference categories can be browsed before login; only trusted backend code
-- can change them. Other application tables remain inaccessible to clients.
begin;

grant select on public.categories to anon, authenticated;

create policy categories_public_read
on public.categories for select
to anon, authenticated
using (true);

commit;

-- Participant-only booking chat, idempotent commands and recipient notifications.
begin;

alter table public.messages add column client_key uuid not null default gen_random_uuid();
alter table public.messages add constraint messages_sender_key unique(sender_id,client_key);
alter table public.messages add constraint messages_body_length check(char_length(body) between 1 and 2000);
alter table public.notifications add column event_key text unique;
create index notifications_unread on public.notifications(user_id,created_at desc,id desc) where read_at is null;

-- Neither API role nor the server service key can bypass the commands to write chat.
revoke all on public.conversations, public.messages, public.notifications from public,anon,authenticated,service_role;
grant select on public.conversations, public.messages, public.notifications to authenticated,service_role;

create function public.communication_user()
returns uuid language sql stable security definer set search_path='' as $$
  select u.id from auth.users u where u.id=(select auth.uid()) and u.email_confirmed_at is not null;
$$;
create function public.chat_can_read(p_booking uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.bookings b where b.id=p_booking
    and public.communication_user() in (b.renter_id,b.owner_id));
$$;
create policy conversation_participant_read on public.conversations for select to authenticated
  using(public.chat_can_read(booking_id));
create policy message_participant_read on public.messages for select to authenticated
  using(exists(select 1 from public.conversations c where c.id=conversation_id and public.chat_can_read(c.booking_id)));
create policy notification_recipient_read on public.notifications for select to authenticated
  using(user_id=(select public.communication_user()));

create function public.chat_conversation_json(c public.conversations)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',c.id,'booking_id',c.booking_id,'created_at',c.created_at,'updated_at',c.updated_at,
    'unread_count',(select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id<>auth.uid() and m.read_at is null),
    'can_send',public.booking_actor_eligible(b.renter_id) and public.booking_actor_eligible(b.owner_id))
  from public.bookings b where b.id=c.booking_id;
$$;
create function public.open_booking_chat(p_booking uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.conversations;
begin
  if public.communication_user() is null then raise exception using errcode='42501',message='sign_in'; end if;
  perform 1 from public.bookings where id=p_booking and public.chat_can_read(id) for share;
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  insert into public.conversations(booking_id) values(p_booking) on conflict(booking_id) do nothing;
  select * into c from public.conversations where booking_id=p_booking;
  return public.chat_conversation_json(c);
end;
$$;
create function public.list_my_conversations(p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint;
begin
  if public.communication_user() is null then raise exception using errcode='42501',message='sign_in'; end if;
  if p_page is null or p_page not between 1 and 10000 or p_page_size is null or p_page_size not between 1 and 50 then
    raise exception using errcode='22023',message='validation'; end if;
  select count(*) into total from public.conversations c where public.chat_can_read(c.booking_id);
  select coalesce(jsonb_agg(public.chat_conversation_json(c) order by c.updated_at desc,c.id desc),'[]'::jsonb) into result
    from (select * from public.conversations where public.chat_can_read(booking_id)
      order by updated_at desc,id desc limit p_page_size offset (p_page-1)*p_page_size)c;
  return jsonb_build_object('data',result,'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,'total',total));
end;
$$;
create function public.list_chat_messages(p_conversation uuid,p_before uuid default null,p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare anchor public.messages; result jsonb;
begin
  if public.communication_user() is null then raise exception using errcode='42501',message='sign_in'; end if;
  if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='validation'; end if;
  perform 1 from public.conversations c where c.id=p_conversation and public.chat_can_read(c.booking_id);
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  if p_before is not null then
    select * into anchor from public.messages where id=p_before and conversation_id=p_conversation;
    if not found then raise exception using errcode='P0001',message='not_found'; end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc,m.id desc),'[]'::jsonb) into result from
    (select * from public.messages where conversation_id=p_conversation
      and (p_before is null or (created_at,id)<(anchor.created_at,anchor.id))
      order by created_at desc,id desc limit p_limit+1)m;
  return jsonb_build_object('data',case when jsonb_array_length(result)>p_limit then result-p_limit else result end,
    'next_before',case when jsonb_array_length(result)>p_limit then result->(p_limit-1)->>'id' else null end);
end;
$$;
create function public.send_chat_message(p_conversation uuid,p_key uuid,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.communication_user(); c public.conversations; b public.bookings; m public.messages; clean text:=btrim(p_body);
begin
  if actor is null then raise exception using errcode='42501',message='sign_in'; end if;
  if p_key is null or clean is null or char_length(clean) not between 1 and 2000 or clean !~ '[^[:space:]]' then
    raise exception using errcode='22023',message='validation'; end if;
  -- Lock order is booking then conversation; booking actions never lock conversations.
  select b1.* into b from public.bookings b1 join public.conversations c1 on c1.booking_id=b1.id
    where c1.id=p_conversation and actor in (b1.owner_id,b1.renter_id) for share of b1;
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  select * into c from public.conversations where id=p_conversation for update;
  select * into m from public.messages where sender_id=actor and client_key=p_key;
  if found then
    if m.conversation_id<>p_conversation or m.body<>clean then raise exception using errcode='P0001',message='idempotency_conflict'; end if;
    return jsonb_build_object('data',to_jsonb(m),'replayed',true);
  end if;
  if not public.booking_actor_eligible(b.renter_id) or not public.booking_actor_eligible(b.owner_id) then
    raise exception using errcode='42501',message='chat_unavailable'; end if;
  if (select count(*) from public.messages where conversation_id=c.id and sender_id=actor and created_at>clock_timestamp()-interval '1 minute')>=20 then
    raise exception using errcode='P0001',message='rate_limited'; end if;
  insert into public.messages(conversation_id,sender_id,client_key,body,created_at)
    values(c.id,actor,p_key,clean,clock_timestamp()) returning * into m;
  update public.conversations set updated_at=clock_timestamp() where id=c.id;
  return jsonb_build_object('data',to_jsonb(m),'replayed',false);
exception when unique_violation then
  -- A key raced on a different conversation; never leak its contents or duplicate it.
  raise exception using errcode='P0001',message='idempotency_conflict';
end;
$$;
create function public.mark_chat_read(p_conversation uuid,p_through uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare anchor public.messages; changed integer;
begin
  if public.communication_user() is null then raise exception using errcode='42501',message='sign_in'; end if;
  perform 1 from public.conversations c where c.id=p_conversation and public.chat_can_read(c.booking_id);
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  select * into anchor from public.messages where id=p_through and conversation_id=p_conversation;
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  update public.messages set read_at=clock_timestamp() where conversation_id=p_conversation
    and sender_id<>auth.uid() and read_at is null and (created_at,id)<=(anchor.created_at,anchor.id);
  get diagnostics changed=row_count;
  return jsonb_build_object('updated',changed);
end;
$$;

create function public.notify_chat_message()
returns trigger language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
  select b1.* into b from public.bookings b1 join public.conversations c on c.booking_id=b1.id where c.id=new.conversation_id;
  insert into public.notifications(user_id,type,payload,event_key) values(
    case when new.sender_id=b.renter_id then b.owner_id else b.renter_id end,'chat.message',
    jsonb_build_object('booking_id',b.id,'conversation_id',new.conversation_id,'message_id',new.id),'message:'||new.id)
    on conflict(event_key) do nothing;
  return new;
end;
$$;
create trigger chat_message_notification after insert on public.messages for each row execute function public.notify_chat_message();
create function public.notify_booking_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into public.notifications(user_id,type,payload,event_key) values(new.owner_id,'booking.requested',
      jsonb_build_object('booking_id',new.id,'status',new.status),'booking:'||new.id||':requested:'||new.owner_id)
      on conflict(event_key) do nothing;
  elsif old.status is distinct from new.status then
    insert into public.notifications(user_id,type,payload,event_key)
      select actor,'booking.status',jsonb_build_object('booking_id',new.id,'status',new.status),
        'booking:'||new.id||':'||new.status||':'||actor from unnest(array[new.renter_id,new.owner_id])actor
      on conflict(event_key) do nothing;
  end if;
  return new;
end;
$$;
create trigger booking_notification after insert or update of status on public.bookings for each row execute function public.notify_booking_event();

create function public.notification_json(n public.notifications)
returns jsonb language sql immutable set search_path='' as $$ select to_jsonb(n)-'event_key'; $$;
create function public.list_my_notifications(p_unread boolean default false,p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.communication_user(); result jsonb; total bigint; unread bigint;
begin
  if actor is null then raise exception using errcode='42501',message='sign_in'; end if;
  if p_unread is null or p_page is null or p_page not between 1 and 10000 or p_page_size is null or p_page_size not between 1 and 50 then
    raise exception using errcode='22023',message='validation'; end if;
  select count(*) filter(where not p_unread or read_at is null),count(*) filter(where read_at is null) into total,unread
    from public.notifications where user_id=actor;
  select coalesce(jsonb_agg(public.notification_json(n) order by n.created_at desc,n.id desc),'[]'::jsonb) into result
    from (select * from public.notifications where user_id=actor and (not p_unread or read_at is null)
      order by created_at desc,id desc limit p_page_size offset(p_page-1)*p_page_size)n;
  return jsonb_build_object('data',result,'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,'total',total),'unread_count',unread);
end;
$$;
create function public.mark_notification_read(p_notification uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.communication_user(); n public.notifications;
begin
  if actor is null then raise exception using errcode='42501',message='sign_in'; end if;
  select * into n from public.notifications where id=p_notification and user_id=actor for update;
  if not found then raise exception using errcode='P0001',message='not_found'; end if;
  if n.read_at is null then update public.notifications set read_at=clock_timestamp() where id=n.id returning * into n; end if;
  return public.notification_json(n);
end;
$$;

revoke all on function public.communication_user(),public.chat_can_read(uuid),public.chat_conversation_json(public.conversations),
  public.open_booking_chat(uuid),public.list_my_conversations(integer,integer),public.list_chat_messages(uuid,uuid,integer),
  public.send_chat_message(uuid,uuid,text),public.mark_chat_read(uuid,uuid),public.notify_chat_message(),public.notify_booking_event(),
  public.notification_json(public.notifications),public.list_my_notifications(boolean,integer,integer),public.mark_notification_read(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.communication_user(),public.chat_can_read(uuid),public.open_booking_chat(uuid),
  public.list_my_conversations(integer,integer),public.list_chat_messages(uuid,uuid,integer),public.send_chat_message(uuid,uuid,text),
  public.mark_chat_read(uuid,uuid),public.list_my_notifications(boolean,integer,integer),public.mark_notification_read(uuid) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end; $$;
commit;

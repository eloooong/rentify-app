-- Recheck eligibility for an already-created payment capability, not only POST.
begin;
create function public.checkout_can_pay(p_booking uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.bookings b join public.listings l on l.id=b.listing_id
    where b.id=p_booking and b.status='accepted' and b.payment_expires_at>statement_timestamp()
      and b.request_key is not null and b.policy_version='demo-booking-v1' and l.status='published'
      and public.booking_actor_eligible(b.owner_id) and public.booking_actor_eligible(b.renter_id)
      and not public.booking_device_unavailable(l.id,statement_timestamp()));
$$;
create or replace function public.checkout_payload(a public.checkout_attempts)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'booking_id',a.booking_id,'state',a.state,
    'rental_amount',a.rental_amount,'deposit_amount',a.deposit_amount,'total_amount',a.total_amount,
    'currency','PHP','method','gcash','test_mode',true,'policy_version',a.policy_version,
    'expires_at',b.payment_expires_at,'consented_at',a.consented_at,
    'checkout_url',case when auth.uid()=a.renter_id and a.state='open' and public.checkout_can_pay(b.id)
      then a.checkout_url else null end,
    'refund_due_amount',(select coalesce(sum(r.amount),0) from public.payment_receipts r where r.attempt_id=a.id and r.disposition='refund_due'))
  from public.bookings b where b.id=a.booking_id;
$$;
revoke all on function public.checkout_can_pay(uuid) from public,anon,authenticated,service_role;
grant execute on function public.checkout_can_pay(uuid) to service_role;
commit;

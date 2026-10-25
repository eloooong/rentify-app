-- Legacy PayMongo attempts remain history, without an active checkout capability.
begin;
create or replace function public.checkout_payload(a public.checkout_attempts)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'booking_id',a.booking_id,'state',case when a.provider='paymongo' and a.state in ('creating','open') then 'review' else a.state end,
    'rental_amount',a.rental_amount,'deposit_amount',a.deposit_amount,'total_amount',a.total_amount,
    'currency','PHP','method','gcash','test_mode',true,'policy_version',a.policy_version,
    'expires_at',b.payment_expires_at,'consented_at',a.consented_at,
    'checkout_url',case when a.provider='xendit' and auth.uid()=a.renter_id and a.state='open' and public.checkout_can_pay(b.id) then a.checkout_url else null end,
    'refund_due_amount',(select coalesce(sum(r.amount-(select coalesce(sum(f.amount),0) from public.refund_attempts f
      where f.receipt_id=r.id and f.state='succeeded')),0) from public.payment_receipts r where r.attempt_id=a.id and r.disposition='refund_due'))
  from public.bookings b where b.id=a.booking_id;
$$;
commit;

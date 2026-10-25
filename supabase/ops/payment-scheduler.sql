-- Operator-only, per-environment activation after migrations and HTTPS preflight.
-- Populate Vault through a secure operator session; never paste secrets in Git.
-- Required Vault names: rentify_test_app_origin, rentify_test_worker_token.
begin;
do $$
declare origin text; token text;
begin
  select decrypted_secret into origin from vault.decrypted_secrets where name='rentify_test_app_origin';
  select decrypted_secret into token from vault.decrypted_secrets where name='rentify_test_worker_token';
  if origin is null or origin !~ '^https://[a-z0-9][a-z0-9.-]+$' or token is null or length(token)<32 then
    raise exception 'Configure the canonical HTTPS origin and scoped worker token in Vault first';
  end if;
end;
$$;
select cron.schedule('rentify-test-payments','* * * * *',$job$
  select net.http_post(
    url:=(select decrypted_secret from vault.decrypted_secrets where name='rentify_test_app_origin')||'/api/payments/reconcile',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='rentify_test_worker_token')),
    body:='{}'::jsonb,timeout_milliseconds:=45000
  );
$job$);
select cron.schedule('rentify-test-refunds','* * * * *',$job$
  select net.http_post(
    url:=(select decrypted_secret from vault.decrypted_secrets where name='rentify_test_app_origin')||'/api/payments/refunds/reconcile',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='rentify_test_worker_token')),
    body:='{}'::jsonb,timeout_milliseconds:=45000
  );
$job$);
commit;

-- Storage for uploaded statements and receipts. ARCHITECTURE.md §1, §4.4.
--
-- §4.4: the client uploads here first and sends the Edge Function a path, so the
-- file crosses the phone once rather than twice.
--
-- Both buckets are PRIVATE. A bank statement is the most sensitive thing this app
-- ever touches; a public bucket would make every uploaded statement reachable by
-- anyone holding the URL.

-- HEIC is deliberately not allowed on `receipts`. It is the default iPhone camera
-- format, but the Messages API cannot read it, so the app converts to JPEG before
-- upload. Rejecting it at the bucket makes that a clear upload error rather than an
-- opaque model failure later.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('statements', 'statements', false, 26214400, array['application/pdf']),
  ('receipts',   'receipts',   false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Objects are namespaced by user: '<user_id>/<filename>'. The policies below read
-- that first path segment, so a user can only ever touch their own folder — the
-- same rule the tables use, applied to files.
do $storage_policies$
declare
  b text;
begin
  foreach b in array array['statements', 'receipts']
  loop
    execute format('drop policy if exists %I on storage.objects', b || '_read_own');
    execute format('drop policy if exists %I on storage.objects', b || '_insert_own');
    execute format('drop policy if exists %I on storage.objects', b || '_update_own');
    execute format('drop policy if exists %I on storage.objects', b || '_delete_own');

    execute format($p$
      create policy %I on storage.objects for select to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_read_own', b);

    execute format($p$
      create policy %I on storage.objects for insert to authenticated
      with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_insert_own', b);

    execute format($p$
      create policy %I on storage.objects for update to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_update_own', b, b);

    execute format($p$
      create policy %I on storage.objects for delete to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_delete_own', b);
  end loop;
end
$storage_policies$;

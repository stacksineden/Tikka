-- The live feed hears about new link activity through Realtime Broadcast instead of
-- postgres_changes (which delivered only now and then on this project). Each new event sends a
-- bare "activity" signal, with no names or numbers, on the private channel "drop:<id>"; the
-- dashboard then refetches the feed through its own API. Only the business's team may listen.

alter publication supabase_realtime drop table public.events;

create function private.signal_drop_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.drop_id is not null then
    perform realtime.send(jsonb_build_object('type', new.type), 'activity', 'drop:' || new.drop_id::text, true);
  end if;
  return null;
end;
$$;

create trigger signal_drop_activity after insert on public.events
for each row execute function private.signal_drop_activity();

create policy "team hears its drops" on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1 from public.drops d
    where 'drop:' || d.id::text = (select realtime.topic()) and private.is_member(d.business_id)
  )
);

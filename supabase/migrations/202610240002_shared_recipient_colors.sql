begin;
alter table public.recipients add column color text not null default '#e9eeff'
  check (color ~ '^#[0-9a-fA-F]{6}$');

-- Commun E&A remains protected; only its illustration colour may change.
create or replace function public.guard_recipient() returns trigger
language plpgsql set search_path=public as $$begin
 if TG_OP='INSERT' then
   if new.is_common then raise exception 'common_is_protected';end if;
 elsif TG_OP='DELETE' then
   if old.is_common then raise exception 'common_is_protected';end if;
   return old;
 else
   if old.is_common and (to_jsonb(new)-'color') is distinct from (to_jsonb(old)-'color') then
     raise exception 'common_is_protected';
   end if;
   if new.is_common<>old.is_common or new.id<>old.id then raise exception 'common_is_protected';end if;
 end if;
 return new;
end$$;

-- Preserve existing choices: Alex first, then another administrator if absent.
update public.recipients r set color=coalesce((
 select p.preferences->'recipientColors'->>r.id::text from public.profiles p
 where (p.preferences->'recipientColors'->>r.id::text) ~ '^#[0-9a-fA-F]{6}$'
 order by (lower(p.display_name)='alex') desc,p.created_at,p.id limit 1
),'#e9eeff');

create or replace function public.set_recipient_color(person uuid,new_color text)
returns boolean language plpgsql security definer set search_path=public as $$begin
 if not public.is_admin() then raise exception 'not_authorized';end if;
 if new_color is null or new_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid_color';end if;
 update public.recipients set color=lower(new_color) where id=person and deleted_at is null;
 if not found then raise exception 'recipient_not_found';end if;
 return true;
end$$;
create or replace function public.add_recipient_with_color(new_name text,new_color text)
returns uuid language plpgsql security definer set search_path=public as $$declare person uuid;begin
 if not public.is_admin() then raise exception 'not_authorized';end if;
 person:=public.add_recipient(new_name);
 perform public.set_recipient_color(person,new_color);
 return person;
end$$;
revoke all on function public.set_recipient_color(uuid,text),public.add_recipient_with_color(text,text) from public,anon;
grant execute on function public.set_recipient_color(uuid,text),public.add_recipient_with_color(text,text) to authenticated;

-- Realtime is optional locally; hosted Supabase supplies this publication.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='recipients') then
   alter publication supabase_realtime add table public.recipients;
 end if;
end$$;
notify pgrst,'reload schema';
commit;

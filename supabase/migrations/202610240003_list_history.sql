begin;
alter table public.activity add column list_ids uuid[] not null default '{}';
create index activity_lists on public.activity using gin(list_ids);

-- Snapshot the lists involved in an event, including a list an idea has left.
create function public.history_proposal_lists(iid uuid,rid uuid,memberships uuid[],all_lists boolean,pid uuid)
returns uuid[] language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(l.id),'{}'::uuid[]) from public.lists l
 where l.id=any(memberships) or (all_lists and not exists(
  select 1 from public.proposals p where p.id<>pid and p.idea_id=iid
  and p.recipient_id is not distinct from rid and l.id=any(p.list_ids)
 ))
$$;
create function public.history_idea_lists(iid uuid) returns uuid[]
language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(distinct lid),'{}'::uuid[]) from public.proposals p
 cross join lateral unnest(public.history_proposal_lists(p.idea_id,p.recipient_id,p.list_ids,p.is_global,p.id)) lid
 where p.idea_id=iid
$$;
create function public.scope_activity() returns trigger
language plpgsql security definer set search_path=public as $$begin
 if new.idea_id is not null and cardinality(new.list_ids)=0 and new.message in ('Idée créée','Idée modifiée') then
   new.list_ids:=public.history_idea_lists(new.idea_id);
 end if;
 return new;
end$$;
create trigger scope_activity before insert on public.activity for each row execute function public.scope_activity();

-- Keep existing idea audits and notification logic; broaden proposal auditing.
create or replace function public.audit_proposal() returns trigger
language plpgsql security definer set search_path=public as $$
declare delta jsonb; scopes uuid[]; label text;begin
 scopes:=public.history_proposal_lists(new.idea_id,new.recipient_id,new.list_ids,new.is_global,new.id);
 if TG_OP='INSERT' then
   select coalesce(jsonb_object_agg(k,jsonb_build_object('before',null,'after',to_jsonb(new)->k)),'{}'::jsonb) into delta
   from unnest(array['recipient_id','list_ids','priority','is_global','collective','target_amount']) k;
   delta:=delta || jsonb_build_object('title',jsonb_build_object('before',null,'after',(select title from public.ideas where id=new.idea_id)));
   label:='Idée ajoutée';
 else
   select coalesce(array_agg(distinct lid),'{}'::uuid[]) into scopes from unnest(scopes || public.history_proposal_lists(old.idea_id,old.recipient_id,old.list_ids,old.is_global,old.id)) lid;
   select coalesce(jsonb_object_agg(k,jsonb_build_object('before',to_jsonb(old)->k,'after',to_jsonb(new)->k)),'{}'::jsonb) into delta
   from jsonb_object_keys(to_jsonb(new)) k where k not in('id','idea_id','created_at') and (to_jsonb(old)->k) is distinct from (to_jsonb(new)->k);
   label:=case
     when old.reserved is distinct from new.reserved then case when new.reserved then 'Idée réservée' else 'Idée remise à disposition' end
     when old.contributed is distinct from new.contributed then 'Participation mise à jour'
     when old.archived_at is null and new.archived_at is not null then 'Idée archivée'
     when old.archived_at is not null and new.archived_at is null then 'Idée restaurée'
     when old.list_ids is distinct from new.list_ids then 'Listes de l’idée modifiées'
     else 'Paramètres de l’idée modifiés' end;
 end if;
 if delta<>'{}'::jsonb then
   insert into public.activity(idea_id,actor_id,message,changes,list_ids) values(new.idea_id,auth.uid(),label,delta,scopes);
 end if;
 -- Preserve the prior transactional notification behaviour.
 if TG_OP='UPDATE' and (old.recipient_id,old.archived_at,old.archive_reason,old.target_amount) is distinct from(new.recipient_id,new.archived_at,new.archive_reason,new.target_amount) then
   insert into public.email_jobs(email,kind,payload) select r.email,'changed',jsonb_build_object('title',case when i.visibility='public' then i.title else 'Votre cadeau' end,'accessToken',r.access_token)
   from public.reservations r join public.ideas i on i.id=new.idea_id where r.proposal_id=new.id and r.cancelled_at is null;
 end if;
 return new;
end$$;
drop trigger audit_proposal on public.proposals;
create trigger audit_proposal after insert or update on public.proposals for each row execute function public.audit_proposal();

create function public.audit_list() returns trigger
language plpgsql security definer set search_path=public as $$declare delta jsonb;label text;begin
 if TG_OP='INSERT' then
   select coalesce(jsonb_object_agg(k,jsonb_build_object('before',null,'after',to_jsonb(new)->k)),'{}'::jsonb) into delta
   from unnest(array['name','slogan','image_url']) k where to_jsonb(new)->k is not null and to_jsonb(new)->k not in ('null'::jsonb,'""'::jsonb);
   label:='Liste créée';
 else
   select coalesce(jsonb_object_agg(k,jsonb_build_object('before',to_jsonb(old)->k,'after',to_jsonb(new)->k)),'{}'::jsonb) into delta
   from unnest(array['name','slogan','image_url','archived_at']) k where (to_jsonb(old)->k) is distinct from (to_jsonb(new)->k);
   label:=case when old.archived_at is null and new.archived_at is not null then 'Liste archivée'
     when old.archived_at is not null and new.archived_at is null then 'Liste restaurée' else 'Liste modifiée' end;
 end if;
 if delta<>'{}'::jsonb then
   insert into public.activity(actor_id,message,changes,list_ids) values(auth.uid(),label,delta,array[new.id]);
 end if;
 return new;
end$$;
create trigger audit_list after insert or update on public.lists for each row execute function public.audit_list();
create function public.audit_list_share() returns trigger
language plpgsql security definer set search_path=public as $$begin
 insert into public.activity(actor_id,message,changes,list_ids)
 values(new.created_by,'Partage préparé',jsonb_build_object('contact_name',jsonb_build_object('before',null,'after',new.contact_name),'channel',jsonb_build_object('before',null,'after',new.channel)),array[new.list_id]);
 return new;
end$$;
create trigger audit_list_share after insert on public.share_history for each row execute function public.audit_list_share();

-- Retain earlier events where their current list association can be determined.
-- This cannot recreate changes that were never logged before this migration.
update public.activity set list_ids=public.history_idea_lists(idea_id) where idea_id is not null;
insert into public.activity(actor_id,message,changes,list_ids,created_at)
select created_by,'Partage préparé',jsonb_build_object('contact_name',jsonb_build_object('before',null,'after',contact_name),'channel',jsonb_build_object('before',null,'after',channel)),array[list_id],created_at from public.share_history;
revoke all on function public.history_proposal_lists(uuid,uuid,uuid[],boolean,uuid),public.history_idea_lists(uuid),public.scope_activity(),public.audit_list(),public.audit_list_share() from public,anon,authenticated;
-- Existing activity RLS checks current idea visibility, even for a past list event.
notify pgrst,'reload schema';
commit;

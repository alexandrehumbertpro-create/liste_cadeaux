begin;
alter table public.recipients add column if not exists deleted_at timestamptz;
update public.recipients set name='Commun E&A' where is_common and name<>'Commun E&A';
create or replace function public.guard_recipient() returns trigger language plpgsql set search_path=public as $$begin
 if TG_OP='INSERT' then
   if new.is_common then raise exception 'common_is_protected';end if;
 else
   if old.is_common then raise exception 'common_is_protected';end if;
   if TG_OP='UPDATE' and(new.is_common or new.id<>old.id) then raise exception 'common_is_protected';end if;
 end if;
 if TG_OP='DELETE' then return old;end if;return new;
end$$;
create trigger guard_recipient before insert or update or delete on public.recipients for each row execute function public.guard_recipient();

create or replace function public.add_recipient(new_name text) returns uuid language plpgsql security definer set search_path=public as $$declare person public.recipients;begin
 if not public.is_admin() then raise exception 'not_authorized';end if;
 if length(trim(new_name)) not between 1 and 100 then raise exception 'invalid_name';end if;
 select * into person from public.recipients where lower(name)=lower(trim(new_name)) for update;
 if found then
   if person.deleted_at is null then raise exception 'recipient_exists';end if;
   update public.recipients set deleted_at=null where id=person.id;return person.id;
 end if;
 insert into public.recipients(name) values(trim(new_name)) returning * into person;return person.id;
end$$;
create or replace function public.rename_recipient(person uuid,new_name text) returns boolean language plpgsql security definer set search_path=public as $$begin
 if not public.is_admin() then raise exception 'not_authorized';end if;
 if length(trim(new_name)) not between 1 and 100 then raise exception 'invalid_name';end if;
 update public.recipients set name=trim(new_name) where id=person and deleted_at is null;
 if not found then raise exception 'recipient_not_found';end if;return true;
end$$;
create or replace function public.remove_recipient(person uuid,archive_ideas boolean) returns boolean language plpgsql security definer set search_path=public as $$
declare gift uuid;begin
 if not public.is_admin() then raise exception 'not_authorized';end if;
 perform 1 from public.recipients where id=person and not is_common and deleted_at is null for update;
 if not found then
   if exists(select 1 from public.recipients where id=person and is_common) then raise exception 'common_is_protected';end if;
   raise exception 'recipient_not_found';
 end if;
 -- Preserve the other administrator's private ideas. The removed person is treated as unfiled in their view.
 for gift in select p.id from public.proposals p where p.recipient_id=person and p.archived_at is null and public.can_see_idea(p.idea_id) loop
   perform public.reset_gift(gift,false);
   if archive_ideas then
     update public.proposals set archived_at=now(),archive_reason='abandoned',archive_note='Idée retirée lors de la suppression de la personne' where id=gift;
   else
     update public.proposals set recipient_id=null where id=gift;
   end if;
 end loop;
 update public.recipients set deleted_at=now() where id=person;
 return true;
end$$;
create or replace function public.guard_proposal() returns trigger language plpgsql security definer set search_path=public as $$begin
 if TG_OP='INSERT' and (new.reserved or new.contributed<>0) then raise exception 'reservation_state_is_managed';end if;
 if TG_OP='UPDATE' and new.idea_id<>old.idea_id then raise exception 'idea_is_immutable'; end if;
 if exists(select 1 from unnest(new.list_ids) l where not exists(select 1 from public.lists where id=l)) then raise exception 'unknown_list';end if;
 if new.recipient_id is not null and (TG_OP='INSERT' or new.recipient_id is distinct from old.recipient_id) and exists(select 1 from public.recipients where id=new.recipient_id and deleted_at is not null) then raise exception 'recipient_not_found';end if;
 if new.recipient_id is not null and not exists(select 1 from public.ideas where id=new.idea_id and new.recipient_id=any(candidates)) then raise exception 'recipient_not_a_candidate';end if;
 if TG_OP='UPDATE' and (new.collective,new.target_amount) is distinct from(old.collective,old.target_amount) then
 if old.contributed>0 and not new.collective then raise exception 'active_collective_participations';end if;
 if new.collective then new.reserved=new.contributed>=new.target_amount;end if;end if;
 return new;
end$$;

-- OAuth credentials stay encrypted and inaccessible to both anonymous and authenticated SQL clients.
alter table public.email_jobs drop constraint email_jobs_status_check;
alter table public.email_jobs add constraint email_jobs_status_check check(status in('pending','sending','sent','cancelled'));
create table public.admin_mailboxes(profile_id uuid primary key references public.profiles(id) on delete cascade,email text not null,refresh_token text not null,connected_at timestamptz not null default now());
alter table public.admin_mailboxes enable row level security;
revoke all on public.admin_mailboxes from anon,authenticated;
grant all on public.admin_mailboxes to service_role;
create or replace function public.save_gift_with_notifications(data jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;idea public.ideas;target uuid;targets uuid[];begin
 if not public.is_admin() then raise exception 'not_authorized';end if;
 targets=array(select distinct jsonb_array_elements_text(coalesce(data->'notifyIds','[]'))::uuid);
 if cardinality(targets)>2 or exists(select 1 from unnest(targets) as t(id) where not exists(select 1 from public.profiles p where p.id=t.id)) then raise exception 'invalid_notification_recipient';end if;
 if cardinality(targets)>0 and nullif(data->>'proposalId','') is not null then raise exception 'notify_only_on_add';end if;
 if data->>'visibility'='private' and exists(select 1 from unnest(targets) as t(id) where t.id<>auth.uid()) then raise exception 'private_notification_forbidden';end if;
 result=public.save_gift_for_recipients(data);
 select i.* into idea from public.ideas i join public.proposals p on p.idea_id=i.id where p.id=result;
 foreach target in array targets loop
   insert into public.email_jobs(email,kind,payload) select email,'idea_added',jsonb_build_object('senderProfileId',auth.uid(),'recipientProfileId',target,'ideaId',idea.id,'proposalId',result,'title',idea.title) from public.profiles where id=target;
 end loop;
 return result;
end$$;
create or replace function public.claim_email_jobs_for_provider(provider text) returns setof public.email_jobs language sql security definer set search_path=public as $$
 update public.email_jobs set status='sending',locked_at=now(),attempts=attempts+1 where id in(
  select j.id from public.email_jobs j where j.attempts<10 and(j.status='pending' or(j.status='sending' and j.locked_at<now()-interval '10 minutes')) and
  ((provider='gmail' and j.kind in('idea_added','quick_share') and exists(select 1 from public.admin_mailboxes m where m.profile_id::text=j.payload->>'senderProfileId')) or
   (provider='resend' and j.kind not in('idea_added','quick_share')))
  order by j.created_at for update skip locked limit 5
 ) returning *
$$;
revoke all on function public.add_recipient(text),public.rename_recipient(uuid,text),public.remove_recipient(uuid,boolean),public.save_gift_with_notifications(jsonb) from public,anon;
grant execute on function public.add_recipient(text),public.rename_recipient(uuid,text),public.remove_recipient(uuid,boolean),public.save_gift_with_notifications(jsonb) to authenticated;
revoke all on function public.claim_email_jobs_for_provider(text) from public,anon,authenticated;
grant execute on function public.claim_email_jobs_for_provider(text) to service_role;
create or replace function public.shared_list(token uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$declare l public.lists;begin
 select * into l from public.lists where share_token=token;if not found then return null;end if;
 return jsonb_build_object('id',l.id,'name',l.name,'slogan',l.slogan,'imageUrl',l.image_url,'archived',l.archived_at is not null,'gifts',case when l.archived_at is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',i.title,'description',i.description,'specifications',i.specifications,'url',i.url,'imageUrl',i.image_url,'imageCredit',i.image_credit,'priceMin',i.price_min,'priceMax',i.price_max,'priority',p.priority,'recipient',r.name,'recipientId',r.id,'collective',p.collective,'targetAmount',p.target_amount,'contributed',p.contributed,'reserved',p.reserved)) from public.proposals p join public.ideas i on i.id=p.idea_id join public.recipients r on r.id=p.recipient_id where r.deleted_at is null and p.archived_at is null and i.visibility='public' and (l.id=any(p.list_ids) or (p.is_global and not exists(select 1 from public.proposals override where override.id<>p.id and override.idea_id=p.idea_id and override.recipient_id is not distinct from p.recipient_id and l.id=any(override.list_ids))))),'[]'::jsonb) end);
end$$;
create or replace function public.reserve_gift(token uuid, gift uuid, guest_name text, guest_email text, contribution numeric default null) returns jsonb language plpgsql security definer set search_path=public as $$declare p public.proposals;i public.ideas;r public.reservations;begin
 select i1.* into i from public.ideas i1 join public.proposals p1 on p1.idea_id=i1.id where p1.id=gift for share of i1;
 perform 1 from public.lists where share_token=token and archived_at is null for share;
 select p1.* into p from public.proposals p1 join public.lists l on l.share_token=token and l.archived_at is null where p1.id=gift and(p1.is_global or l.id=any(p1.list_ids)) for update of p1;
 if not found or not exists(select 1 from public.recipients where id=p.recipient_id and deleted_at is null) or p.archived_at is not null or p.reserved or (p.is_global and exists(select 1 from public.proposals override join public.lists l on l.share_token=token where override.id<>p.id and override.idea_id=p.idea_id and override.recipient_id is not distinct from p.recipient_id and l.id=any(override.list_ids))) then raise exception 'gift_unavailable';end if;
 if i.visibility<>'public' or p.recipient_id is null then raise exception 'gift_unavailable';end if;
 if length(trim(guest_name)) not between 1 and 100 or length(guest_email)>254 or guest_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_guest';end if;
 if p.collective then if contribution is null or contribution<=0 or contribution<>round(contribution,2) or contribution>p.target_amount-p.contributed then raise exception 'invalid_contribution';end if;else contribution=null;end if;
 insert into public.reservations(proposal_id,name,email,amount) values(gift,trim(guest_name),lower(trim(guest_email)),contribution) returning * into r;
 update public.proposals set contributed=case when p.collective then p.contributed+contribution else 0 end,reserved=not p.collective or p.contributed+coalesce(contribution,0)>=p.target_amount where id=gift;
 insert into public.email_jobs(email,kind,payload) values(r.email,'reserved',jsonb_build_object('title',i.title,'accessToken',r.access_token,'recipient',(select name from public.recipients where id=p.recipient_id),'specifications',i.specifications,'priceMin',i.price_min,'priceMax',i.price_max,'url',i.url,'amount',r.amount));
 insert into public.email_jobs(email,kind,payload) select email,'admin_reserved',jsonb_build_object('title',i.title) from public.profiles where coalesce((preferences->>'email')::boolean,true);
 return jsonb_build_object('accessToken',r.access_token);
end$$;
notify pgrst, 'reload schema';
commit;

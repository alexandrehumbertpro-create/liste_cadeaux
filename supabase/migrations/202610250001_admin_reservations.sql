begin;
alter table public.reservations add column reserved_by uuid references public.profiles(id);
alter table public.reservations alter column email drop not null;
alter table public.reservations add constraint email_optional_only_for_admin check(email is not null or reserved_by is not null);

-- Later changes/cancellations must not try to email a person with no address.
create function public.skip_unaddressed_reservation_email() returns trigger
language plpgsql set search_path=public as $$begin
 if new.email is null and new.kind in('reserved','changed','cancelled') then return null;end if;
 return new;
end$$;
create trigger skip_unaddressed_reservation_email before insert on public.email_jobs
for each row execute function public.skip_unaddressed_reservation_email();
revoke all on function public.skip_unaddressed_reservation_email() from public,anon,authenticated;

-- Guest reservations continue to require an email, including direct SQL calls.
create or replace function public.reserve_gift(token uuid, gift uuid, guest_name text, guest_email text, contribution numeric default null) returns jsonb language plpgsql security definer set search_path=public as $$declare p public.proposals;i public.ideas;r public.reservations;begin
 select i1.* into i from public.ideas i1 join public.proposals p1 on p1.idea_id=i1.id where p1.id=gift for share of i1;
 perform 1 from public.lists where share_token=token and archived_at is null for share;
 select p1.* into p from public.proposals p1 join public.lists l on l.share_token=token and l.archived_at is null where p1.id=gift and(p1.is_global or l.id=any(p1.list_ids)) for update of p1;
 if not found or not exists(select 1 from public.recipients where id=p.recipient_id and deleted_at is null) or p.archived_at is not null or p.reserved or (p.is_global and exists(select 1 from public.proposals override join public.lists l on l.share_token=token where override.id<>p.id and override.idea_id=p.idea_id and override.recipient_id is not distinct from p.recipient_id and l.id=any(override.list_ids))) then raise exception 'gift_unavailable';end if;
 if i.visibility<>'public' or p.recipient_id is null then raise exception 'gift_unavailable';end if;
 if guest_name is null or guest_email is null or length(trim(guest_name)) not between 1 and 100 or length(guest_email)>254 or guest_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_guest';end if;
 if p.collective then if contribution is null or contribution<=0 or contribution<>round(contribution,2) or contribution>p.target_amount-p.contributed then raise exception 'invalid_contribution';end if;else contribution=null;end if;
 insert into public.reservations(proposal_id,name,email,amount) values(gift,trim(guest_name),lower(trim(guest_email)),contribution) returning * into r;
 update public.proposals set contributed=case when p.collective then p.contributed+contribution else 0 end,reserved=not p.collective or p.contributed+coalesce(contribution,0)>=p.target_amount where id=gift;
 insert into public.email_jobs(email,kind,payload) values(r.email,'reserved',jsonb_build_object('title',i.title,'accessToken',r.access_token,'recipient',(select name from public.recipients where id=p.recipient_id),'specifications',i.specifications,'priceMin',i.price_min,'priceMax',i.price_max,'url',i.url,'amount',r.amount));
 insert into public.email_jobs(email,kind,payload) select email,'admin_reserved',jsonb_build_object('title',i.title) from public.profiles where coalesce((preferences->>'email')::boolean,true);
 return jsonb_build_object('accessToken',r.access_token);
end$$;

create function public.admin_reserve_gift(list_ref uuid,gift uuid,guest_name text,guest_email text default null,contribution numeric default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.proposals;i public.ideas;r public.reservations;address text;begin
 if not public.is_admin() then raise exception 'not_authorized';end if;
 address:=nullif(lower(trim(guest_email)),'');
 if guest_name is null or length(trim(guest_name)) not between 1 and 100 or (address is not null and (length(address)>254 or address!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then raise exception 'invalid_guest';end if;
 select i1.* into i from public.ideas i1 join public.proposals p1 on p1.idea_id=i1.id where p1.id=gift for share of i1;
 perform 1 from public.lists where id=list_ref and archived_at is null for share;
 if not found then raise exception 'gift_unavailable';end if;
 select p1.* into p from public.proposals p1 where p1.id=gift and (
   list_ref=any(p1.list_ids) or (p1.is_global and not exists(select 1 from public.proposals other where other.id<>p1.id and other.idea_id=p1.idea_id and other.recipient_id is not distinct from p1.recipient_id and list_ref=any(other.list_ids)))
 ) for update of p1;
 if not found or not public.can_see_idea(i.id) or p.archived_at is not null or p.reserved or not exists(select 1 from public.recipients where id=p.recipient_id and deleted_at is null) then raise exception 'gift_unavailable';end if;
 if p.collective then
   if contribution is null or contribution<=0 or contribution<>round(contribution,2) or contribution>p.target_amount-p.contributed then raise exception 'invalid_contribution';end if;
 else contribution:=null;end if;
 insert into public.reservations(proposal_id,name,email,amount,reserved_by) values(gift,trim(guest_name),address,contribution,auth.uid()) returning * into r;
 -- This update is audited with the authenticated administrator as the author.
 update public.proposals set contributed=case when p.collective then p.contributed+contribution else 0 end,reserved=not p.collective or p.contributed+coalesce(contribution,0)>=p.target_amount where id=gift;
 if address is not null then
   insert into public.email_jobs(email,kind,payload) values(address,'reserved',jsonb_build_object('title',i.title,'accessToken',r.access_token,'recipient',(select name from public.recipients where id=p.recipient_id),'specifications',i.specifications,'priceMin',i.price_min,'priceMax',i.price_max,'url',i.url,'amount',r.amount));
 end if;
 insert into public.email_jobs(email,kind,payload) select email,'admin_reserved',jsonb_build_object('title',i.title) from public.profiles where coalesce((preferences->>'email')::boolean,true) and (i.visibility<>'private' or id=i.owner_id);
 return jsonb_build_object('emailQueued',address is not null);
end$$;
revoke all on function public.admin_reserve_gift(uuid,uuid,text,text,numeric) from public,anon;
grant execute on function public.admin_reserve_gift(uuid,uuid,text,text,numeric) to authenticated;
notify pgrst,'reload schema';
commit;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 100),
 email text not null, preferences jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid()) $$;
create table public.recipients(id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100), is_common boolean not null default false, created_at timestamptz default now());
create unique index recipients_name on public.recipients(lower(name));
create unique index one_common on public.recipients(is_common) where is_common;
insert into public.recipients(name,is_common) values('Commun',true),('Alex',false),('Elise',false);
create table public.lists(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 150),slogan text not null default '' check(length(slogan)<=1000),image_url text,share_token uuid not null unique default gen_random_uuid(),archived_at timestamptz,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now());
create table public.ideas(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id),title text not null check(length(title) between 1 and 200),description text not null default '',specifications text not null default '',private_note text not null default '',url text,image_url text,image_credit jsonb,price_min numeric(12,2),price_max numeric(12,2),visibility text not null default 'private' check(visibility in('private','household','public')),candidates uuid[] not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(price_min is null or price_min>=0),check(price_max is null or(price_min is not null and price_max>=price_min)));
create function public.can_see_idea(idea_id uuid) returns boolean language sql stable security definer set search_path=public as $$select public.is_admin() and exists(select 1 from public.ideas where id=idea_id and(visibility<>'private' or owner_id=auth.uid()))$$;
create table public.proposals(id uuid primary key default gen_random_uuid(),idea_id uuid not null references public.ideas(id) on delete cascade,recipient_id uuid references public.recipients(id),list_ids uuid[] not null default '{}',is_global boolean not null default false,priority smallint not null default 2 check(priority between 0 and 2),collective boolean not null default false,target_amount numeric(12,2),contributed numeric(12,2) not null default 0,reserved boolean not null default false,archive_reason text check(archive_reason in('offered','abandoned','unavailable','other')),archive_note text not null default '',archived_at timestamptz,created_at timestamptz not null default now(),check(not collective or (target_amount is not null and target_amount>0 and target_amount>=contributed)),check(contributed>=0));
create table public.reservations(id uuid primary key default gen_random_uuid(),proposal_id uuid not null references public.proposals(id),name text not null check(length(name) between 1 and 100),email text not null check(length(email)<=254),amount numeric(12,2),access_token uuid not null unique default gen_random_uuid(),cancelled_at timestamptz,created_at timestamptz not null default now());
create table public.activity(id bigint generated always as identity primary key,idea_id uuid references public.ideas(id) on delete cascade,actor_id uuid references public.profiles(id),message text not null,changes jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create table public.share_history(id uuid primary key default gen_random_uuid(),list_id uuid not null references public.lists(id),created_by uuid not null references public.profiles(id),contact_name text not null,channel text not null check(channel in('whatsapp','gmail','sms')),created_at timestamptz not null default now());
create table public.email_jobs(id uuid primary key default gen_random_uuid(),email text not null,kind text not null,payload jsonb not null,status text not null default 'pending' check(status in('pending','sending','sent')),attempts integer not null default 0,locked_at timestamptz,last_error text,created_at timestamptz not null default now());
create table public.request_limits(key text primary key,count integer not null default 1,window_started timestamptz not null default now());
-- Protect ownership and creator-only privacy regardless of client implementation.
create function public.guard_idea() returns trigger language plpgsql security definer set search_path=public as $$begin
 if not public.is_admin() then raise exception 'not_authorized'; end if;
 if TG_OP='INSERT' and new.owner_id<>auth.uid() then raise exception 'not_authorized'; end if;
 if TG_OP='UPDATE' then
  if new.owner_id<>old.owner_id then raise exception 'owner_is_immutable'; end if;
  if old.visibility='private' and old.owner_id<>auth.uid() then raise exception 'not_authorized'; end if;
  if new.visibility='private' and old.owner_id<>auth.uid() then raise exception 'creator_only_privacy'; end if;
 end if;
 if exists(select 1 from unnest(new.candidates) c where not exists(select 1 from public.recipients r where r.id=c)) then raise exception 'unknown_recipient'; end if;
 if cardinality(new.candidates)>1 and exists(select 1 from public.recipients where id=any(new.candidates) and is_common) then raise exception 'common_is_exclusive'; end if;
 new.updated_at=now();return new;
end$$;
create trigger guard_idea before insert or update on public.ideas for each row execute function public.guard_idea();
create function public.guard_proposal() returns trigger language plpgsql security definer set search_path=public as $$begin
 if TG_OP='INSERT' and (new.reserved or new.contributed<>0) then raise exception 'reservation_state_is_managed';end if;
 if TG_OP='UPDATE' and new.idea_id<>old.idea_id then raise exception 'idea_is_immutable'; end if;
 if exists(select 1 from unnest(new.list_ids) l where not exists(select 1 from public.lists where id=l)) then raise exception 'unknown_list';end if;
 if new.recipient_id is not null and not exists(select 1 from public.ideas where id=new.idea_id and new.recipient_id=any(candidates)) then raise exception 'recipient_not_a_candidate';end if;
 if exists(select 1 from public.ideas where id=new.idea_id and visibility='public') and new.recipient_id is null then raise exception 'public_requires_recipient';end if;
 if TG_OP='UPDATE' and (new.collective,new.target_amount) is distinct from(old.collective,old.target_amount) then
 if old.contributed>0 and not new.collective then raise exception 'active_collective_participations';end if;
 if new.collective then new.reserved=new.contributed>=new.target_amount;end if;end if;
 return new;
end$$;
create trigger guard_proposal before insert or update on public.proposals for each row execute function public.guard_proposal();
alter table public.profiles enable row level security;alter table public.recipients enable row level security;alter table public.lists enable row level security;alter table public.ideas enable row level security;alter table public.proposals enable row level security;alter table public.reservations enable row level security;alter table public.activity enable row level security;alter table public.share_history enable row level security;alter table public.email_jobs enable row level security;alter table public.request_limits enable row level security;
create policy read_profiles on public.profiles for select to authenticated using(public.is_admin());
create policy own_preferences on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles to authenticated;grant update(preferences) on public.profiles to authenticated;
create policy manage_recipients on public.recipients for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy manage_lists on public.lists for all to authenticated using(public.is_admin()) with check(public.is_admin() and(created_by=auth.uid() or exists(select 1 from public.profiles where id=created_by)));
create policy manage_ideas on public.ideas for all to authenticated using(public.is_admin() and(visibility<>'private' or owner_id=auth.uid())) with check(public.is_admin() and(visibility<>'private' or owner_id=auth.uid()));
create policy manage_proposals on public.proposals for all to authenticated using(public.can_see_idea(idea_id)) with check(public.can_see_idea(idea_id));
create policy read_activity on public.activity for select to authenticated using(public.is_admin() and(idea_id is null or public.can_see_idea(idea_id)));
create policy manage_shares on public.share_history for all to authenticated using(public.is_admin()) with check(public.is_admin() and created_by=auth.uid());
-- Neither guests nor administrators may alter reservation totals directly.
grant select,insert,update on public.recipients,public.lists,public.ideas to authenticated;
grant select,insert on public.proposals to authenticated;
grant update(recipient_id,list_ids,is_global,priority,collective,target_amount,archive_reason,archive_note,archived_at) on public.proposals to authenticated;
grant select on public.activity to authenticated;grant select,insert on public.share_history to authenticated;
-- Audit and queue important changes atomically with the edit.
create function public.audit_idea() returns trigger language plpgsql security definer set search_path=public as $$declare changes jsonb;begin
 if TG_OP='INSERT' then insert into public.activity(idea_id,actor_id,message) values(new.id,auth.uid(),'Idée créée');return new;end if;
 select coalesce(jsonb_object_agg(k,jsonb_build_object('before',to_jsonb(old)->k,'after',to_jsonb(new)->k)),'{}') into changes from jsonb_object_keys(to_jsonb(new)) k where k not in('updated_at','created_at','owner_id','id') and(to_jsonb(old)->k) is distinct from(to_jsonb(new)->k);
 if changes<>'{}'::jsonb then insert into public.activity(idea_id,actor_id,message,changes) values(new.id,auth.uid(),'Idée modifiée',changes);end if;
 if (old.title,old.url,old.price_min,old.price_max,old.specifications,old.visibility) is distinct from(new.title,new.url,new.price_min,new.price_max,new.specifications,new.visibility) then
 insert into public.email_jobs(email,kind,payload) select r.email,'changed',jsonb_build_object('title',case when new.visibility='public' then new.title else 'Votre cadeau' end,'accessToken',r.access_token) from public.reservations r join public.proposals p on p.id=r.proposal_id where p.idea_id=new.id and r.cancelled_at is null;
 end if;return new;
end$$;
create trigger audit_idea after insert or update on public.ideas for each row execute function public.audit_idea();
create function public.audit_proposal() returns trigger language plpgsql security definer set search_path=public as $$begin
 if TG_OP='UPDATE' and (old.recipient_id,old.archived_at,old.archive_reason,old.target_amount) is distinct from(new.recipient_id,new.archived_at,new.archive_reason,new.target_amount) then
 insert into public.activity(idea_id,actor_id,message,changes) values(new.idea_id,auth.uid(),'Proposition modifiée',jsonb_build_object('recipient_id',jsonb_build_object('before',old.recipient_id,'after',new.recipient_id),'archive_reason',jsonb_build_object('before',old.archive_reason,'after',new.archive_reason)));
 insert into public.email_jobs(email,kind,payload) select r.email,'changed',jsonb_build_object('title',case when i.visibility='public' then i.title else 'Votre cadeau' end,'accessToken',r.access_token) from public.reservations r join public.ideas i on i.id=new.idea_id where r.proposal_id=new.id and r.cancelled_at is null;
 end if;return new;
end$$;
create trigger audit_proposal after update on public.proposals for each row execute function public.audit_proposal();
-- A transactional save prevents partially created ideas/proposals.
create function public.save_gift(data jsonb) returns uuid language plpgsql security definer set search_path=public as $$declare iid uuid;pid uuid;previous public.ideas;begin
 if not public.is_admin() then raise exception 'not_authorized';end if;
 iid=nullif(data->>'ideaId','')::uuid;
 if iid is not null then select * into previous from public.ideas where id=iid for update;if not found or not public.can_see_idea(iid) then raise exception 'not_authorized';end if;else iid=gen_random_uuid();end if;
 pid=nullif(data->>'proposalId','')::uuid;
 if pid is not null and not exists(select 1 from public.proposals where id=pid and idea_id=iid) then raise exception 'not_authorized';end if;
 if data->>'visibility'='public' and nullif(data->>'recipientId','') is null then raise exception 'public_requires_recipient';end if;
 if previous.id is null then
 insert into public.ideas(id,owner_id,title,description,specifications,private_note,url,image_url,image_credit,price_min,price_max,visibility,candidates) values(iid,auth.uid(),data->>'title',coalesce(data->>'description',''),coalesce(data->>'specifications',''),coalesce(data->>'privateNote',''),nullif(data->>'url',''),nullif(data->>'imageUrl',''),data->'imageCredit',nullif(data->>'priceMin','')::numeric,nullif(data->>'priceMax','')::numeric,data->>'visibility',array(select jsonb_array_elements_text(coalesce(data->'candidates','[]'))::uuid));
 else
 update public.ideas set title=data->>'title',description=coalesce(data->>'description',''),specifications=coalesce(data->>'specifications',''),private_note=coalesce(data->>'privateNote',''),url=nullif(data->>'url',''),image_url=nullif(data->>'imageUrl',''),image_credit=data->'imageCredit',price_min=nullif(data->>'priceMin','')::numeric,price_max=nullif(data->>'priceMax','')::numeric,visibility=data->>'visibility',candidates=array(select jsonb_array_elements_text(coalesce(data->'candidates','[]'))::uuid) where id=iid;
 if data->>'visibility'='public' and exists(select 1 from public.proposals where idea_id=iid and id<>coalesce(pid,'00000000-0000-0000-0000-000000000000'::uuid) and archived_at is null and recipient_id is null) then raise exception 'other_public_proposal_missing_recipient';end if;
 end if;
 if pid is null then pid=gen_random_uuid();insert into public.proposals(id,idea_id,recipient_id,list_ids,is_global,priority,collective,target_amount) values(pid,iid,nullif(data->>'recipientId','')::uuid,array(select jsonb_array_elements_text(coalesce(data->'listIds','[]'))::uuid),coalesce((data->>'global')::boolean,false),coalesce((data->>'priority')::smallint,2),coalesce((data->>'collective')::boolean,false),nullif(data->>'targetAmount','')::numeric);
 else update public.proposals set recipient_id=nullif(data->>'recipientId','')::uuid,list_ids=array(select jsonb_array_elements_text(coalesce(data->'listIds','[]'))::uuid),is_global=coalesce((data->>'global')::boolean,false),priority=coalesce((data->>'priority')::smallint,2),collective=coalesce((data->>'collective')::boolean,false),target_amount=nullif(data->>'targetAmount','')::numeric where id=pid;end if;return pid;
end$$;
create function public.validate_candidate_links() returns trigger language plpgsql security definer set search_path=public as $$begin
 if exists(select 1 from public.proposals p join public.ideas i on i.id=p.idea_id where i.id=new.id and p.archived_at is null and p.recipient_id is not null and not(p.recipient_id=any(i.candidates))) then raise exception 'recipient_used_by_another_proposal';end if;return new;end$$;
create constraint trigger candidate_links after update on public.ideas deferrable initially deferred for each row execute function public.validate_candidate_links();
create function public.duplicate_proposals(source_list uuid,gifts uuid[],list_name text) returns uuid language plpgsql security definer set search_path=public as $$declare lid uuid;begin
 if not public.is_admin() or not exists(select 1 from public.lists where id=source_list) then raise exception 'not_authorized';end if;
 if exists(select 1 from unnest(gifts) g where not exists(select 1 from public.proposals p where p.id=g and public.can_see_idea(p.idea_id) and(source_list=any(p.list_ids) or p.is_global))) then raise exception 'not_authorized';end if;
 insert into public.lists(name,slogan,image_url,created_by) select list_name,slogan,image_url,auth.uid() from public.lists where id=source_list returning id into lid;
 insert into public.proposals(idea_id,recipient_id,list_ids,priority,collective,target_amount) select idea_id,recipient_id,array[lid],priority,collective,target_amount from public.proposals where id=any(gifts);return lid;
end$$;
create function public.shared_list(token uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$declare l public.lists;begin
 select * into l from public.lists where share_token=token;if not found then return null;end if;
 return jsonb_build_object('id',l.id,'name',l.name,'slogan',l.slogan,'imageUrl',l.image_url,'archived',l.archived_at is not null,'gifts',case when l.archived_at is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',i.title,'description',i.description,'specifications',i.specifications,'url',i.url,'imageUrl',i.image_url,'imageCredit',i.image_credit,'priceMin',i.price_min,'priceMax',i.price_max,'priority',p.priority,'recipient',r.name,'recipientId',r.id,'collective',p.collective,'targetAmount',p.target_amount,'contributed',p.contributed,'reserved',p.reserved)) from public.proposals p join public.ideas i on i.id=p.idea_id join public.recipients r on r.id=p.recipient_id where p.archived_at is null and i.visibility='public' and (l.id=any(p.list_ids) or (p.is_global and not exists(select 1 from public.proposals override where override.id<>p.id and override.idea_id=p.idea_id and override.recipient_id is not distinct from p.recipient_id and l.id=any(override.list_ids))))),'[]'::jsonb) end);
end$$;
create function public.reserve_gift(token uuid, gift uuid, guest_name text, guest_email text, contribution numeric default null) returns jsonb language plpgsql security definer set search_path=public as $$declare p public.proposals;i public.ideas;r public.reservations;begin
 select i1.* into i from public.ideas i1 join public.proposals p1 on p1.idea_id=i1.id where p1.id=gift for share of i1;
 perform 1 from public.lists where share_token=token and archived_at is null for share;
 select p1.* into p from public.proposals p1 join public.lists l on l.share_token=token and l.archived_at is null where p1.id=gift and(p1.is_global or l.id=any(p1.list_ids)) for update of p1;
 if not found or p.archived_at is not null or p.reserved or (p.is_global and exists(select 1 from public.proposals override join public.lists l on l.share_token=token where override.id<>p.id and override.idea_id=p.idea_id and override.recipient_id is not distinct from p.recipient_id and l.id=any(override.list_ids))) then raise exception 'gift_unavailable';end if;
 if i.visibility<>'public' or p.recipient_id is null then raise exception 'gift_unavailable';end if;
 if length(trim(guest_name)) not between 1 and 100 or length(guest_email)>254 or guest_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_guest';end if;
 if p.collective then if contribution is null or contribution<=0 or contribution<>round(contribution,2) or contribution>p.target_amount-p.contributed then raise exception 'invalid_contribution';end if;else contribution=null;end if;
 insert into public.reservations(proposal_id,name,email,amount) values(gift,trim(guest_name),lower(trim(guest_email)),contribution) returning * into r;
 update public.proposals set contributed=case when p.collective then p.contributed+contribution else 0 end,reserved=not p.collective or p.contributed+coalesce(contribution,0)>=p.target_amount where id=gift;
 insert into public.email_jobs(email,kind,payload) values(r.email,'reserved',jsonb_build_object('title',i.title,'accessToken',r.access_token,'recipient',(select name from public.recipients where id=p.recipient_id),'specifications',i.specifications,'priceMin',i.price_min,'priceMax',i.price_max,'url',i.url,'amount',r.amount));
 insert into public.email_jobs(email,kind,payload) select email,'admin_reserved',jsonb_build_object('title',i.title) from public.profiles where coalesce((preferences->>'email')::boolean,true);
 return jsonb_build_object('accessToken',r.access_token);
end$$;
create function public.reservation_info(token uuid) returns jsonb language sql stable security definer set search_path=public as $$select jsonb_build_object('title',case when i.visibility='public' then i.title else 'Votre cadeau' end,'name',r.name,'amount',r.amount,'cancelled',r.cancelled_at is not null,'archived',p.archived_at is not null) from public.reservations r join public.proposals p on p.id=r.proposal_id join public.ideas i on i.id=p.idea_id where r.access_token=token$$;
create function public.cancel_reservation(token uuid) returns boolean language plpgsql security definer set search_path=public as $$declare r public.reservations;p public.proposals;begin
 select * into r from public.reservations where access_token=token;if not found then return false;end if;
 select * into p from public.proposals where id=r.proposal_id for update;
 select * into r from public.reservations where access_token=token for update;if r.cancelled_at is not null then return true;end if;
 update public.reservations set cancelled_at=now() where id=r.id;
 update public.proposals set contributed=greatest(0,p.contributed-coalesce(r.amount,0)),reserved=false where id=p.id;
 insert into public.email_jobs(email,kind,payload) values(r.email,'cancelled',jsonb_build_object('accessToken',r.access_token));return true;
end$$;
create function public.reset_gift(gift uuid,restore boolean default false) returns boolean language plpgsql security definer set search_path=public as $$declare p public.proposals;begin
 select * into p from public.proposals where id=gift for update;if not found or not public.can_see_idea(p.idea_id) then raise exception 'not_authorized';end if;
 insert into public.email_jobs(email,kind,payload) select email,'changed',jsonb_build_object('accessToken',access_token,'title','Cadeau remis à disposition') from public.reservations where proposal_id=gift and cancelled_at is null;
 update public.reservations set cancelled_at=now() where proposal_id=gift and cancelled_at is null;
 update public.proposals set reserved=false,contributed=0,archive_reason=case when restore then null else archive_reason end,archived_at=case when restore then null else archived_at end where id=gift;
 insert into public.activity(idea_id,actor_id,message) values(p.idea_id,auth.uid(),case when restore then 'Proposition restaurée sans réservation' else 'Réservation retirée' end);return true;
end$$;
create function public.reveal_gift(gift uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 if not exists(select 1 from public.proposals where id=gift and public.can_see_idea(idea_id)) then raise exception 'not_authorized';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('name',name,'amount',amount)) from public.reservations where proposal_id=gift and cancelled_at is null),'[]'::jsonb);
end$$;
create function public.rate_limit(request_key text,max_requests integer,window_seconds integer) returns boolean language plpgsql security definer set search_path=public as $$declare n integer;begin
 insert into public.request_limits(key,count,window_started) values(request_key,1,now()) on conflict(key) do update set count=case when request_limits.window_started<now()-make_interval(secs=>window_seconds) then 1 else request_limits.count+1 end,window_started=case when request_limits.window_started<now()-make_interval(secs=>window_seconds) then now() else request_limits.window_started end returning count into n;return n<=max_requests;
end$$;
create function public.claim_email_jobs() returns setof public.email_jobs language sql security definer set search_path=public as $$update public.email_jobs set status='sending',locked_at=now(),attempts=attempts+1 where id in(select id from public.email_jobs where attempts<10 and(status='pending' or(status='sending' and locked_at<now()-interval '10 minutes')) order by created_at for update skip locked limit 20) returning *$$;
-- Explicit execute grants. No public access to mutation helpers or mail queue.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_admin(),public.can_see_idea(uuid) to authenticated;
grant execute on function public.duplicate_proposals(uuid,uuid[],text),public.save_gift(jsonb),public.reset_gift(uuid,boolean),public.reveal_gift(uuid) to authenticated;
grant execute on function public.shared_list(uuid) to anon,authenticated,service_role;
grant execute on function public.reserve_gift(uuid,uuid,text,text,numeric),public.reservation_info(uuid),public.cancel_reservation(uuid),public.rate_limit(text,integer,integer),public.claim_email_jobs() to service_role;
grant all on all tables in schema public to service_role;
-- Private uploads: guests receive short-lived signed URLs for shared images only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('gift-images','gift-images',false,5242880,array['image/jpeg','image/png','image/webp','image/gif']) on conflict(id) do nothing;
create policy admin_uploads on storage.objects for insert to authenticated with check(bucket_id='gift-images' and public.is_admin() and split_part(name,'/',1)=auth.uid()::text);
create policy admin_reads_own_uploads on storage.objects for select to authenticated using(bucket_id='gift-images' and public.is_admin() and(split_part(name,'/',1)=auth.uid()::text or exists(select 1 from public.ideas where image_url='storage:'||name and public.can_see_idea(id))));

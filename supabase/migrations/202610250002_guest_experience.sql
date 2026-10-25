begin;
create or replace function public.shared_list(token uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$declare l public.lists;begin
 select * into l from public.lists where share_token=token;if not found then return null;end if;
 return jsonb_build_object('id',l.id,'name',l.name,'slogan',l.slogan,'imageUrl',l.image_url,'archived',l.archived_at is not null,'gifts',case when l.archived_at is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',i.title,'description',i.description,'specifications',i.specifications,'url',i.url,'imageUrl',i.image_url,'imageCredit',i.image_credit,'priceMin',i.price_min,'priceMax',i.price_max,'priority',p.priority,'recipient',r.name,'recipientId',r.id,'recipientColor',r.color,'createdAt',p.created_at,'collective',p.collective,'targetAmount',p.target_amount,'contributed',p.contributed,'reserved',p.reserved)) from public.proposals p join public.ideas i on i.id=p.idea_id join public.recipients r on r.id=p.recipient_id where r.deleted_at is null and p.archived_at is null and i.visibility='public' and (l.id=any(p.list_ids) or (p.is_global and not exists(select 1 from public.proposals override where override.id<>p.id and override.idea_id=p.idea_id and override.recipient_id is not distinct from p.recipient_id and l.id=any(override.list_ids))))),'[]'::jsonb) end);
end$$;
create function public.submit_gift_question(token uuid,gift uuid,guest_name text,guest_email text,question text)
returns uuid language plpgsql security definer set search_path=public as $$
declare shared jsonb; item jsonb; targets uuid[];address text;job uuid;begin
 if guest_name is null or length(trim(guest_name)) not between 1 and 100 or guest_email is null or length(guest_email)>254 or guest_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or question is null or length(trim(question)) not between 1 and 2000 then raise exception 'invalid_question';end if;
 shared:=public.shared_list(token);
 if shared is null or (shared->>'archived')::boolean then raise exception 'gift_unavailable';end if;
 select g into item from jsonb_array_elements(shared->'gifts') g where g->>'id'=gift::text;
 if item is null then raise exception 'gift_unavailable';end if;
 select array_agg(id order by display_name),min(email) into targets,address from public.profiles where lower(display_name) in('alex','elise');
 if cardinality(targets)<>2 or targets is null or (select count(distinct lower(display_name)) from public.profiles where id=any(targets))<>2 then raise exception 'question_recipients_missing';end if;
 -- One queue entry becomes one email addressed to both administrators together.
 insert into public.email_jobs(email,kind,payload) values(address,'gift_question',jsonb_build_object('listToken',token,'listId',shared->>'id','giftId',gift,'recipientProfileIds',targets,'guestName',trim(guest_name),'guestEmail',lower(trim(guest_email)),'question',trim(question))) returning id into job;
 return job;
end$$;
revoke all on function public.submit_gift_question(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_gift_question(uuid,uuid,text,text,text) to service_role;
create or replace function public.claim_email_jobs_for_provider(provider text) returns setof public.email_jobs language sql security definer set search_path=public as $$
 update public.email_jobs set status='sending',locked_at=now(),attempts=attempts+1 where id in(
  select j.id from public.email_jobs j where j.attempts<10 and(j.status='pending' or(j.status='sending' and j.locked_at<now()-interval '10 minutes')) and
  ((provider='gmail' and j.kind in('idea_added','quick_share') and exists(select 1 from public.admin_mailboxes m where m.profile_id::text=j.payload->>'senderProfileId')) or
   (provider='resend' and j.kind not in('idea_added','quick_share')))
  order by case when j.kind='gift_question' then 0 else 1 end,j.created_at for update skip locked limit 5
 ) returning *
$$;
notify pgrst,'reload schema';
commit;

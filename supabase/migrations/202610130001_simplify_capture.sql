begin;
-- Public ideas without a recipient remain in the private admin inbox: shared_list joins recipients.
create or replace function public.guard_proposal() returns trigger language plpgsql security definer set search_path=public as $$begin
 if TG_OP='INSERT' and (new.reserved or new.contributed<>0) then raise exception 'reservation_state_is_managed';end if;
 if TG_OP='UPDATE' and new.idea_id<>old.idea_id then raise exception 'idea_is_immutable'; end if;
 if exists(select 1 from unnest(new.list_ids) l where not exists(select 1 from public.lists where id=l)) then raise exception 'unknown_list';end if;
 if new.recipient_id is not null and not exists(select 1 from public.ideas where id=new.idea_id and new.recipient_id=any(candidates)) then raise exception 'recipient_not_a_candidate';end if;
 if TG_OP='UPDATE' and (new.collective,new.target_amount) is distinct from(old.collective,old.target_amount) then
 if old.contributed>0 and not new.collective then raise exception 'active_collective_participations';end if;
 if new.collective then new.reserved=new.contributed>=new.target_amount;end if;end if;
 return new;
end$$;
create or replace function public.save_gift(data jsonb) returns uuid language plpgsql security definer set search_path=public as $$declare iid uuid;pid uuid;previous public.ideas;begin
 if not public.is_admin() then raise exception 'not_authorized';end if;
 iid=nullif(data->>'ideaId','')::uuid;
 if iid is not null then select * into previous from public.ideas where id=iid for update;if not found or not public.can_see_idea(iid) then raise exception 'not_authorized';end if;else iid=gen_random_uuid();end if;
 pid=nullif(data->>'proposalId','')::uuid;
 if pid is not null and not exists(select 1 from public.proposals where id=pid and idea_id=iid) then raise exception 'not_authorized';end if;
 if previous.id is null then
 insert into public.ideas(id,owner_id,title,description,specifications,private_note,url,image_url,image_credit,price_min,price_max,visibility,candidates) values(iid,auth.uid(),data->>'title',coalesce(data->>'description',''),coalesce(data->>'specifications',''),coalesce(data->>'privateNote',''),nullif(data->>'url',''),nullif(data->>'imageUrl',''),data->'imageCredit',nullif(data->>'priceMin','')::numeric,nullif(data->>'priceMax','')::numeric,data->>'visibility',array(select jsonb_array_elements_text(coalesce(data->'candidates','[]'))::uuid));
 else
 update public.ideas set title=data->>'title',description=coalesce(data->>'description',''),specifications=coalesce(data->>'specifications',''),private_note=coalesce(data->>'privateNote',''),url=nullif(data->>'url',''),image_url=nullif(data->>'imageUrl',''),image_credit=data->'imageCredit',price_min=nullif(data->>'priceMin','')::numeric,price_max=nullif(data->>'priceMax','')::numeric,visibility=data->>'visibility',candidates=array(select jsonb_array_elements_text(coalesce(data->'candidates','[]'))::uuid) where id=iid;
 end if;
 if pid is null then pid=gen_random_uuid();insert into public.proposals(id,idea_id,recipient_id,list_ids,is_global,priority,collective,target_amount) values(pid,iid,nullif(data->>'recipientId','')::uuid,array(select jsonb_array_elements_text(coalesce(data->'listIds','[]'))::uuid),coalesce((data->>'global')::boolean,false),coalesce((data->>'priority')::smallint,2),coalesce((data->>'collective')::boolean,false),nullif(data->>'targetAmount','')::numeric);
 else update public.proposals set recipient_id=nullif(data->>'recipientId','')::uuid,list_ids=array(select jsonb_array_elements_text(coalesce(data->'listIds','[]'))::uuid),is_global=coalesce((data->>'global')::boolean,false),priority=coalesce((data->>'priority')::smallint,2),collective=coalesce((data->>'collective')::boolean,false),target_amount=nullif(data->>'targetAmount','')::numeric where id=pid;end if;return pid;
end$$;

-- Save one independent idea per selected recipient, atomically.
create or replace function public.save_gift_for_recipients(data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare ids uuid[]; person uuid; input jsonb; result uuid; first_result uuid; current_person uuid; other_candidates uuid[];
begin
 if not public.is_admin() then raise exception 'not_authorized';end if;
 ids=array(select distinct jsonb_array_elements_text(coalesce(data->'candidates','[]'))::uuid);
 if cardinality(ids)>1 and exists(select 1 from public.recipients where id=any(ids) and is_common) then raise exception 'common_is_exclusive';end if;
 if cardinality(ids)=0 then return public.save_gift(data || jsonb_build_object('recipientId',null,'global',false));end if;
 current_person=nullif(data->>'recipientId','')::uuid;
 if current_person is null or not(current_person=any(ids)) then current_person=ids[1];end if;
 ids=array_prepend(current_person,array_remove(ids,current_person));
 foreach person in array ids loop
   input=data || jsonb_build_object('recipientId',person,'candidates',jsonb_build_array(person),'global',false);
   if first_result is not null then input=input-'ideaId'-'proposalId';
   elsif nullif(data->>'ideaId','') is not null then
     -- Preserve recipients of existing editions while editing one edition.
     select array_agg(distinct recipient_id) into other_candidates from public.proposals
       where idea_id=(data->>'ideaId')::uuid and id is distinct from nullif(data->>'proposalId','')::uuid and archived_at is null and recipient_id is not null;
     input=input || jsonb_build_object('candidates',to_jsonb(array(select distinct unnest(array[person] || coalesce(other_candidates,'{}'::uuid[])))));
   end if;
   result=public.save_gift(input);
   if first_result is null then first_result=result;end if;
 end loop;
 return first_result;
end$$;
revoke all on function public.save_gift_for_recipients(jsonb) from public,anon;
grant execute on function public.save_gift_for_recipients(jsonb) to authenticated;
-- Keep existing membership when removing the automatic all-lists option.
update public.proposals set list_ids=array(select distinct unnest(list_ids || array(select id from public.lists where archived_at is null))), is_global=false where is_global;
notify pgrst, 'reload schema';
commit;

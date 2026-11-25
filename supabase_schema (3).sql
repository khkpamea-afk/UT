-- วางทั้งไฟล์ใน Supabase > SQL Editor แล้วกด Run (ล้างตารางเก่าแล้วสร้างใหม่)
drop table if exists orders cascade;
drop table if exists shops cascade;
create table shops (
  id text primary key, name text not null,
  seller_id text,                     -- LINE ID ผู้ขาย (ใส่ทีหลัง)
  max_queue int not null default 50);
create table orders (
  id bigint generated always as identity primary key,
  token uuid not null default gen_random_uuid(),   -- ให้ลูกค้าติดตามสถานะ
  shop_id text not null references shops(id),
  day date not null, seq int not null, q text not null,
  customer text, note text, items_text text, total int not null default 0,
  status text not null default 'waiting',          -- waiting | accepted | done | cancelled
  created_at timestamptz not null default now());
alter table shops enable row level security;
alter table orders enable row level security;

create or replace function create_order(p_shop text, p_name text, p_note text, p_items text, p_total int)
returns json language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Bangkok')::date; v_max int; v_n int; v_seq int; v_id bigint; v_q text; v_t uuid;
begin
  select max_queue into v_max from shops where id = p_shop for update;
  if v_max is null then raise exception 'unknown shop'; end if;
  select count(*) into v_n from orders where shop_id = p_shop and day = d and status in ('waiting','accepted');
  if v_n >= v_max then return json_build_object('full', true, 'n', v_n, 'max', v_max); end if;
  select coalesce(max(seq),0)+1 into v_seq from orders where shop_id = p_shop and day = d;
  v_q := 'Q' || lpad(v_seq::text, 2, '0');
  insert into orders (shop_id, day, seq, q, customer, note, items_text, total)
  values (p_shop, d, v_seq, v_q, p_name, p_note, p_items, p_total) returning id, token into v_id, v_t;
  return json_build_object('full', false, 'id', v_id, 'q', v_q, 't', v_t, 'n', v_n+1, 'max', v_max);
end $$;

create or replace function queue_status(p_shop text)
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'n', (select count(*) from orders where shop_id = p_shop and status in ('waiting','accepted')
          and day = (now() at time zone 'Asia/Bangkok')::date),
    'max', (select max_queue from shops where id = p_shop));
$$;

revoke all on function create_order(text,text,text,text,int) from public, anon, authenticated;
revoke all on function queue_status(text) from public, anon, authenticated;
grant execute on function create_order(text,text,text,text,int) to service_role;
grant execute on function queue_status(text) to service_role;
-- ให้ Edge Function (service_role) อ่าน/เขียนตารางได้
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
insert into shops (id, name, max_queue) values ('nongpp', 'น้องพอเพียง', 50);

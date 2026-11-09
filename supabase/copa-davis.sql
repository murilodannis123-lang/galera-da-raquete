-- Copa Davis · Galera da Raquete (uso único).
-- Tabelas próprias: não mexe em nada do ranking. Pode rodar mais de uma vez.
-- ANTES DE RODAR: troque os 3 PINs lá embaixo (admin, capitão do Time A, capitão do Time B).

create table if not exists public.copa_davis (
  id int primary key default 1 check (id = 1),
  estado jsonb not null default '{}'::jsonb,
  versao int not null default 0,
  atualizado timestamptz not null default now()
);
insert into public.copa_davis (id) values (1) on conflict (id) do nothing;

create table if not exists public.copa_davis_pins (
  pin text primary key,
  papel text not null check (papel in ('admin', 'A', 'B'))
);

alter table public.copa_davis enable row level security;
alter table public.copa_davis_pins enable row level security;

-- qualquer um com o link acompanha (só leitura)
drop policy if exists copa_davis_ler on public.copa_davis;
create policy copa_davis_ler on public.copa_davis for select to anon, authenticated using (true);
grant select on public.copa_davis to anon, authenticated;
revoke all on public.copa_davis_pins from anon, authenticated;

-- PINs (TROQUE AQUI)
delete from public.copa_davis_pins;
insert into public.copa_davis_pins (pin, papel) values
  ('1234', 'admin'),   -- você
  ('1111', 'A'),       -- capitão do Time A
  ('2222', 'B');       -- capitão do Time B

-- diz se o PIN é de admin, capitão A ou capitão B
create or replace function public.copa_papel(p_pin text) returns text
language sql security definer stable set search_path to 'public' as $$
  select papel from copa_davis_pins where pin = p_pin
$$;

-- grava o campeonato; recusa se alguém salvou no meio (versao diferente)
create or replace function public.copa_salvar(p_pin text, p_estado jsonb, p_versao int) returns int
language plpgsql security definer set search_path to 'public' as $$
declare v int;
begin
  if not exists (select 1 from copa_davis_pins where pin = p_pin) then
    raise exception 'PIN inválido';
  end if;
  update copa_davis set estado = p_estado, versao = versao + 1, atualizado = now()
   where id = 1 and versao = p_versao
  returning versao into v;
  if v is null then raise exception 'CONFLITO'; end if;
  return v;
end $$;

grant execute on function public.copa_papel(text) to anon, authenticated;
grant execute on function public.copa_salvar(text, jsonb, int) to anon, authenticated;

-- tempo real
do $$ begin
  alter publication supabase_realtime add table public.copa_davis;
exception when duplicate_object then null;
end $$;

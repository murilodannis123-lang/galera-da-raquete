-- Torneios (04/11/2026): vários torneios, morador fora do ranking, datas automáticas e jogos das duplas.
-- Pode rodar mais de uma vez. Não mexe em nada do ranking.

-- 1) Morador: conta que só participa de torneio (não entra no ranking)
alter table public.jogadores add column if not exists so_torneio boolean not null default false;
grant select (so_torneio) on public.jogadores to authenticated;

-- só a coordenação muda quem é morador
create or replace function public.trava_so_torneio() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.so_torneio is distinct from old.so_torneio and auth.uid() is not null and not eh_admin() then
    raise exception 'Sem permissão.';
  end if;
  return new;
end $$;
drop trigger if exists trava_so_torneio on public.jogadores;
create trigger trava_so_torneio before update on public.jogadores for each row execute function public.trava_so_torneio();

-- inscrição do morador pelo app: entra direto, sem aprovação, fora do ranking
create or replace function public.cadastrar_morador(p_nome text, p_celular text) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare jid uuid; em text := lower(auth.jwt()->>'email');
begin
  if auth.uid() is null or coalesce(em, '') = '' then raise exception 'Crie seu acesso primeiro.'; end if;
  select id into jid from jogadores where user_id = auth.uid();
  if jid is not null then return jid; end if;
  if exists (select 1 from jogadores where lower(email) = em) then raise exception 'Esse e-mail já está cadastrado. Fale com a coordenação.'; end if;
  if length(trim(coalesce(p_nome, ''))) not between 2 and 40 then raise exception 'Informe seu nome (até 40 letras).'; end if;
  if length(regexp_replace(coalesce(p_celular, ''), '\D', '', 'g')) < 10 then raise exception 'Informe o WhatsApp com DDD.'; end if;
  insert into jogadores (email, user_id, nome, celular, pendente, ativo, joga, grupo, so_torneio, senha_trocada)
  values (em, auth.uid(), trim(p_nome), trim(p_celular), false, true, false, null, true, true)
  returning id into jid;
  return jid;
end $$;
revoke all on function public.cadastrar_morador(text, text) from public, anon;
grant execute on function public.cadastrar_morador(text, text) to authenticated;

-- 2) Inscrição aberta = publicada e dentro das datas (quando tiver datas)
create or replace function public.torneio_aberto(cfg jsonb) returns boolean
language sql stable set search_path to 'public' as $$
  select cfg is not null
     and coalesce((cfg->>'inscricoes')::boolean, false)
     and (nullif(cfg->>'insc_ini', '') is null or (now() at time zone 'America/Sao_Paulo')::date >= (cfg->>'insc_ini')::date)
     and (nullif(cfg->>'insc_fim', '') is null or (now() at time zone 'America/Sao_Paulo')::date <= (cfg->>'insc_fim')::date)
$$;

create or replace function public.inscrever_torneio(p_torneio text, p_classe text, p_camiseta text, p_tamanho text, p_outro text, p_extras jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare eu uuid; morador boolean; cfg jsonb; k text; v jsonb; limpo jsonb := '{}'::jsonb;
begin
  select id, so_torneio into eu, morador from jogadores where user_id = auth.uid() and ativo and not pendente;
  if eu is null then raise exception 'Sem permissão.'; end if;
  select valor into cfg from config where chave = 'torneio_' || p_torneio;
  if not torneio_aberto(cfg) then raise exception 'As inscrições desse torneio não estão abertas.'; end if;
  if morador and not coalesce((cfg->>'aberto')::boolean, false) then raise exception 'Esse torneio é só pra quem está no ranking.'; end if;
  if not (cfg->'classes' ? p_classe) then raise exception 'Escolha uma categoria válida.'; end if;
  if p_camiseta = 'outro' then
    if coalesce(trim(p_outro), '') = '' then raise exception 'Escreva o tamanho da camiseta.'; end if;
    p_tamanho := null;
  elsif p_camiseta is null then
    p_tamanho := null; p_outro := null;   -- torneio sem camiseta
  elsif p_tamanho is null then raise exception 'Escolha o tamanho da camiseta.';
  else p_outro := null;
  end if;
  for k, v in select * from jsonb_each(coalesce(p_extras, '{}'::jsonb)) loop
    if k = 'outro' then
      if jsonb_typeof(v) = 'string' and length(trim(v #>> '{}')) between 1 and 80 then limpo := limpo || jsonb_build_object('outro', trim(v #>> '{}')); end if;
    elsif k ~ '^(masculina|babylook):(P|M|G|GG)$' and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between 1 and 10 then
      limpo := limpo || jsonb_build_object(k, (v #>> '{}')::int);
    end if;
  end loop;
  insert into torneio_inscricao (torneio, jogador, classe, camiseta, tamanho, outro, extras)
  values (p_torneio, eu, p_classe, p_camiseta, p_tamanho, nullif(trim(p_outro), ''), limpo)
  on conflict (torneio, jogador) do update set classe = excluded.classe, camiseta = excluded.camiseta, tamanho = excluded.tamanho, outro = excluded.outro, extras = excluded.extras;
end $$;

create or replace function public.cancelar_inscricao_torneio(p_torneio text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare eu uuid; cfg jsonb;
begin
  select id into eu from jogadores where user_id = auth.uid();
  select valor into cfg from config where chave = 'torneio_' || p_torneio;
  if eu is null or not torneio_aberto(cfg) then raise exception 'As inscrições já fecharam. Fale com a coordenação.'; end if;
  delete from torneio_inscricao where torneio = p_torneio and jogador = eu and status <> 'pago';
end $$;

-- 3) Jogos dos torneios (separados do ranking: não somam pontos lá)
create table if not exists public.torneio_jogos (
  id uuid primary key default gen_random_uuid(),
  torneio text not null,
  classe text not null,
  fase text not null,          -- grupos | quartas | semi | final
  chave integer,               -- número do grupo (fase de grupos) ou do jogo (mata-mata)
  dupla_a uuid[] not null,
  dupla_b uuid[] not null,
  sets jsonb,
  gravado_por uuid,
  gravado_em timestamptz,
  criado_em timestamptz default now()
);
create index if not exists torneio_jogos_torneio on public.torneio_jogos (torneio, classe);
alter table public.torneio_jogos enable row level security;
grant select, insert, update, delete on public.torneio_jogos to authenticated;
drop policy if exists ler on public.torneio_jogos;
create policy ler on public.torneio_jogos for select using ((select eh_membro()));
drop policy if exists admin_escreve on public.torneio_jogos;
create policy admin_escreve on public.torneio_jogos for all using ((select eh_admin())) with check ((select eh_admin()));
drop policy if exists meu_jogo on public.torneio_jogos;
create policy meu_jogo on public.torneio_jogos for update
  using (exists (select 1 from jogadores j where j.user_id = (select auth.uid()) and j.id = any (dupla_a || dupla_b)))
  with check (exists (select 1 from jogadores j where j.user_id = (select auth.uid()) and j.id = any (dupla_a || dupla_b)));

-- placar: quem está no jogo grava enquanto a fase estiver aberta; só quem gravou corrige (igual ao Finals)
create or replace function public.trava_torneio_jogos() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare meu uuid; f text;
begin
  if new.sets is not null and not placar_valido(new.sets) then raise exception 'Placar inválido.'; end if;
  if tg_op = 'UPDATE' and new.sets is distinct from old.sets then new.gravado_por := auth.uid(); new.gravado_em := now(); end if;
  if auth.uid() is null or eh_admin() then return new; end if;
  if tg_op <> 'UPDATE' then raise exception 'Sem permissão.'; end if;
  select id into meu from jogadores where user_id = auth.uid();
  if meu is null or not (meu = any (old.dupla_a || old.dupla_b)) then raise exception 'Você só grava o placar do seu jogo.'; end if;
  select valor->'fases'->>old.classe into f from config where chave = 'torneio_' || old.torneio;
  if f is distinct from old.fase then raise exception 'Essa fase do torneio já fechou. Só a coordenação altera.'; end if;
  if old.sets is not null and old.gravado_por is distinct from auth.uid() and new.sets is distinct from old.sets then
    raise exception 'Esse placar já foi gravado por outro jogador ou pela coordenação. Só quem gravou corrige; se estiver errado, fale com a coordenação.';
  end if;
  if (new.torneio, new.classe, new.fase, new.chave, new.dupla_a, new.dupla_b) is distinct from (old.torneio, old.classe, old.fase, old.chave, old.dupla_a, old.dupla_b) then
    raise exception 'Sem permissão.';
  end if;
  return new;
end $$;
drop trigger if exists trava_torneio_jogos on public.torneio_jogos;
create trigger trava_torneio_jogos before insert or update on public.torneio_jogos for each row execute function public.trava_torneio_jogos();

-- placar ao vivo no app
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'torneio_jogos') then
    alter publication supabase_realtime add table public.torneio_jogos;
  end if;
end $$;

select 'ok: torneios prontos' as resultado;

-- WO no Finals (11/11/2026). Pode rodar mais de uma vez.
-- Vale na hora (sem aceitar/contestar). O jogo vira 6×0 6×0 pra quem não deu o WO, então a chave anda sozinha
-- e o bônus do Finals continua igual. Na fase de grupos quem venceu leva os pontos de WO (35 em 2026, 25 a partir de 2027)
-- e quem deu o WO fica com 0.
alter table public.finals_jogos
  add column if not exists wo_de uuid,
  add column if not exists wo_motivo text,
  add column if not exists wo_obs text;
grant select, update (wo_de, wo_motivo, wo_obs) on public.finals_jogos to authenticated;

create or replace function public.trava_finals_wo() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  -- placar gravado (ou apagado) por cima de um WO: o WO sai
  if tg_op = 'UPDATE' and old.wo_de is not null and new.wo_de is not distinct from old.wo_de and new.sets is distinct from old.sets then
    new.wo_de := null; new.wo_motivo := null; new.wo_obs := null;
  end if;
  if new.wo_de is not null then
    if new.wo_de not in (new.jogador_a, new.jogador_b) then raise exception 'WO inválido.'; end if;
    if coalesce(new.wo_motivo, '') not in ('lesao', 'ausencia') then raise exception 'Escolha o motivo do WO.'; end if;
    if length(coalesce(new.wo_obs, '')) > 500 then raise exception 'Justificativa muito longa.'; end if;
    new.sets := case when new.wo_de = new.jogador_a then '[[0,6],[0,6]]' else '[[6,0],[6,0]]' end::jsonb;
  else
    new.wo_motivo := null; new.wo_obs := null;
  end if;
  -- só quem gravou (ou a coordenação) mexe no WO
  if tg_op = 'UPDATE' and auth.uid() is not null and not eh_admin() and pg_trigger_depth() <= 1
     and old.sets is not null and old.gravado_por is distinct from auth.uid()
     and (new.wo_de, new.wo_motivo, new.wo_obs) is distinct from (old.wo_de, old.wo_motivo, old.wo_obs) then
    raise exception 'Esse jogo já foi gravado pelo outro jogador ou pela coordenação. Fale com a coordenação.';
  end if;
  return new;
end $$;
-- roda depois do trava_finals (ordem alfabética), que já conferiu quem pode gravar e a fase
drop trigger if exists trava_finals_wo on public.finals_jogos;
create trigger trava_finals_wo before insert or update on public.finals_jogos for each row execute function public.trava_finals_wo();

-- classificação da chave (usada pra montar as semifinais): WO = pontos de WO pra quem venceu e 0 pra quem deu
create or replace function public.tabela_chave(p_ano integer, p_grupo text, p_chave integer) returns uuid[]
language sql stable security definer set search_path to 'public' as $function$
  with v as (select jogador, seed from finals_vagas where ano = p_ano and grupo = p_grupo and chave = p_chave),
  r as (select g.jogador_a a, g.jogador_b b, g.wo_de wo, x.* from finals_jogos g cross join lateral placar_res(g.sets) x
        where g.ano = p_ano and g.grupo = p_grupo and g.fase = 'grupos' and g.chave = p_chave and g.sets is not null),
  w as (select case when p_ano < 2027 then 35 else 25 end p),
  lin as (select a id, case when wo is not null then (case when av then (select p from w) else 0 end) when av then 35 - gb else 5 + ga end tp, av::int vi, (not av)::int de, sa sp, sb sc, ga gp, gb gc from r
          union all
          select b, case when wo is not null then (case when av then 0 else (select p from w) end) when av then 5 + gb else 35 - ga end, (not av)::int, av::int, sb, sa, gb, ga from r),
  s as (select id, sum(tp) tp, sum(vi) vi, sum(de) de, sum(sp) sp, sum(sc) sc, sum(gp) gp, sum(gc) gc from lin group by id)
  select array_agg(v.jogador order by coalesce(s.tp, 0) desc, coalesce(s.vi, 0) desc, coalesce(s.vi - s.de, 0) desc, coalesce(s.sp - s.sc, 0) desc, coalesce(s.gp - s.gc, 0) desc, v.seed)
  from v left join s on s.id = v.jogador;
$function$;

select 'ok: WO do Finals ligado' as resultado;

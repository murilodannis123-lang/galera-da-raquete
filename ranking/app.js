// Galera da Raquete · Ranking — app (PWA) ligado ao Supabase
import * as M from './motor.js?v=20261027075746';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=20261027075746';
import { REGULAMENTO } from './regulamento.js?v=20261027075746';
import { PRIVACIDADE } from './privacidade.js?v=20261027075746';

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const mesId = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const nomeMes = (id) => { const [a, m] = id.split('-').map(Number); return cap(MESES[m - 1]) + ' ' + a; };
const proxMes = (id) => { const [a, m] = id.split('-').map(Number); return mesId(new Date(a, m, 1)); };
const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const zap = (cel, txt) => { let d = soDigitos(cel); if (!d) return ''; if (d.length <= 11) d = '55' + d; return 'https://wa.me/' + d + '?text=' + encodeURIComponent(txt); };
const ehNoite = () => { const h = new Date().getHours(); return h >= 18 || h < 6; };

let sb = null;
const S = {
  busca: {}, curtidas: {},
  eu: null, jogadores: [], meses: [], mesAtual: null, jogos: [], avisos: [], patros: [], config: {},
  jogosPorMes: {}, slide: 0, abaRk: 'D', abaFin: null, vistaFin: null, mesVer: null, msg: '', erro: '', admin: { confirmar: false, fin: {}, finConf: null, sorteio: {} },
  finals: [], fvagas: [], fjogos: [], emails: {}, niver: []
};

// ---------- utilidades de tela ----------
function toast(t) {
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t;
  document.body.appendChild(el); setTimeout(() => el.remove(), 3200);
}
const avatar = (j, tam) => `<span class="avatar"${j && j.id ? ` data-ver="${esc(j.id)}"` : ''} style="width:${tam}px;height:${tam}px;font-size:${Math.round(tam * 0.38)}px">${esc(iniciais(j && j.nome))}${j && j.foto_url ? `<img src="${esc(j.foto_url)}" alt="" decoding="async" onerror="this.remove()">` : ''}</span>`;
const voltar = (titulo, sub, para = '#/') => `<header class="cab"><div class="cab-linha"><a class="ic-btn" href="${para}" aria-label="Voltar"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></a><div style="flex-grow:1;min-width:0"><h1>${esc(titulo)}</h1>${sub ? `<small>${esc(sub)}</small>` : ''}</div><img class="cab-logo" src="icones/logo.png" alt="Galera da Raquete Portal do Lago"></div></header>`;
const BOLA = (t, cor = '#D8F145') => `<svg width="${t}" height="${t}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9.2" fill="${cor}" stroke="#B5CF22" stroke-width=".8"/><path d="M3.2 4.2c3.6 1.6 5.4 3.6 5.4 5.8s-1.8 4.2-5.4 5.8M16.8 4.2c-3.6 1.6-5.4 3.6-5.4 5.8s1.8 4.2 5.4 5.8" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>`;

// busca por nome: o texto fica guardado por tela e é reaplicado a cada render
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const BUSCA = (ph) => `<input class="campo busca" type="search" data-busca placeholder="${esc(ph)}" aria-label="${esc(ph)}" value="${esc(S.busca[telaAtual()] || '')}" autocomplete="off">`;
const dn = (...nomes) => `data-nome="${esc(semAcento(nomes.filter(Boolean).join(' ')))}"`;
const telaAtual = () => location.hash.replace(/^#\/?/, '').split('/')[0] || 'inicio';
function aplicarBusca() {
  const q = semAcento(S.busca[telaAtual()] || '').trim();
  let vis = 0;
  document.querySelectorAll('[data-nome]').forEach((el) => { const ok = !q || el.dataset.nome.includes(q); el.hidden = !ok; if (ok) vis++; });
  const nada = document.getElementById('busca-nada'); if (nada) nada.hidden = !q || vis > 0;
}
const NADA = '<p class="dica" id="busca-nada" hidden>Ninguém com esse nome.</p>';

// ---------- dados ----------
const porId = (id) => S.jogadores.find((j) => j.id === id);
const voltando = (j) => !!(j && (j.posicao != null || j.tp || j.vi || j.de));
// ranking geral (Dynamics): quem joga e está ativo, pela posição definida na última rodada
function listaGeral() {
  return S.jogadores.filter((j) => j.ativo && j.joga)
    .sort((a, b) => (a.posicao ?? 9999) - (b.posicao ?? 9999) || b.tp - a.tp || a.nome.localeCompare(b.nome));
}
// pontuação ao vivo (como o Ranking Online): pontos gravados + os jogos do mês aberto que já têm placar ou WO.
// Ao rodar o mês esses jogos passam a fazer parte dos pontos gravados (não conta duas vezes).
function rankingVivo() {
  const jogos = S.mesAtual ? S.jogos.filter((g) => g.jogador_b && (g.wo_de ? g.wo_status !== 'anulado' : g.sets))
    .map((g) => ({ a: g.jogador_a, b: g.jogador_b, sets: g.sets, woDe: g.wo_de })) : [];
  // Finals em andamento: o bônus já aparece na pontuação a cada placar (oficial quando a coordenação encerrar)
  const bonus = {};
  S.finals.filter((fz) => fz.fase !== 'encerrado').forEach((fz) => {
    const { vg, semis, final } = dadosFinals(fz.ano, fz.grupo);
    Object.assign(bonus, M.bonusParcial(vg.map((v) => v.jogador), semis.map(pg), final ? pg(final) : null));
  });
  return M.rodarMes(listaGeral().map((j) => (bonus[j.id] ? { ...j, tp: j.tp + bonus[j.id] } : j)), jogos, []);
}
function posicoes() {
  const geral = {}, grupo = {};
  listaGeral().forEach((j, i) => { geral[j.id] = i + 1; });
  ['A', 'B', 'C'].forEach((g) => listaGeral().filter((j) => j.grupo === g).forEach((j, i) => { grupo[j.id] = i + 1; }));
  return { geral, grupo };
}
async function jogosDoMes(id, forcar) {
  if (!id) return [];
  if (!sb || (!forcar && S.jogosPorMes[id])) return S.jogosPorMes[id] || [];
  const { data, error } = await sb.from('jogos').select('*').eq('mes', id).order('criado_em');
  if (error) throw error;
  S.jogosPorMes[id] = data;
  await carregarCurtidas(data.map((g) => g.id));
  return data;
}
// curtidas dos jogos; se a tabela ainda não existir no banco, segue sem curtidas
async function carregarCurtidas(ids) {
  if (!ids.length) return;
  const { data, error } = await sb.from('curtidas').select('jogo,jogador').in('jogo', ids);
  if (error) return;
  ids.forEach((id) => { S.curtidas[id] = []; });
  data.forEach((c) => S.curtidas[c.jogo].push(c.jogador));
}
const CORACAO = '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.1 0 3.6 1.1 5.4 3 1.8-1.9 3.3-3 5.4-3 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>';
function curtir(g) {
  const v = vencedor(g); if (!v) return '';
  const lista = S.curtidas[g.id] || [], eu = lista.includes(S.eu.id), meu = g.jogador_a === S.eu.id || g.jogador_b === S.eu.id;
  const botao = meu ? (lista.length ? `<span class="curtir-b on">${CORACAO} ${lista.length}</span>` : '')
    : `<button class="curtir-b${eu ? ' on' : ''}" data-acao="curtir" data-id="${g.id}" aria-pressed="${eu}" aria-label="Curtir a vitória de ${esc((porId(v) || {}).nome)}">${CORACAO} ${eu ? 'Curtiu' : 'Curtir'}${lista.length ? ' · ' + lista.length : ''}</button>`;
  return botao ? `<div class="curtir">${botao}</div>` : '';
}
// foto grande ao tocar no avatar
function abrirFoto(id) {
  const j = porId(id); if (!j) return;
  const { geral } = posicoes();
  const d = document.createElement('div');
  d.className = 'zoom'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Foto de ' + j.nome);
  d.innerHTML = `<div class="zoom-c">${j.foto_url ? `<img src="${esc(j.foto_url)}" alt="${esc(j.nome)}" onerror="this.replaceWith(document.createRange().createContextualFragment(this.dataset.ini))" data-ini="${esc(avatar({ nome: j.nome }, 220))}">` : avatar({ nome: j.nome }, 220)}
    <b class="cond">${esc(j.nome)}</b><small>${geral[j.id] ? geral[j.id] + 'º lugar · ' : ''}${j.grupo ? 'Grupo ' + esc(j.grupo) : ''}</small></div>
    <button class="zoom-x" aria-label="Fechar">×</button>`;
  const fechar = () => { d.remove(); document.removeEventListener('keydown', esc1); };
  const esc1 = (e) => { if (e.key === 'Escape') fechar(); };
  d.addEventListener('click', fechar); document.addEventListener('keydown', esc1);
  document.body.appendChild(d); d.querySelector('.zoom-x').focus();
}
// e-mail e nascimento não vêm na lista (privacidade): só pelas funções meus_dados / admin_emails
const COLS = 'id,user_id,nome,grupo,celular,mostrar_niver,standby,foto_url,admin,dono,ativo,joga,pendente,senha_trocada,avisos_visto_em,tp,vi,de,sp,sc,gp,gc,posicao,criado_em';
async function rpcLista(nome) { const { data, error } = await sb.rpc(nome); if (error) throw error; return data || []; }
async function carregar() {
  const [jg, ms, av, pt, cf, fi, fv, fj] = await Promise.all([
    sb.from('jogadores').select(COLS),
    sb.from('meses').select('*').order('id', { ascending: false }),
    sb.from('avisos').select('*').order('criado_em', { ascending: false }).limit(40),
    sb.from('patrocinadores').select('*').order('ordem'),
    sb.from('config').select('*'),
    sb.from('finals').select('*'),
    sb.from('finals_vagas').select('*'),
    sb.from('finals_jogos').select('*').order('criado_em')
  ]);
  for (const r of [jg, ms, av, pt, cf, fi, fv, fj]) if (r.error) throw r.error;
  S.finals = fi.data; S.fvagas = fv.data; S.fjogos = fj.data;
  S.jogadores = jg.data; S.meses = ms.data; S.avisos = av.data; S.patros = pt.data;
  S.config = Object.fromEntries(cf.data.map((c) => [c.chave, c.valor]));
  S.mesAtual = S.meses.find((m) => m.status === 'aberto') || null;
  S.jogosPorMes = {};
  S.eu = S.jogadores.find((j) => j.user_id === S.uid) || null;
  const [jogos, meus, niver, emails, backups] = await Promise.all([S.mesAtual ? jogosDoMes(S.mesAtual.id) : [], S.eu ? rpcLista('meus_dados') : [], S.eu ? rpcLista('aniversariantes_hoje') : [], S.eu && S.eu.admin ? rpcLista('admin_emails') : [], S.eu && S.eu.admin ? rpcLista('lista_backups').catch(() => []) : []]);
  S.backups = backups;
  aquecerFotos();
  S.jogos = jogos;
  if (!S.eu) return;
  Object.assign(S.eu, meus[0] || {});
  S.niver = niver;
  S.emails = Object.fromEntries(emails.map((e) => [e.id, e.email]));
  salvarCache();
}
// baixa as fotos de todo mundo em segundo plano: quando abrir Jogos ou Pontuação, já estão no celular
let fotosAquecidas = false;
function aquecerFotos() {
  if (fotosAquecidas) return; fotosAquecidas = true;
  const urls = [...new Set(S.jogadores.map((j) => j.foto_url).filter(Boolean))];
  const vai = () => urls.forEach((u, i) => setTimeout(() => { const im = new Image(); im.decoding = 'async'; im.src = u; }, i * 40));
  'requestIdleCallback' in window ? requestIdleCallback(vai, { timeout: 3000 }) : setTimeout(vai, 1500);
}
// cópia local do último carregamento: o app abre na hora e atualiza em seguida
const CACHE = 'galera-cache-v1', CAMPOS = ['uid', 'jogadores', 'meses', 'avisos', 'patros', 'config', 'finals', 'fvagas', 'fjogos', 'mesAtual', 'jogos', 'jogosPorMes', 'curtidas', 'eu', 'niver'];
function salvarCache() { try { localStorage.setItem(CACHE, JSON.stringify(Object.fromEntries(CAMPOS.map((k) => [k, S[k]])))); } catch (e) { /* sem espaço ou sem storage: segue */ } }
function lerCache() {
  try {
    const sess = JSON.parse(localStorage.getItem('sb-' + new URL(SUPABASE_URL).hostname.split('.')[0] + '-auth-token') || 'null');
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
    return c && sess && sess.user && c.uid === sess.user.id && c.eu ? c : null;
  } catch (e) { return null; }
}
// ---------- Finals ----------
const ANO = () => new Date().getFullYear();
const anoFinals = () => (S.finals.length ? Math.max(...S.finals.map((x) => x.ano)) : ANO());
const FASES = { grupos: 'Fase de grupos', semi: 'Semifinais', final: 'Final', encerrado: 'Encerrado' };
const pg = (g) => ({ a: g.jogador_a, b: g.jogador_b, sets: g.sets });
function minhaVaga() { const a = anoFinals(); return S.eu && S.fvagas.find((v) => v.ano === a && v.jogador === S.eu.id); }
function dadosFinals(ano, grupo) {
  const fz = S.finals.find((x) => x.ano === ano && x.grupo === grupo);
  const vg = S.fvagas.filter((v) => v.ano === ano && v.grupo === grupo).sort((x, y) => x.seed - y.seed);
  const js = S.fjogos.filter((j) => j.ano === ano && j.grupo === grupo);
  const t = [1, 2].map((c) => M.tabelaChave(vg.filter((v) => v.chave === c).map((v) => v.jogador), js.filter((j) => j.fase === 'grupos' && j.chave === c).map(pg)));
  return { fz, vg, js, t, semis: js.filter((j) => j.fase === 'semi'), final: js.find((j) => j.fase === 'final') };
}

let recarregando = null;
function recarregarDepois() {
  clearTimeout(recarregando);
  recarregando = setTimeout(async () => { try { await carregar(); render(); } catch (e) { console.error(e); } }, 600);
}

// ---------- regras de exibição ----------
// WO confirmado: vence quem não deu o WO (regra 2.6); anulado ou em análise: ninguém
function vencedor(g) { if (g.wo_de) return g.wo_status === 'confirmado' ? (g.wo_de === g.jogador_a ? g.jogador_b : g.jogador_a) : null; if (!g.sets) return null; const r = M.resultado(g.sets); return r.aVenceu ? g.jogador_a : g.jogador_b; }
// regra 8.1: quem está classificado abaixo traz as bolinhas
function trazBola(g) {
  if (!g || !g.jogador_b) return null;
  if (g.traz_bola) return g.traz_bola;
  const a = porId(g.jogador_a), b = porId(g.jogador_b);
  return ((a && a.posicao) || 9999) > ((b && b.posicao) || 9999) ? g.jogador_a : g.jogador_b;
}
const BOLINHA = (quem, g) => (trazBola(g) === quem ? ` <span title="Traz as bolinhas (regra 8.1)" aria-label="traz as bolinhas" style="display:inline-flex;vertical-align:-2px;margin:0 4px">${BOLA(15)}</span>` : '');
function placarTxt(sets) { return (sets || []).map(([a, b]) => a + '/' + b).join(' '); }
// pneu = set 6×0: sempre mostra o pneu depois do placar
const temPneu = (sets) => (sets || []).some(([a, b]) => (a === 6 && b === 0) || (a === 0 && b === 6));
const PNEU = (t) => `<svg width="${t}" height="${t}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#1E1E22"/>${Array.from({ length: 12 }, (_, i) => `<rect x="15" y="1.2" width="2" height="4.2" rx=".6" fill="#55555C" transform="rotate(${i * 30} 16 16)"/>`).join('')}<circle cx="16" cy="16" r="9.6" fill="#2C2C31"/><circle cx="16" cy="16" r="7.2" fill="#C9CCD3"/><circle cx="16" cy="16" r="5.6" fill="#9DA1AA"/>${Array.from({ length: 5 }, (_, i) => `<rect x="15.3" y="10.6" width="1.4" height="4.4" rx=".7" fill="#E7E9EE" transform="rotate(${i * 72} 16 16)"/>`).join('')}<circle cx="16" cy="16" r="1.8" fill="#55555C"/></svg>`;
const pneuTag = (sets, t = 16) => (temPneu(sets) ? ` <span title="Pneu (6×0)" style="display:inline-flex;vertical-align:-3px">${PNEU(t)}</span>` : '');
// troféu dourado + "VENCEDOR" embaixo do nome de quem ganhou
const TROFEU = (t) => `<svg width="${t}" height="${t}" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="ouroV" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF1A6"/><stop offset=".45" stop-color="#E8B923"/><stop offset="1" stop-color="#A8740E"/></linearGradient></defs><path d="M14 10c-6 0-7 9 1 11M34 10c6 0 7 9-1 11" fill="none" stroke="url(#ouroV)" stroke-width="3" stroke-linecap="round"/><path d="M14 6h20v4c0 9-4 15-10 16-6-1-10-7-10-16z" fill="url(#ouroV)"/><path d="M22 26h4l1 6h-6z" fill="url(#ouroV)"/><rect x="15" y="33" width="18" height="9" rx="2" fill="#5A3E0A"/><rect x="13" y="41" width="22" height="4" rx="2" fill="#3A2806"/></svg>`;
const VENCEU = '<span class="venc">' + TROFEU(17) + 'VENCEDOR</span>';
const placarHTML = (sets) => esc(placarTxt(sets)) + pneuTag(sets);
function prazo() {
  if (!S.mesAtual) return null;
  const [a, m] = S.mesAtual.id.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  const hoje = new Date();
  const fim = new Date(a, m - 1, ultimo, 22, 0);
  const dias = Math.max(0, Math.ceil((fim - hoje) / 864e5));
  const pct = Math.min(100, Math.max(0, Math.round((hoje.getDate() / ultimo) * 100)));
  return { texto: ultimo + '/' + String(m).padStart(2, '0') + ' às 22h', dias: hoje > fim ? 'Prazo encerrado' : dias <= 1 ? 'Último dia!' : 'Faltam ' + dias + ' dias', pct };
}
const FRASES_V = ['Missão cumprida! Você venceu este mês.', 'Vitória na barragem. Sobe no ranking!', 'Boa! Venceu o jogo do mês.'];
const FRASES_D = ['Perdeu, bracinho de dinossauro!', 'Não foi dessa vez. Mês que vem tem revanche.', 'Derrota hoje, mas ainda somou pontos.'];

// ---------- telas ----------
function telaInicio() {
  const { geral } = posicoes();
  const eu = S.eu;
  const meu = eu && eu.ativo && S.jogos.find((g) => g.jogador_a === eu.id || g.jogador_b === eu.id);
  const p = prazo();
  let corpo;
  if (!eu.joga) {
    corpo = `<div class="resultado"><div style="flex-grow:1"><b class="cond" style="font-size:18px">Conta da coordenação</b><div class="dica">Você não entra no ranking. Use o Admin pelo botão ☰.</div></div></div>`;
  } else if (!eu.ativo) {
    corpo = `<div class="resultado" style="flex-direction:column;align-items:stretch;gap:10px"><div><b class="cond" style="font-size:18px">Você está fora do ranking</b><div class="dica">Quer voltar? A coordenação define seu grupo e sua posição.</div></div>
      <button class="btn btn-bola" data-acao="pedirVolta">Quero voltar ao ranking</button></div>`;
  } else if (!S.mesAtual && minhaVaga() && (S.finals.find((x) => x.ano === anoFinals() && x.grupo === minhaVaga().grupo) || {}).fase !== 'encerrado') {
    const v = minhaVaga(), fz = S.finals.find((x) => x.ano === v.ano && x.grupo === v.grupo);
    corpo = `<div class="resultado"><div style="flex-grow:1;min-width:0"><b class="cond" style="font-size:18px">Você está no Finals!</b><div class="dica">Grupo ${esc(v.grupo)} · Chave ${v.chave} · ${esc(FASES[fz.fase])}</div></div><a class="btn btn-bola" href="#/finals" style="height:44px;padding:0 14px;font-size:13px">Ver jogos</a></div>`;
  } else if (!S.mesAtual) {
    corpo = `<div class="resultado"><div style="flex-grow:1"><b class="cond" style="font-size:18px">Aguardando a coordenação</b><div class="dica">Os jogos do mês aparecem aqui quando o mês for aberto.</div></div></div>`;
  } else if (meu && !meu.jogador_b) {
    corpo = `<div class="resultado"><div style="flex-grow:1"><b class="cond" style="font-size:18px">Standby do mês: +25 pontos</b><div class="dica">Número ímpar de jogadores e você ficou sem adversário (regra 2.2).</div></div></div>`;
  } else if (!meu) {
    corpo = `<div class="resultado"><div style="flex-grow:1"><b class="cond" style="font-size:18px">${eu.standby ? 'Você está em standby' : 'Sem jogo neste mês'}</b><div class="dica">${eu.standby ? 'Desligue o standby no seu perfil para voltar na próxima rodada.' : 'Fale com a coordenação se achar que é um erro.'}</div></div></div>`;
  }
  let vs = '';
  if (meu && meu.jogador_b) {
    const adv = porId(meu.jogador_a === eu.id ? meu.jogador_b : meu.jogador_a);
    const v = vencedor(meu);
    const sub = meu.wo_de ? 'WO · ' + (meu.wo_status === 'aguardando' ? 'AGUARDANDO' : meu.wo_status === 'anulado' ? 'CONTESTADO' : v === eu.id ? 'VITÓRIA' : 'DERROTA') : meu.sets ? (v === eu.id ? 'VITÓRIA' : 'DERROTA') : (trazBola(meu) === eu.id ? 'VOCÊ TRAZ AS BOLAS' : 'ELE TRAZ AS BOLAS');
    vs = `<div class="vs">
      <div class="lado">${avatar(eu, 62)}<b>${esc(eu.nome)}${BOLINHA(eu.id, meu)}</b><small style="font-size:11px;color:var(--bola)">${geral[eu.id] || '–'}º lugar</small></div>
      <div class="lado"><span class="vs-txt" aria-hidden="true">VS</span><small class="${meu.sets || meu.wo_de ? '' : 'brilho'}" style="font-size:10px;letter-spacing:1px;color:rgba(255,255,255,.6)">${esc(sub)}</small>${meu.sets && !meu.wo_de ? `<b class="cond" style="font-size:15px;letter-spacing:.5px;color:#fff;white-space:nowrap">${esc(placarTxt(meu.sets))}${pneuTag(meu.sets, 14)}</b>` : ''}</div>
      <div class="lado">${avatar(adv, 62)}<b>${esc(adv ? adv.nome : '?')}${BOLINHA(adv && adv.id, meu)}</b><small style="font-size:11px;color:rgba(255,255,255,.7)">${(adv && geral[adv.id]) || '–'}º lugar</small></div>
    </div>`;
    if (meu.wo_de && meu.wo_status === 'aguardando' && meu.wo_de === eu.id) {
      corpo = `<div class="resultado" style="flex-direction:column;align-items:stretch;gap:8px"><div><b class="cond" style="font-size:18px;color:var(--verm)">${esc(adv ? adv.nome : '?')} lançou WO pra você</b><div class="dica">${esc(meu.wo_obs || '')}</div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-linha" data-acao="woResp" data-v="confirmado" data-id="${meu.id}">Aceitar</button><button class="btn btn-roxo" data-acao="woResp" data-v="anulado" data-id="${meu.id}">Contestar</button></div>
        <span class="dica" style="font-size:11px">Contestar = 0 pontos pros dois (regra 2.7). Sem resposta até o fim do mês, vale o WO.</span></div>`;
    } else if (meu.wo_de) {
      corpo = `<div class="resultado"><div style="flex-grow:1;min-width:0"><b class="cond" style="font-size:18px">${esc(woTxt(meu))}</b><div class="dica">${meu.wo_status === 'aguardando' ? 'Esperando ' + esc(adv ? adv.nome : '?') + ' aceitar ou contestar.' : meu.wo_status === 'anulado' ? 'Contestado: zero pontos para os dois (regra 2.7).' : meu.wo_de === eu.id ? 'Você não soma pontos neste mês.' : 'Você ganha 25 pontos.'}</div></div>
        <a class="btn btn-linha" href="#/wo/${meu.id}" style="height:44px;padding:0 12px;font-size:13px">Ver</a></div>`;
    } else if (!meu.sets) {
      const link = adv && zap(adv.celular, 'E aí, bora marcar nosso jogo do ranking?');
      corpo = `<div class="acoes" style="grid-template-columns:1fr 1fr 52px">
        ${link ? `<a class="btn btn-zap" href="${esc(link)}" target="_blank" rel="noopener">WhatsApp</a>` : `<button class="btn btn-linha" disabled title="Adversário sem celular cadastrado">Sem celular</button>`}
        <a class="btn btn-bola" href="#/placar/${meu.id}">Gravar placar</a>
        <a class="btn btn-linha" href="#/wo/${meu.id}" aria-label="Não vou poder jogar (WO)" title="WO" style="padding:0;flex-direction:column;gap:0;font-size:10px;font-weight:800;color:var(--verm)">${IC_WO}<span>WO</span></a></div>`;
    } else {
      const venci = v === eu.id, k = new Date().getMonth() % 3;
      corpo = `<div class="resultado">
        <div style="flex-grow:1;min-width:0"><b class="cond" style="font-size:20px;color:${venci ? 'var(--verde)' : 'var(--verm)'}">${venci ? 'Parabéns, ' + esc(eu.nome) + '!' : 'Você perdeu este mês'}</b>
        <div class="dica">${esc(venci ? FRASES_V[k] : FRASES_D[k])}</div>${venci && (S.curtidas[meu.id] || []).length ? `<div class="curtir" style="margin-top:6px"><span class="curtir-b on">${CORACAO} ${S.curtidas[meu.id].length}</span><small>curtiram sua vitória</small></div>` : ''}</div>
        <a class="btn btn-linha" href="#/placar/${meu.id}" style="height:44px;padding:0 12px;font-size:13px">Corrigir</a></div>`;
    }
  }
  const naoLidos = avisosNaoLidos();
  return `
  <header class="topo">
    <div class="topo-linha">
      ${eu.admin ? `<a class="ic-btn" href="#/admin" aria-label="Admin"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></a>` : '<span style="width:44px"></span>'}
      <button class="logo-btn" data-acao="abertura" aria-label="Ver a abertura de novo"><img src="icones/logo.png" alt="Galera da Raquete Portal do Lago"></button>
      <a class="ic-btn" href="#/avisos" aria-label="Avisos da coordenação"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>${naoLidos ? `<span class="badge" aria-label="${naoLidos} aviso(s) novo(s)">${naoLidos > 9 ? '9+' : naoLidos}</span>` : ''}</a>
    </div>
    <h1 class="titulo">Portal do Lago Open de Tênis</h1>
    <p class="sub-ranking">RANKING</p>
  </header>
  <section class="jogo" aria-label="Seu jogo do mês">
    <div class="jogo-top"><b class="cond" style="font-size:14px;letter-spacing:2px;color:var(--bola)">JOGO DO MÊS</b><span class="chip">Grupo ${esc(eu.grupo)} · ${S.mesAtual ? esc(MESES[Number(S.mesAtual.id.slice(5)) - 1]) : '—'}</span></div>
    ${vs}
    ${p && meu && meu.jogador_b ? `<div style="padding:0 14px 8px"><div style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.75)"><span>Prazo: até ${p.texto}</span><b style="color:var(--bola)">${p.dias}</b></div>
      <div class="barra" aria-hidden="true"><i style="width:${p.pct}%"></i><svg style="left:${p.pct}%" width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#D8F145" stroke="#1A0D33" stroke-width="1.5"/><path d="M3 4.5c4 1.5 6 3.5 6 5.5s-2 4-6 5.5M17 4.5c-4 1.5-6 3.5-6 5.5s2 4 6 5.5" fill="none" stroke="#1A0D33" stroke-width="1.5" stroke-linecap="round"/></svg></div></div>` : '<div style="height:8px"></div>'}
    ${corpo || ''}
  </section>
  <nav class="menu" aria-label="Menu">${MENU.map((t) => `<${t.href ? 'a' : 'button'} class="tile" ${t.href ? `href="${t.href()}"${t.fora ? ' target="_blank" rel="noopener"' : ''}` : `data-acao="embreve"`}><span class="ic">${t.ic}</span>${t.nome}</${t.href ? 'a' : 'button'}>`).join('')}</nav>
  <div id="carrossel"></div>
  <div class="faixa" role="marquee" aria-label="Notícias do ranking"><div class="tk">${faixa()}${faixa()}</div></div>`;
}

const IC_WO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".12"/><path d="M5.6 5.6l12.8 12.8"/></svg>';
const woTxt = (g) => 'WO de ' + ((porId(g.wo_de) || {}).nome || '?') + ' · ' + (g.wo_motivo === 'lesao' ? 'lesão' : 'não comparecimento') + (g.wo_status === 'aguardando' ? ' (aguardando resposta)' : g.wo_status === 'anulado' ? ' (contestado)' : '');
const IC = (d) => `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const MENU = [
  { nome: 'Meu perfil', href: () => '#/perfil', ic: IC('<circle cx="12" cy="12" r="10.5" stroke-opacity=".35"/><circle cx="12" cy="9" r="3.6" fill="currentColor" fill-opacity=".22"/><path d="M5.6 19.2c1-3 3.4-4.7 6.4-4.7s5.4 1.7 6.4 4.7" fill="currentColor" fill-opacity=".22"/>') },
  { nome: 'Jogos do ranking', href: () => '#/jogos', ic: IC('<ellipse cx="8.3" cy="7.6" rx="3.9" ry="5" transform="rotate(-35 8.3 7.6)" fill="currentColor" fill-opacity=".18"/><path d="M10.9 11.6l7.6 8.6"/><ellipse cx="15.7" cy="7.6" rx="3.9" ry="5" transform="rotate(35 15.7 7.6)" fill="currentColor" fill-opacity=".18"/><path d="M13.1 11.6l-7.6 8.6"/><circle cx="12" cy="19.6" r="1.6" fill="currentColor" stroke="none"/>') },
  { nome: 'Pontuação', href: () => '#/ranking', ic: IC('<path d="M12 1.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 3.8l2.2-.3z" fill="currentColor" stroke="none"/><rect x="9" y="8.5" width="6" height="12.5" rx="1" fill="currentColor" fill-opacity=".3"/><rect x="2.5" y="12" width="6.5" height="9" rx="1" fill="currentColor" fill-opacity=".12"/><rect x="15" y="14.5" width="6.5" height="6.5" rx="1" fill="currentColor" fill-opacity=".12"/>') },
  { nome: 'Programação 2026', href: () => '#/programacao', ic: IC('<rect x="3" y="5" width="18" height="16" rx="3" fill="currentColor" fill-opacity=".12"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="12" cy="15.5" r="3" fill="currentColor" fill-opacity=".35"/>') },
  { nome: 'Resumo do mês', href: () => '#/resumo', ic: IC('<path d="M3 3v18h18"/><path d="M6 10l5-4 4 2 5-4"/><circle cx="20" cy="4" r="1.4" fill="currentColor" stroke="none"/>') },
  { nome: 'Enquetes', ic: IC('<rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" fill-opacity=".1"/><rect x="6" y="7" width="9" height="2.4" rx="1.2" fill="currentColor" stroke="none"/><rect x="6" y="11" width="12" height="2.4" rx="1.2" fill="currentColor" fill-opacity=".45" stroke="none"/>') },
  { nome: 'Fale conosco', fora: true, href: () => zap(S.config.fale_conosco, 'Olá! Preciso falar com a coordenação do ranking.') || '#/', ic: IC('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1.5" fill="currentColor" fill-opacity=".3"/><rect x="17" y="13" width="4" height="6" rx="1.5" fill="currentColor" fill-opacity=".3"/><path d="M19 19c0 1.7-2 2.5-5 2.5"/>') },
  { nome: 'Torneios', href: () => '#/torneios', ic: TROFEU(26) },
  { nome: 'Regulamento', href: () => '#/regulamento', ic: IC('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z" fill="currentColor" fill-opacity=".14"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M8.5 10.5l2 2 4-4.5"/>') }
];

function faixa() {
  const itens = [];
  S.avisos.filter((a) => a.na_faixa && Date.now() - new Date(a.criado_em) < 30 * 864e5).forEach((a) => itens.push([a.tipo === 'AVISO' ? 'AVISO' : a.tipo, a.titulo]));
  (S.niver || []).forEach((j) => itens.push(['ANIVERSARIANTE DO DIA', 'Parabéns, ' + j.nome + '!']));
  const { geral } = posicoes();
  const lider = rankingVivo()[0];
  const jl = lider && S.jogos.find((g) => g.sets && (g.jogador_a === lider.id || g.jogador_b === lider.id));
  if (jl && vencedor(jl) === lider.id) itens.push(['LÍDER VENCEU', lider.nome + ' venceu o jogo do mês']);
  S.jogos.filter((g) => g.jogador_b && Math.max(geral[g.jogador_a] || 99, geral[g.jogador_b] || 99) <= 6)
    .forEach((g) => itens.push(['JOGÃO DO MÊS', (porId(g.jogador_a) || {}).nome + ' x ' + (porId(g.jogador_b) || {}).nome + (g.sets ? ' · ' + placarTxt(g.sets) : '')]));
  if (!itens.length) itens.push(['GALERA DA RAQUETE', 'Portal do Lago Open de Tênis']);
  return itens.map(([t, x]) => `<span><b>${esc(t)}</b>${esc(x)}</span>`).join('');
}

function slides() {
  const lista = S.patros.map((p) => ({ tipo: 'p', ...p }));
  const vivo = rankingVivo();
  const tops = ['A', 'B', 'C', 'D'].map((g) => ({ tipo: 't', g, js: (g === 'D' ? vivo : vivo.filter((j) => j.grupo === g)).slice(0, 4) })).filter((t) => t.js.length);
  const out = []; let t = 0;
  lista.forEach((p, i) => { out.push(p); if (i % 2 === 1 && tops[t]) out.push(tops[t++]); });
  while (tops[t]) out.push(tops[t++]);
  return out;
}
function renderCarrossel() {
  const el = document.getElementById('carrossel'); if (!el) return;
  const sl = slides(); if (!sl.length) { el.innerHTML = ''; return; }
  const i = S.slide % sl.length, s = sl[i];
  const corpo = s.tipo === 'p'
    ? `<${s.link ? `a href="${esc(s.link)}" target="_blank" rel="noopener"` : 'div'} class="patro" style="background:${esc(s.fundo || '#fff')}"><img src="${esc(s.logo_url)}" alt="${esc(s.nome)}"></${s.link ? 'a' : 'div'}>`
    : `<div class="top4"><b class="cond" style="font-size:12px;letter-spacing:1.5px;color:var(--bola)">TOP 4 · ${s.g === 'D' ? 'DYNAMICS (GERAL)' : 'GRUPO ' + s.g}</b><div class="g">${s.js.map((j, k) => `<div><b class="cond" style="color:var(--bola)">${k + 1}º</b><span>${esc(j.nome)}</span><small>${j.tp}</small></div>`).join('')}</div></div>`;
  el.innerHTML = corpo + `<div class="pontos" aria-hidden="true">${sl.map((_, k) => `<i style="width:${k === i ? 22 : 6}px;${k === i ? 'background:var(--roxo)' : ''}"></i>`).join('')}</div>`;
}

function telaRanking() {
  const aba = S.abaRk, geral = aba === 'D';
  const vivo = rankingVivo();
  const lista = geral ? vivo : vivo.filter((j) => j.grupo === aba);
  return voltar('Ranking', geral ? 'Dynamics · todos juntos, jogos pelo geral' : 'Grupo ' + aba + ' · 8 primeiros vão ao Finals') + `
  <div style="background:#2A1650;padding:0 16px 14px"><div class="abas" role="tablist" style="grid-template-columns:1.4fr 1fr 1fr 1fr">
    ${[['D', 'DYNAMICS'], ['A', 'A'], ['B', 'B'], ['C', 'C']].map(([id, r]) => `<button class="aba" role="tab" aria-selected="${aba === id}" data-acao="abaRk" data-v="${id}">${r}</button>`).join('')}
  </div></div>
  <div class="conteudo">
    ${lista.length ? BUSCA('Buscar jogador…') + NADA : ''}
    <span class="dica">${geral ? '' : 'Faixa verde = top 8, vão ao Finals · '}TP pontos · VI vitórias · SP sets pró · DE derrotas · SG saldo de games</span>
    ${lista.map((j, i) => { const fin = !geral && i < 8, sg = j.gp - j.gc; return `
      <div class="linha-rk${fin ? ' fin' : ''}" ${dn(j.nome)}>
        <div style="display:flex;align-items:center;gap:10px">
          <b class="cond" style="font-size:20px;width:30px;color:${fin ? 'var(--verde)' : 'var(--roxo)'}">${i + 1}º</b>${avatar(j, 40)}
          <div style="min-width:0;flex-grow:1"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(j.nome)}${geral && i === 0 ? ` <span title="1º do ranking" style="display:inline-flex;vertical-align:-5px">${TROFEU(26)}</span>` : ''}${j.id === S.eu.id ? ' <span class="tag" style="background:#EFEAF8;color:var(--roxo)">VOCÊ</span>' : ''}${j.standby ? ' <span class="tag" style="background:#5B5470;color:#fff">STANDBY</span>' : ''}</div><small class="dica">Grupo ${esc(j.grupo)}</small></div>
        </div>
        <div class="stats"><span><b style="color:var(--roxo)">${j.tp}</b><small>TP</small></span><span><b>${j.vi}</b><small>VI</small></span><span><b>${j.sp}</b><small>SP</small></span><span><b>${j.de}</b><small>DE</small></span><span><b style="color:${sg < 0 ? 'var(--verm)' : 'inherit'}">${sg > 0 ? '+' : ''}${sg}</b><small>SG</small></span></div>
      </div>${!geral && i === 7 && lista.length > 8 ? '<div class="corte" aria-hidden="true">LINHA DOS FINALS · 8 VAGAS</div>' : ''}`; }).join('') || '<p class="dica">Nenhum jogador ainda.</p>'}
  </div>`;
}

async function telaJogos() {
  const idx = Math.max(0, S.meses.findIndex((m) => m.id === S.mesVer));
  const mes = S.meses[idx];
  const { geral } = posicoes();
  // ordem da barragem: pela posição do primeiro de cada par; standby no fim
  const jogos = (mes ? await jogosDoMes(mes.id) : []).slice().sort((x, y) => (!x.jogador_b) - (!y.jogador_b) || (geral[x.jogador_a] || 999) - (geral[y.jogador_a] || 999));
  const pode = (g) => mes.status === 'aberto' && (S.eu.admin || g.jogador_a === S.eu.id || g.jogador_b === S.eu.id);
  return voltar('Jogos do ranking', 'Pelo geral (Dynamics) · bolinha ao lado do nome = traz as bolinhas') + `
  <div style="background:#2A1650;padding:0 16px 14px;display:flex;align-items:center;justify-content:space-between;color:#fff">
    <button class="ic-btn" data-acao="mesVer" data-v="${idx + 1}" ${idx >= S.meses.length - 1 ? 'disabled style="opacity:.3"' : ''} aria-label="Mês anterior">‹</button>
    <div style="text-align:center"><b class="cond" style="font-size:22px">${mes ? nomeMes(mes.id) : '—'}</b><br><small style="color:var(--bola);font-weight:600">${mes ? (mes.status === 'aberto' ? 'MÊS ATUAL' : 'ENCERRADO') : ''}</small></div>
    <button class="ic-btn" data-acao="mesVer" data-v="${idx - 1}" ${idx <= 0 ? 'disabled style="opacity:.3"' : ''} aria-label="Próximo mês">›</button>
  </div>
  <div class="conteudo">
    ${jogos.length ? BUSCA('Buscar jogador…') + NADA : ''}
    ${jogos.map((g) => { const a = porId(g.jogador_a), b = porId(g.jogador_b), v = vencedor(g); return `
      <div class="card" ${dn(a && a.nome, b && b.nome)} style="padding:12px;display:flex;flex-direction:column;gap:10px">
        ${b ? `<div class="confronto">
          <div class="p${v === g.jogador_a ? ' v' : ''}">${avatar(a, 44)}<span class="nm"><span>${esc(a && a.nome)}${BOLINHA(g.jogador_a, g)}</span><small>${geral[g.jogador_a] ? geral[g.jogador_a] + 'º lugar' : ''}</small>${v === g.jogador_a ? VENCEU : ''}</span></div>
          <span class="vs-mini" aria-label="contra"><span class="vs-txt" aria-hidden="true">VS</span></span>
          <div class="p${v === g.jogador_b ? ' v' : ''}" style="justify-content:flex-end"><span class="nm" style="align-items:flex-end;text-align:right"><span>${BOLINHA(g.jogador_b, g)}${esc(b.nome)}</span><small>${geral[g.jogador_b] ? geral[g.jogador_b] + 'º lugar' : ''}</small>${v === g.jogador_b ? VENCEU : ''}</span>${avatar(b, 44)}</div>
        </div>` : `<div style="display:flex;align-items:center;gap:8px">${avatar(a, 44)}<span style="display:flex;flex-direction:column;line-height:1.2"><span>${esc(a && a.nome)}</span><small class="dica">${geral[g.jogador_a] ? geral[g.jogador_a] + 'º lugar' : ''}</small></span></div>`}
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #F0EDF5;padding-top:8px;font-size:12px">
          ${!b ? '<span class="tag" style="background:#EFEAF8;color:var(--roxo)">STANDBY +25</span>' : g.wo_de ? `<span class="tag" style="background:#FDECEC;color:var(--verm)">WO · ${g.wo_motivo === 'lesao' ? 'LESÃO' : 'AUSÊNCIA'}${g.wo_status === 'aguardando' ? ' · AGUARDANDO' : g.wo_status === 'anulado' ? ' · CONTESTADO' : ''}</span>` : g.sets ? '<span class="tag" style="background:#E3F0E8;color:var(--verde)">JOGADO</span>' : '<span class="tag" style="background:#FFF3E8;color:#7A3E0A">PENDENTE</span>'}
          <span style="font-weight:600;color:var(--tinta2)">${g.wo_de ? (pode(g) ? `<a href="#/wo/${g.id}">de ${esc((porId(g.wo_de) || {}).nome)}</a>` : `de ${esc((porId(g.wo_de) || {}).nome)}`) : g.sets ? placarHTML(g.sets) : b && pode(g) ? `<a href="#/placar/${g.id}">Gravar placar</a>` : ''}</span>
        </div>
        ${curtir(g)}
      </div>`; }).join('') || '<p class="dica">Nenhum jogo neste mês.</p>'}
  </div>`;
}

async function telaPlacar(id, fin) {
  let g = (fin ? S.fjogos : S.jogos).find((x) => x.id === id);
  if (!g && !fin) { const r = await sb.from('jogos').select('*').eq('id', id).maybeSingle(); g = r.data; }
  if (!g || !g.jogador_b) return voltar('Gravar placar') + '<div class="conteudo"><p class="erro">Jogo não encontrado.</p></div>';
  const a = porId(g.jogador_a), b = porId(g.jogador_b);
  const mes = !fin && S.meses.find((m) => m.id === g.mes);
  const fz = fin && S.finals.find((x) => x.ano === g.ano && x.grupo === g.grupo);
  const participa = g.jogador_a === S.eu.id || g.jogador_b === S.eu.id;
  const p = fin ? null : prazo();
  const fechado = fin ? !S.eu.admin && (!fz || fz.fase !== g.fase) : (!mes || mes.status !== 'aberto' || (!S.eu.admin && p && p.dias === 'Prazo encerrado'));
  if (!participa && !S.eu.admin) return voltar('Gravar placar') + '<div class="conteudo"><p class="erro">Você só grava o placar do seu jogo.</p></div>';
  const sets = (g.sets || []).concat([[], [], []]).slice(0, 3);
  return voltar('Gravar placar', fin ? 'Finals · Grupo ' + g.grupo + ' · ' + FASES[g.fase] : nomeMes(g.mes)) + `
  <form class="conteudo" data-form="placar" data-id="${g.id}" data-tabela="${fin ? 'finals_jogos' : 'jogos'}">
    <div class="card" style="font-size:13px;line-height:1.4;background:${fechado ? '#FDECEC' : '#EFEAF8'};color:${fechado ? 'var(--verm)' : 'var(--roxo2)'};border:0">${fin ? (fechado ? 'Essa fase do Finals já fechou. Só a coordenação altera.' : 'Pode gravar e corrigir enquanto esta fase do Finals estiver aberta.') : fechado ? (mes && mes.status !== 'aberto' ? 'Mês encerrado. Pra corrigir, a coordenação reabre o mês no Admin.' : 'Prazo encerrado. Agora só a coordenação pode alterar este placar.') : 'Pode gravar e corrigir até ' + (p ? p.texto : 'o fim do mês') + '. Cada correção fica registrada.'}</div>
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="set"><span></span><b style="text-align:center;font-size:13px">${esc(a.nome)}</b><b style="text-align:center;font-size:13px">${esc(b.nome)}</b></div>
      ${sets.map((s, i) => { const tb = i === 2, rot = tb ? 'Tie-break' : (i + 1) + 'º set', mx = tb ? 40 : 7; return `<div class="set"><span class="dica" style="font-weight:${tb ? 800 : 600};${tb ? 'color:var(--verm)' : ''}">${rot}</span>
        <input class="campo" name="a${i}" type="number" inputmode="numeric" min="0" max="${mx}" value="${s[0] ?? ''}" aria-label="${rot}, ${tb ? 'pontos' : 'games'} de ${esc(a.nome)}" ${fechado ? 'disabled' : ''}>
        <input class="campo" name="b${i}" type="number" inputmode="numeric" min="0" max="${mx}" value="${s[1] ?? ''}" aria-label="${rot}, ${tb ? 'pontos' : 'games'} de ${esc(b.nome)}" ${fechado ? 'disabled' : ''}></div>`; }).join('')}
    </div>
    <div id="previa" class="card" style="background:var(--noite);color:#fff;border:0"></div>
    ${fechado ? '' : '<button class="btn btn-roxo" type="submit">Gravar placar</button>'}
    ${!fechado && g.sets ? `<button class="btn btn-linha" type="button" style="color:var(--verm)" data-acao="cancelarPlacar" data-id="${g.id}" data-tabela="${fin ? 'finals_jogos' : 'jogos'}">Cancelar placar</button>` : ''}
    <p id="placar-msg" role="status"></p>
  </form>`;
}
// tie-break só abre quando cada um venceu um set
function empatou(form) {
  const v = [0, 1].map((i) => [Number(form['a' + i].value), Number(form['b' + i].value)]);
  return form.a0.value !== '' && form.b0.value !== '' && form.a1.value !== '' && form.b1.value !== '' &&
    v.every(([x, y]) => M.setValido(x, y, false)) && (v[0][0] > v[0][1]) !== (v[1][0] > v[1][1]);
}
function lerSets(form) {
  const sets = [];
  for (let i = 0; i < 3; i++) {
    const x = form['a' + i].value, y = form['b' + i].value, nome = i === 2 ? 'tie-break' : (i + 1) + 'º set';
    if (x === '' && y === '') continue;
    if (x === '' || y === '') return { erro: 'Preencha os dois lados do ' + nome + '.' };
    if (!M.setValido(Number(x), Number(y), i === 2)) return { erro: i === 2 ? 'Tie-break vai até ' + M.TB + ' com 2 pontos de diferença (ex.: ' + M.TB + '×8, 11×9).' : 'O ' + nome + ' não pode terminar ' + x + '×' + y + '. Vale 6×0 a 6×4, 7×5 ou 7×6.' };
    sets.push([Number(x), Number(y)]);
  }
  try { return { sets, r: M.resultado(sets) }; } catch (e) { return { sets, erro: sets.length === 2 ? 'Deu 1×1 nos sets: falta o tie-break.' : 'Placar incompleto.' }; }
}
function previaPlacar(form) {
  const el = document.getElementById('previa'); if (!el) return;
  const g = S.jogos.concat(S.fjogos).find((x) => x.id === form.dataset.id) || {};
  const abre = empatou(form);
  ['a2', 'b2'].forEach((k) => { if (!abre) form[k].value = ''; form[k].disabled = !abre || form.a0.disabled; form[k].closest('.set').style.opacity = abre ? '1' : '.45'; });
  const { r, erro } = lerSets(form);
  const meio = form.a1.value !== '' && form.b1.value !== '';
  if (erro || !r) { el.innerHTML = `<b class="cond" style="font-size:20px">Resultado: incompleto</b>${erro && meio ? `<div style="font-size:13px;color:#FFB4B4">${esc(erro)}</div>` : ''}`; return; }
  const ven = porId(r.aVenceu ? g.jogador_a : g.jogador_b);
  const pneu = form && [0, 1, 2].some((i) => { const x = form['a' + i].value, y = form['b' + i].value; return (x === '6' && y === '0') || (x === '0' && y === '6'); });
  el.innerHTML = `<b class="cond" style="font-size:20px">${esc(ven ? ven.nome : '')} venceu ${r.setsA > r.setsB ? r.setsA + '×' + r.setsB : r.setsB + '×' + r.setsA}</b><div style="font-size:13px;color:var(--bola)">+${r.aVenceu ? r.ptsA : r.ptsB} vencedor / +${r.aVenceu ? r.ptsB : r.ptsA} perdedor${pneu ? ' · PNEU 6×0 <span style="display:inline-flex;vertical-align:-4px">' + PNEU(18) + '</span>' : ''}</div>`;
}

async function telaWo(id) {
  let g = S.jogos.find((x) => x.id === id);
  if (!g) { const r = await sb.from('jogos').select('*').eq('id', id).maybeSingle(); g = r.data; }
  if (!g || !g.jogador_b) return voltar('WO') + '<div class="conteudo"><p class="erro">Jogo não encontrado.</p></div>';
  const participa = g.jogador_a === S.eu.id || g.jogador_b === S.eu.id;
  if (!participa && !S.eu.admin) return voltar('WO') + '<div class="conteudo"><p class="erro">Só os jogadores do jogo podem dar WO.</p></div>';
  const mes = S.meses.find((m) => m.id === g.mes), p = prazo();
  const fechado = !S.eu.admin && (!mes || mes.status !== 'aberto' || (p && p.dias === 'Prazo encerrado'));
  const a = porId(g.jogador_a), b = porId(g.jogador_b);
  const eu = participa ? S.eu.id : null, adv = participa ? (g.jogador_a === eu ? b : a) : null;
  if (g.wo_de) {
    const acusado = g.wo_status === 'aguardando' && g.wo_de === eu, trava = fechado || (!S.eu.admin && g.wo_por !== eu);
    return voltar('WO', nomeMes(g.mes)) + `<div class="conteudo">
      <div class="card" style="border:2px solid var(--verm)"><b class="cond" style="font-size:20px;color:var(--verm)">${esc(woTxt(g))}</b>
        ${g.wo_obs ? `<p class="dica" style="margin-top:6px;white-space:pre-line">${esc(g.wo_obs)}</p>` : ''}</div>
      ${acusado && !fechado ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-linha" data-acao="woResp" data-v="confirmado" data-id="${g.id}">Aceitar</button><button class="btn btn-roxo" data-acao="woResp" data-v="anulado" data-id="${g.id}">Contestar</button></div><p class="dica">Contestar = 0 pontos pros dois (regra 2.7). Sem resposta até o fim do mês, vale o WO.</p>`
        : trava ? `<p class="dica">${fechado ? 'Prazo encerrado. Só a coordenação altera.' : g.wo_status === 'anulado' ? 'Contestado: zero pontos para os dois (regra 2.7).' : 'Só quem lançou o WO pode desfazer.'}</p>`
        : `<button class="btn btn-linha" data-acao="desfazerWo" data-id="${g.id}">Desfazer WO (o jogo volta a valer)</button>`}
    </div>`;
  }
  const opc = (v, tit, txt, marcado) => `<label class="card" style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="radio" name="tipo" value="${v}" ${marcado ? 'checked' : ''} required style="margin-top:4px;accent-color:var(--roxo)"><span><b style="font-size:15px">${tit}</b><br><span class="dica">${txt}</span></span></label>`;
  const quem = (j) => participa ? '' : `${esc(j && j.nome)}: `;
  return voltar('Não vou poder jogar', 'WO · regras 2.5 a 2.7') + `
  <form class="conteudo" data-form="wo" data-id="${g.id}">
    ${fechado ? '<p class="erro">Prazo encerrado. Só a coordenação registra WO agora.</p>' : ''}
    ${participa ? `
    ${opc('eu-lesao', 'Estou lesionado', 'Você dá o WO e não soma pontos. ' + esc(adv && adv.nome) + ' ganha 25 pontos.', true)}
    ${opc('eu-ausencia', 'Não vou poder comparecer', 'Você dá o WO e não soma pontos. ' + esc(adv && adv.nome) + ' ganha 25 pontos.')}
    ${opc('ele-ausencia', 'Meu adversário não compareceu', 'Ele recebe no app e aceita ou contesta. Contestou = 0 pontos pros dois (regra 2.7). Sem resposta até o fim do mês, vale o WO. Explique abaixo (regra 2.5).')}`
    : `${opc('a-lesao', quem(a) + 'lesão', 'WO de ' + esc(a && a.nome), true)}${opc('a-ausencia', quem(a) + 'não compareceu', 'WO de ' + esc(a && a.nome))}
       ${opc('b-lesao', quem(b) + 'lesão', 'WO de ' + esc(b && b.nome))}${opc('b-ausencia', quem(b) + 'não compareceu', 'WO de ' + esc(b && b.nome))}`}
    <label class="rot">Justificativa${participa ? ' (obrigatória se for WO do adversário)' : ''}<textarea class="campo" name="obs" rows="3" maxlength="500" placeholder="Ex.: combinamos sábado 8h e ele não apareceu."></textarea></label>
    <p class="dica">Não precisa dizer qual é a lesão. Se for ficar parado mais tempo, ligue o Standby no seu perfil e avise a coordenação (afastamento médico, regra 8.2).</p>
    ${fechado ? '' : '<button class="btn btn-roxo" type="submit" style="background:var(--verm)">Confirmar WO</button>'}
    <p id="wo-msg" role="status"></p>
  </form>`;
}

function telaPerfil() {
  const e = S.eu;
  return voltar('Meu perfil', e.email) + `
  <form class="conteudo" data-form="perfil">
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
      <label style="position:relative;cursor:pointer" aria-label="Trocar minha foto">${avatar(e, 96)}
        <span style="position:absolute;right:-2px;bottom:-2px;width:32px;height:32px;border-radius:50%;background:var(--roxo);color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span>
        <input type="file" accept="image/*" data-foto style="position:absolute;width:1px;height:1px;opacity:0"></label>
      <span class="dica">Toque na foto pra trocar · Grupo ${esc(e.grupo)}${e.admin ? ' · Admin' : ''}</span></div>
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      <label class="rot">Nome no ranking<input class="campo" name="nome" value="${esc(e.nome)}" autocomplete="name" required maxlength="40"></label>
      <label class="rot">Celular (WhatsApp)<input class="campo" name="celular" type="tel" inputmode="tel" value="${esc(e.celular || '')}" placeholder="(19) 9____-____" autocomplete="tel"></label>
      <label class="rot">Nascimento<input class="campo" name="nascimento" type="date" value="${esc(e.nascimento || '')}"><span class="dica" style="font-weight:400">No seu aniversário a faixa da tela inicial dá os parabéns (só o nome, sem idade).</span></label>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:8px;${e.standby ? 'border-color:var(--roxo);background:#EFEAF8' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <span><b style="font-size:15px">Standby</b><br><span class="dica">${e.standby ? 'Ligado: fora dos jogos até desligar' : 'Desligado: você joga normalmente'}</span></span>
        <button type="button" class="switch" role="switch" aria-checked="${e.standby}" data-acao="alterna" data-v="standby" aria-label="Standby"><i></i></button>
      </div>
      <span class="dica" style="font-size:11px">Seu e-mail e sua data de nascimento só você e a coordenação veem. <a href="#/privacidade">Política de privacidade</a><br>Standby vale a partir da próxima rodada. Sem pontos no mês e conta pro limite de 60 dias sem jogar (regra 8.2), salvo afastamento médico avisado à coordenação.</span>
    </div>
    <button class="btn btn-bola" type="submit">Salvar</button>
    <p id="perfil-msg" role="status"></p>
    <a class="btn btn-linha" href="#/senha">Trocar senha</a>
    <button class="btn btn-linha" type="button" data-acao="sair">Sair da conta</button>
  </form>`;
}

const avisosNaoLidos = () => { const visto = new Date((S.eu && S.eu.avisos_visto_em) || 0); return S.avisos.filter((a) => new Date(a.criado_em) > visto).length; };
async function marcarAvisosVistos() {
  if (!avisosNaoLidos()) return;
  const agora = new Date().toISOString();
  S.eu.avisos_visto_em = agora;
  const r = await sb.from('jogadores').update({ avisos_visto_em: agora }).eq('id', S.eu.id);
  if (r.error) console.error(r.error);
}
function telaAvisos() {
  const visto = new Date((S.eu && S.eu.avisos_visto_em) || 0);
  return voltar('Avisos', 'Publicados pela coordenação') + `<div class="conteudo">${S.avisos.map((v) => `
    <article class="card" style="padding:0;overflow:hidden">
      ${v.cartaz_url ? `<img src="${esc(v.cartaz_url)}" alt="Cartaz: ${esc(v.titulo)}" style="width:100%;display:block">` : ''}
      <div style="padding:12px 14px;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between"><b style="font-size:11px;letter-spacing:1px;color:var(--roxo)">${esc(v.tipo)}${new Date(v.criado_em) > visto ? ' <span class="tag" style="background:var(--bola);color:var(--noite)">NOVO</span>' : ''}</b><span class="dica">${new Date(v.criado_em).toLocaleDateString('pt-BR')}</span></div>
        <h2 class="cond" style="font-size:20px;line-height:1.15">${esc(v.titulo)}</h2>
        ${v.texto ? `<p style="font-size:14px;line-height:1.45;color:#3D3550;white-space:pre-line">${esc(v.texto)}</p>` : ''}
        ${v.arquivo_url ? `<a class="btn btn-linha" style="height:44px;font-size:14px" href="${esc(v.arquivo_url)}" target="_blank" rel="noopener">📎 Abrir ${esc(v.arquivo_nome || 'arquivo')}</a>` : ''}
        ${S.eu.admin ? `<button class="btn btn-linha" style="height:36px;font-size:12px;color:var(--verm)" data-acao="apagarAviso" data-id="${v.id}">Apagar aviso</button>` : ''}
      </div>
    </article>`).join('') || '<p class="dica">Nenhum aviso ainda.</p>'}</div>`;
}

const PROGRAMACAO = [
  ['2026-01-01', '2026-01-01', '01/01', 'Início do ranking 2026'],
  ['2026-01-30', '2026-01-30', '30/01', 'Pagamento da anuidade 2026'],
  ['2026-03-28', '2026-03-28', '28/03', '8º Torneio de Duplas Portal do Lago'],
  ['2026-09-26', '2026-09-26', '26/09', '9º Torneio de Duplas Portal do Lago'],
  ['2026-10-31', '2026-10-31', '31/10', 'Encerramento do ranking 2026'],
  ['2026-11-01', '2026-11-30', '01/11 a 30/11', 'Fase classificatória do Finals (simples)'],
  ['2026-12-01', '2026-12-04', '01/12 a 04/12', 'Semifinais do Finals — podem ser jogadas antes!'],
  ['2026-12-05', '2026-12-05', '05/12', 'Final do Finals + Festa de encerramento']
];
function telaProgramacao() {
  const hoje = new Date(); let achou = false;
  return voltar('Programação 2026', 'Tênis Portal do Lago') + `<ol class="conteudo" style="list-style:none">${PROGRAMACAO.map(([ini, fim, data, tit]) => {
    const feito = new Date(fim + 'T23:59:59') < hoje, agora = !feito && new Date(ini + 'T00:00:00') <= hoje, prox = !feito && !agora && !achou;
    if (agora || prox) achou = true;
    return `<li class="card" style="display:flex;justify-content:space-between;gap:10px;align-items:center;${agora || prox ? 'border-color:var(--roxo)' : ''}${feito ? ';opacity:.7' : ''}">
      <span><b style="font-size:12px;color:${feito ? 'var(--verde)' : 'var(--roxo)'}">${feito ? '✓ ' : ''}${data}</b><br><span style="font-weight:600">${esc(tit)}</span></span>
      ${agora || prox ? `<span class="tag" style="background:var(--bola);color:var(--noite)">${agora ? 'AGORA' : 'PRÓXIMO'}</span>` : ''}</li>`;
  }).join('')}</ol>`;
}

function telaResumo() {
  const js = S.jogos.filter((g) => g.jogador_b);
  const jogados = js.filter((g) => g.sets);
  const wos = js.filter((g) => g.wo_de);
  const pneus = [];
  jogados.forEach((g) => g.sets.forEach(([x, y]) => {
    if (x === 6 && y === 0) pneus.push([g.jogador_a, g.jogador_b, g.sets]);
    if (x === 0 && y === 6) pneus.push([g.jogador_b, g.jogador_a, g.sets]);
  }));
  const card = (t, n, escuro) => `<div class="card" style="${escuro ? 'background:var(--noite);color:#fff;border:0' : ''}"><small class="dica" style="${escuro ? 'color:rgba(255,255,255,.75)' : ''}">${t}</small><b class="cond" style="display:block;font-size:32px;line-height:1;${escuro ? 'color:var(--bola)' : ''}">${n}</b></div>`;
  return voltar('Resumo do mês', S.mesAtual ? nomeMes(S.mesAtual.id) : '') + `<div class="conteudo">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${card('Jogos disputados', jogados.length)}${card('Pneus (6×0)', pneus.length, true)}
      ${card('Sets disputados', jogados.reduce((s, g) => s + g.sets.length, 0))}${card('Jogos em 3 sets', jogados.filter((g) => g.sets.length === 3).length)}
      ${card('Pendentes', js.length - jogados.length - wos.length)}${card('Standby (+25)', S.jogos.filter((g) => !g.jogador_b).length)}
      ${card('WO por lesão', wos.filter((g) => g.wo_motivo === 'lesao').length)}${card('WO por ausência', wos.filter((g) => g.wo_motivo === 'ausencia').length)}
    </div>
    <h2 class="cond" style="font-size:20px;margin-top:8px">Quem tomou pneu</h2>
    ${pneus.map(([v, p, sets]) => `<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span><b>${esc((porId(v) || {}).nome)}</b> <span class="dica">aplicou em</span> <b>${esc((porId(p) || {}).nome)}</b><br><small class="dica">${esc(placarTxt(sets))}</small></span><span style="display:flex;align-items:center;gap:6px">${PNEU(30)}<span class="tag" style="background:var(--bola);color:var(--noite);font-size:14px">6×0</span></span></div>`).join('') || '<p class="dica">Nenhum pneu ainda neste mês.</p>'}
  </div>`;
}

function telaPrivacidade() {
  return voltar('Política de privacidade', 'Atualizada em 25/10/2026') + `<div class="conteudo">${PRIVACIDADE.map(([t, x]) => `<section class="card"><h2 class="cond" style="font-size:18px;margin-bottom:6px">${esc(t)}</h2><p style="font-size:14px;line-height:1.5;white-space:pre-line">${esc(x)}</p></section>`).join('')}</div>`;
}

function linhaFinals(g, fz) {
  const a = porId(g.jogador_a), b = porId(g.jogador_b), v = g.sets ? (M.resultado(g.sets).aVenceu ? g.jogador_a : g.jogador_b) : null;
  const pode = S.eu.admin || ((g.jogador_a === S.eu.id || g.jogador_b === S.eu.id) && fz.fase === g.fase);
  return `<div class="card" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px">
    <div class="confronto"><div class="p${v === g.jogador_a ? ' v' : ''}">${avatar(a, 30)}<span class="nm"><span>${esc(a && a.nome)}</span>${v === g.jogador_a ? VENCEU : ''}</span></div><span class="vs-mini" aria-label="contra"><span class="vs-txt" aria-hidden="true">VS</span></span>
      <div class="p${v === g.jogador_b ? ' v' : ''}" style="justify-content:flex-end"><span class="nm" style="align-items:flex-end;text-align:right"><span>${esc(b && b.nome)}</span>${v === g.jogador_b ? VENCEU : ''}</span>${avatar(b, 30)}</div></div>
    <div style="display:flex;justify-content:flex-end;font-size:12px;font-weight:600;color:var(--tinta2)">${g.sets ? (pode ? `<a href="#/fplacar/${g.id}">${placarHTML(g.sets)}</a>` : placarHTML(g.sets)) : pode ? `<a href="#/fplacar/${g.id}">Gravar placar</a>` : 'Pendente'}</div>
  </div>`;
}
// colunas lado a lado das duas chaves do Finals
const fzCel = (j, extra = '', ok = false) => `<div class="fz-cel${ok ? ' ok' : ''}">${avatar(j, 28)}<span class="fz-nm">${esc(j ? j.nome : '—')}</span>${extra}</div>`;
const fzCols = (c1, c2) => `<div class="fz-cols"><section class="fz-col" aria-label="Chave 1"><b class="fz-tit">CHAVE 1</b>${c1}</section><section class="fz-col" aria-label="Chave 2"><b class="fz-tit">CHAVE 2</b>${c2}</section></div>`;
const fzSorteio = (a, b, pa, pb) => `<div class="fz-sort"><b>SORTEIO</b><br>${pa}º ${esc(a ? a.nome : '—')}<br>ou ${pb}º ${esc(b ? b.nome : '—')}</div>`;
// colunas de um sorteio (antes de montar): ids na ordem 1º..8º e a chave de cada um
const fzColsSorteio = (vagas) => fzCols(...[1, 2].map((c) => vagas.filter((v) => v.chave === c).map((v) => fzCel(porId(v.id), `<small>${v.seed}º</small>`)).join('')));
const fzProj = (rotA, a, rotB, b) => `<div class="card fz-proj"><span><small>${rotA}</small><b>${esc(a ? a.nome : 'a definir')}</b></span><span class="vs-mini" aria-hidden="true"><span class="vs-txt">VS</span></span><span style="text-align:right"><small>${rotB}</small><b>${esc(b ? b.nome : 'a definir')}</b></span></div>`;

// chaveamento desenhado (semis → final → troféu), no estilo de chave de campeonato
const nomeCurto = (j) => { if (!j) return ''; const n = j.nome.trim().split(/\s+/)[0]; return n.length > 11 ? n.slice(0, 10) + '…' : n; };
// chaves[c] = linhas da chave: { j, txt, pts, ok }; sf[k] = [a, b, jogo, rotA, rotB, projeção]; fin = [f1, f2, final]
function chaveSVG({ chaves, sf, fin, campeao, titulo }) {
  const W = 660, OURO = '#E8B923', VERDE = '#4ADE80';
  const box = (x, y, w, rot, j, ven, proj) => {
    const cor = ven ? OURO : '#fff';
    return `<rect x="${x}" y="${y}" width="${w}" height="40" rx="6" fill="${ven ? 'rgba(232,185,35,.12)' : 'rgba(255,255,255,.04)'}" stroke="${cor}" stroke-width="${ven ? 2.2 : 1.4}"/>
      <text x="${x + w / 2}" y="${y + 13}" text-anchor="middle" font-size="8.5" font-weight="700" letter-spacing=".8" fill="${ven ? OURO : 'rgba(255,255,255,.55)'}">${esc(rot)}</text>
      <text x="${x + w / 2}" y="${y + 31}" text-anchor="middle" font-size="13" font-weight="700" fill="${j ? (proj ? 'rgba(255,255,255,.6)' : cor) : 'rgba(255,255,255,.35)'}"${proj ? ' font-style="italic"' : ''}>${j ? esc(nomeCurto(j)) + (proj ? '?' : '') : 'a definir'}</text>`;
  };
  const placar = (x, y, g) => (g && g.sets ? `<text x="${x}" y="${y}" text-anchor="middle" font-size="9.5" font-weight="600" fill="rgba(255,255,255,.7)">${esc(placarTxt(g.sets))}</text>` : '');
  const linha = (d, ok) => `<path d="${d}" fill="none" stroke="${ok ? OURO : 'rgba(255,255,255,.8)'}" stroke-width="1.5"/>`;
  const cabec = (x, t) => `<text x="${x}" y="52" text-anchor="middle" font-size="9" font-weight="800" letter-spacing="1.6" fill="rgba(255,255,255,.5)">${t}</text>`;
  // colunas: chave 106 · semifinal 88 · finalista 66 · troféu 52 (simétrico)
  const BX = [6, 548], SX = [128, 444], FX = [232, 362], C = 304, BY = 64, Y = [76, 172], YF = 124;
  let o = `<text x="${W / 2}" y="26" text-anchor="middle" font-family="'Barlow Semi Condensed',sans-serif" font-size="22" font-weight="800" letter-spacing="1" fill="${OURO}">${esc(titulo)}</text>`;
  o += cabec(BX[0] + 53, 'FASE DE GRUPOS') + cabec(SX[0] + 44, 'SEMIFINAL 1') + cabec(W / 2, 'FINAL') + cabec(SX[1] + 44, 'SEMIFINAL 2') + cabec(BX[1] + 53, 'FASE DE GRUPOS');
  [0, 1].forEach((k) => {
    // bloco da chave
    const bx = BX[k];
    o += `<rect x="${bx}" y="${BY}" width="106" height="172" rx="8" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.8)" stroke-width="1.4"/>
      <text x="${bx + 53}" y="${BY + 18}" text-anchor="middle" font-family="'Barlow Semi Condensed',sans-serif" font-size="13" font-weight="800" letter-spacing="2" fill="#D8F145">CHAVE ${k + 1}</text>`;
    (chaves[k] || []).forEach((l, i) => {
      const y = BY + 30 + i * 34;
      o += `<rect x="${bx + 5}" y="${y}" width="96" height="30" rx="5" fill="${l.ok ? 'rgba(74,222,128,.14)' : 'transparent'}"/>
        <text x="${bx + 11}" y="${y + 19}" font-size="11.5" font-weight="${l.j ? 700 : 600}" fill="${l.ok ? VERDE : l.j ? '#fff' : 'rgba(255,255,255,.5)'}"${l.j ? '' : ' font-style="italic"'}>${esc(l.j ? nomeCurto(l.j) : l.txt)}</text>
        ${l.pts != null ? `<text x="${bx + 96}" y="${y + 19}" text-anchor="end" font-size="11" font-weight="800" fill="${l.ok ? VERDE : 'rgba(255,255,255,.7)'}">${l.pts}</text>` : ''}`;
    });
    // 1º da chave segue pra semifinal do mesmo lado
    o += linha(k ? `M${bx} ${Y[0] + 20}H${SX[1] + 88}` : `M${bx + 106} ${Y[0] + 20}H${SX[0]}`, false);
    // semifinal
    const [a, b, g, ra, rb, proj] = sf[k], v = g && g.sets ? vencedor(g) : null, sx = SX[k];
    o += box(sx, Y[0], 88, ra, a, v && a && v === a.id, proj) + box(sx, Y[1], 88, rb, b, v && b && v === b.id, proj) + placar(sx + 44, Y[1] + 54, g);
    const ancS = k ? sx : sx + 88, mx = k ? ancS - 8 : ancS + 8, ancF = k ? FX[1] + 66 : FX[0];
    o += linha(`M${ancS} ${Y[0] + 20}H${mx}V${Y[1] + 20}H${ancS}M${mx} ${YF + 20}H${ancF}`, !!v);
    // finalista
    const f = fin[k], fv = fin[2] && fin[2].sets ? vencedor(fin[2]) : null;
    o += box(FX[k], YF, 66, 'FINALISTA', f, fv && f && fv === f.id, false);
    o += linha(k ? `M${FX[1]} ${YF + 20}H${C + 52}` : `M${FX[0] + 66} ${YF + 20}H${C}`, fv && f && fv === f.id);
  });
  o += `<rect x="${C}" y="${YF - 12}" width="52" height="64" rx="8" fill="rgba(232,185,35,.08)" stroke="${OURO}" stroke-width="1.6"/>
    <g transform="translate(${C + 6} ${YF - 6}) scale(.84)">${TROFEU(48).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`;
  o += campeao ? `<text x="${W / 2}" y="${YF + 72}" text-anchor="middle" font-size="9" font-weight="800" letter-spacing="1.5" fill="${OURO}">CAMPEÃO</text><text x="${W / 2}" y="${YF + 88}" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">${esc(nomeCurto(campeao))}</text>` : placar(W / 2, YF + 70, fin[2]);
  return `<div class="chave-svg"><div class="chave-scroll"><svg viewBox="0 0 ${W} 250" width="${W}" height="250" font-family="Inter,system-ui,sans-serif" role="img" aria-label="Chaveamento: ${esc(sf.map((x, k) => 'semifinal ' + (k + 1) + ', ' + (x[0] ? x[0].nome : 'a definir') + ' contra ' + (x[1] ? x[1].nome : 'a definir')).join('; '))}">${o}</svg></div><small class="chave-dica">← arraste pro lado pra ver as chaves →</small></div>`;
}

// lista de torneios: cada um abre a sua tela
function telaTorneios() {
  const ano = anoFinals(), fases = ['A', 'B', 'C'].map((g) => (S.finals.find((x) => x.ano === ano && x.grupo === g) || {}).fase).filter(Boolean);
  const stFin = !fases.length ? 'Os 8 melhores de cada grupo · aguardando o sorteio' : fases.every((f) => f === 'encerrado') ? 'Encerrado · veja os campeões' : 'Em andamento · ' + FASES[fases.find((f) => f !== 'encerrado')];
  const cartao = (href, tit, sub, tag, fundo) => `<a class="card tor" href="${href}">${fundo || ''}<span class="tor-ic">${TROFEU(46)}</span><span class="tor-tx"><b class="cond">${tit}</b><small>${sub}</small>${tag ? `<span class="tag" style="background:var(--bola);color:var(--noite);align-self:flex-start;margin-top:4px">${tag}</span>` : ''}</span><span class="tor-seta" aria-hidden="true">›</span></a>`;
  return voltar('Torneios', 'Portal do Lago Open de Tênis') + `<div class="conteudo">
    ${cartao('#/finals', 'Finals ' + ano, esc(stFin), '')}
    ${cartao('#/duplas', '10º Torneio de Duplas', 'Portal do Lago Open de Tênis', 'EM BREVE', '<img class="tor-logo" src="icones/logo.png" alt="" aria-hidden="true">')}
  </div>`;
}
function telaDuplas() {
  return voltar('10º Torneio de Duplas', 'Portal do Lago Open de Tênis', '#/torneios') + `<div class="conteudo">
    <section class="card" style="position:relative;overflow:hidden;isolation:isolate;background:var(--noite);color:#fff;border:0;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;padding:28px 18px">
      <img src="icones/logo.png" alt="" aria-hidden="true" style="position:absolute;left:50%;top:50%;width:260px;height:260px;transform:translate(-50%,-50%);opacity:.16;z-index:-1;pointer-events:none">
      ${TROFEU(56)}
      <small style="color:var(--bola);font-weight:700;letter-spacing:2px">TORNEIO DE DUPLAS</small>
      <b class="cond" style="font-size:30px;line-height:1.1">10ª edição</b>
      <span style="font-size:15px;color:rgba(255,255,255,.8)">Portal do Lago Open de Tênis</span>
      <span class="tag" style="background:var(--bola);color:var(--noite);margin-top:6px">EM BREVE MAIS INFORMAÇÕES</span>
    </section>
    <p class="dica">Datas, inscrição e regulamento aparecem aqui e no sino de avisos assim que a coordenação divulgar.</p>
  </div>`;
}
function telaFinals() {
  const ano = anoFinals(), aba = S.abaFin || (S.eu.grupo || 'A'), vista = S.vistaFin || 'chave';
  const { fz, vg, js, t, semis, final } = dadosFinals(ano, aba);
  const abas = `<div style="background:#2A1650;padding:0 16px 14px;display:flex;flex-direction:column;gap:8px"><div class="abas" role="tablist" style="grid-template-columns:1fr 1fr 1fr">
    ${['A', 'B', 'C'].map((g) => `<button class="aba" role="tab" aria-selected="${aba === g}" data-acao="abaFin" data-v="${g}">GRUPO ${g}</button>`).join('')}</div>
    <div class="abas" role="tablist" style="grid-template-columns:1fr 1fr">${[['chave', 'CHAVEAMENTO'], ['class', 'CLASSIFICAÇÃO']].map(([v, r]) => `<button class="aba" role="tab" aria-selected="${vista === v}" data-acao="vistaFin" data-v="${v}">${r}</button>`).join('')}</div></div>`;
  const tit = (x) => `<h2 class="cond" style="font-size:20px;margin-top:6px">${x}</h2>`;
  const cab = voltar('Finals ' + ano, 'Grupo ' + aba + ' · ' + (fz ? FASES[fz.fase] : 'aguardando o sorteio'), '#/torneios') + abas;
  const grupo = rankingVivo().filter((j) => j.grupo === aba);

  if (vista === 'class') {
    const noFinals = new Set(fz ? vg.map((v) => v.jogador) : grupo.slice(0, 8).map((j) => j.id));
    return cab + `<div class="conteudo">
      ${grupo.length ? BUSCA('Buscar jogador…') + NADA : ''}
      <span class="dica">${fz ? 'Verde = está no Finals.' : 'Verde = os 8 primeiros, que vão ao Finals se o ranking fechasse agora.'} TP pontos · V vitórias · D derrotas</span>
      ${grupo.map((j, i) => { const ok = noFinals.has(j.id); return `<div class="linha-rk${ok ? ' fin' : ''}" ${dn(j.nome)}><div style="display:flex;align-items:center;gap:10px">
        <b class="cond" style="font-size:20px;width:30px;color:${ok ? 'var(--verde)' : 'var(--roxo)'}">${i + 1}º</b>${avatar(j, 36)}
        <span style="flex-grow:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(j.nome)}</span>
        <span class="dica" style="white-space:nowrap">${j.vi}V ${j.de}D</span><b class="cond" style="font-size:20px;color:var(--roxo);min-width:40px;text-align:right">${j.tp}</b></div></div>
        ${!fz && i === 7 && grupo.length > 8 ? '<div class="corte" aria-hidden="true">LINHA DOS FINALS · 8 VAGAS</div>' : ''}`; }).join('') || '<p class="dica">Nenhum jogador neste grupo.</p>'}
    </div>`;
  }

  if (!fz) {
    const top = grupo.slice(0, 8);
    const sorteios = [2, 4, 6].map((k) => fzSorteio(top[k], top[k + 1], k + 1, k + 2)).join('');
    return cab + `<div class="conteudo">
      <div class="card" style="font-size:13px;line-height:1.45"><b>Sorteio no estilo ATP Finals.</b> O 1º do grupo vai pra Chave 1 e o 2º pra Chave 2. Os pares 3º/4º, 5º/6º e 7º/8º são sorteados: um de cada par pra cada chave. Todos contra todos dentro da chave; os 2 melhores cruzam na semifinal (1º de uma chave x 2º da outra) e os vencedores fazem a final.</div>
      ${tit('Como está agora')}
      ${top.length ? fzCols(fzCel(top[0], '<small>1º</small>') + sorteios, fzCel(top[1], '<small>2º</small>') + sorteios) : '<p class="dica">Nenhum jogador neste grupo.</p>'}
      <span class="dica">Muda conforme o ranking. O sorteio é feito pela coordenação quando o ranking fechar.</span>
      ${tit('Chaveamento')}${chaveSVG({ titulo: 'FINALS ' + ano + ' · GRUPO ' + aba, chaves: [0, 1].map((c) => [{ j: top[c], pts: null }, { txt: 'sorteio 3º/4º' }, { txt: 'sorteio 5º/6º' }, { txt: 'sorteio 7º/8º' }]), sf: [[null, null, null, '1º CHAVE 1', '2º CHAVE 2'], [null, null, null, '1º CHAVE 2', '2º CHAVE 1']], fin: [null, null, null] })}
    </div>`;
  }

  const col = (c) => t[c - 1].map((x, i) => fzCel(porId(x.id), `<small title="${x.vi} vitórias, ${x.j} jogos">${x.tp}</small>`, i < 2)).join('');
  const jogosChave = (c) => js.filter((g) => g.fase === 'grupos' && g.chave === c).map((g) => linhaFinals(g, fz)).join('');
  const ld = (c, k) => (fz.fase === 'grupos' && t[c - 1][k] ? porId(t[c - 1][k].id) : null);
  const sfs = [0, 1].map((k) => { const g = semis[k], rot = k ? ['1º CHAVE 2', '2º CHAVE 1'] : ['1º CHAVE 1', '2º CHAVE 2'];
    return g ? [porId(g.jogador_a), porId(g.jogador_b), g, ...rot] : k ? [ld(2, 0), ld(1, 1), null, ...rot, true] : [ld(1, 0), ld(2, 1), null, ...rot, true]; });
  const sv = semis.map((g) => (g.sets ? porId(vencedor(g)) : null));
  const fins = final ? [porId(final.jogador_a), porId(final.jogador_b), final] : [sv[0] || null, sv[1] || null, null];
  const camp = final && final.sets ? porId(vencedor(final)) : null;
  const desenho = chaveSVG({ titulo: 'FINALS ' + ano + ' · GRUPO ' + aba, chaves: t.map((tc) => tc.map((x, i) => ({ j: porId(x.id), pts: x.tp, ok: i < 2 }))), sf: sfs, fin: fins, campeao: camp });
  const chaveT = tit('Chaveamento') + desenho;
  const mata = (semis.length || final ? tit('Jogos do mata-mata') : '') + (semis.length ? semis.map((g, k) => `<small class="dica">Semifinal ${k + 1}</small>` + linhaFinals(g, fz)).join('')
      : '') + (final ? `<small class="dica">Final</small>` + linhaFinals(final, fz) : '');
  let campeao = '';
  if (fz.fase === 'encerrado' && final && final.sets) { const c = porId(M.resultado(final.sets).aVenceu ? final.jogador_a : final.jogador_b); campeao = `<div class="card" style="background:var(--noite);color:#fff;border:0;text-align:center"><div style="display:flex;justify-content:center">${TROFEU(44)}</div><small style="color:var(--bola);font-weight:700;letter-spacing:2px">CAMPEÃO DO GRUPO ${aba}</small><div class="cond" style="font-size:28px;font-weight:800">${esc(c && c.nome)}</div><small style="color:rgba(255,255,255,.75)">Bônus no ranking: campeão 30 · vice 25 · semifinal 20 · fase de grupos 15</small></div>`; }
  const cols = tit('Fase de grupos') + fzCols(col(1), col(2)) + `<span class="dica">Número = pontos na chave · verde = vai pra semifinal. Jogo sem placar vale 0 pros dois.</span>`;
  const grupos = tit('Jogos da Chave 1') + jogosChave(1) + tit('Jogos da Chave 2') + jogosChave(2);
  return cab + `<div class="conteudo">
    ${campeao}
    ${fz.fase === 'grupos' ? cols + chaveT + grupos : chaveT + mata + cols + grupos}
  </div>`;
}

function telaRegulamento() {
  return voltar('Regulamento', 'Versão 01-2025 · vigência 01/01/2026') + `<div class="conteudo"><div class="card" style="white-space:pre-line;font-size:14px;line-height:1.5">${esc(REGULAMENTO)}</div></div>`;
}

function telaAdmin() {
  if (!S.eu.admin) return voltar('Admin') + '<div class="conteudo"><p class="erro">Área só da coordenação.</p></div>';
  const mes = S.mesAtual;
  const pend = S.jogos.filter((g) => g.jogador_b && !g.sets && !g.wo_de);
  const ativos = S.jogadores.filter((j) => j.ativo && j.joga).sort((a, b) => a.nome.localeCompare(b.nome));
  const opcoes = ativos.map((j) => `<option value="${j.id}">${esc(j.nome)}</option>`).join('');
  const ult = S.meses.map((m) => m.id).sort().pop(), temp = Number(S.config.temporada) || 0;
  const sugestao = mes ? proxMes(mes.id) : ult && temp > Number(ult.slice(0, 4)) ? temp + '-01' : ult ? proxMes(ult) : mesId(new Date());
  const pends = S.jogadores.filter((j) => j.pendente);
  return voltar('Admin', 'Área da coordenação') + `<div class="conteudo">
    ${pends.length ? `<section class="card" style="display:flex;flex-direction:column;gap:10px;border:2px solid var(--roxo)"><b class="cond" style="font-size:20px">Inscrições novas (${pends.length})</b><span class="dica">Defina o grupo e a posição. Ele entra com os pontos de quem estava na posição (regra 5.1).</span>
      ${pends.map((j) => `<form data-form="aprovar" data-id="${j.id}" style="display:flex;flex-direction:column;gap:8px;border-top:1px solid #F0EDF5;padding-top:8px">
        <span><b>${esc(j.nome)}</b>${voltando(j) ? ' <span class="tag" style="background:#E3F0E8;color:var(--verde)">QUER VOLTAR</span>' : ''}<br><small class="dica">${esc(S.emails[j.id] || '')}${j.celular ? ' · ' + esc(j.celular) : ''}</small></span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="rot">Grupo<select class="campo" name="grupo" required><option value="">Escolher…</option><option>A</option><option>B</option><option>C</option></select></label>
        <label class="rot">Posição no geral<input class="campo" name="pos" type="number" min="1" value="${listaGeral().length + 1}"></label></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-linha" type="button" data-acao="recusar" data-id="${j.id}">Recusar</button><button class="btn btn-roxo" type="submit">Aprovar</button></div>
      </form>`).join('')}</section>` : ''}
    <section class="card" style="display:flex;flex-direction:column;gap:10px">
      <b class="cond" style="font-size:20px">${mes ? 'Mês em andamento: ' + nomeMes(mes.id) : 'Nenhum mês aberto'}</b>
      ${mes ? `<span class="dica">${S.jogos.filter((g) => g.sets).length} placares · ${pend.length} pendentes · ${S.jogos.filter((g) => !g.jogador_b).length} standby</span>
        ${S.admin.confirmar ? `<div class="card" style="border:2px solid var(--roxo)"><b>Encerrar ${nomeMes(mes.id)} agora?</b><p class="dica" style="margin:6px 0 10px">Os placares de ${nomeMes(mes.id)} entram nos pontos e ninguém grava mais placar desse mês.</p>
          <label style="display:flex;gap:10px;align-items:center;font-size:14px;font-weight:600;margin-bottom:10px"><input type="checkbox" id="abrirProx" ${mes.id.endsWith('-10') ? '' : 'checked'} style="width:20px;height:20px;accent-color:var(--roxo)">Já abrir ${nomeMes(proxMes(mes.id))} com os novos confrontos</label>
          ${mes.id.endsWith('-10') ? '<p class="dica" style="margin:-4px 0 10px">Outubro é o último mês do ranking; depois vem o Finals (montado aqui embaixo).</p>' : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-linha" data-acao="cancelarRodar">Segurar mês</button><button class="btn btn-roxo" data-acao="rodar">Confirmar</button></div></div>`
        : `<button class="btn btn-roxo" data-acao="pedirRodar">Encerrar ${nomeMes(mes.id)} e calcular os pontos</button><span class="dica">Os jogos de ${nomeMes(mes.id)} estão valendo. Só encerre depois do prazo (último dia do mês): aí os pontos entram no ranking e você pode abrir o próximo mês. Nada encerra sozinho.</span>`}`
      : `<label class="rot">Mês<input class="campo" id="novoMes" type="month" value="${sugestao}"></label><button class="btn btn-roxo" data-acao="abrirMes">Abrir mês e gerar confrontos</button>`}
    </section>
    ${cardReabrir()}
    ${cardTemporada()}
    ${cardBackup()}
    ${pend.length ? `<section class="card" style="display:flex;flex-direction:column;gap:8px"><b class="cond" style="font-size:18px">Ainda sem placar</b>${pend.map((g) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:14px">${esc((porId(g.jogador_a) || {}).nome)} x ${esc((porId(g.jogador_b) || {}).nome)}</span><a class="btn btn-linha" style="height:40px;font-size:12px" href="#/placar/${g.id}">Gravar placar</a></div>`).join('')}</section>` : ''}
    ${mes ? `<form class="card" data-form="addJogo" style="display:flex;flex-direction:column;gap:10px"><b class="cond" style="font-size:18px">Adicionar jogo ao mês</b><span class="dica">Pra quem entrou de última hora ou ficou fora da rodada.</span>
      <label class="rot">Jogador 1<select class="campo" name="a" required><option value="">Escolher…</option>${opcoes}</select></label>
      <label class="rot">Jogador 2<select class="campo" name="b" required><option value="">Escolher…</option>${opcoes}</select></label>
      <button class="btn btn-roxo" type="submit">Adicionar</button></form>` : ''}
    ${adminFinals()}
    <form class="card" data-form="novoJogador" style="display:flex;flex-direction:column;gap:10px"><b class="cond" style="font-size:18px">Cadastrar jogador</b><span class="dica">Regra 5.1: a coordenação define grupo e posição. Ele entra com os pontos de quem estava na posição.</span>
      <label class="rot">Nome<input class="campo" name="nome" required maxlength="40"></label>
      <label class="rot">E-mail (é o login dele)<input class="campo" name="email" type="email" required></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="rot">Grupo<select class="campo" name="grupo"><option>A</option><option>B</option><option>C</option></select></label>
      <label class="rot">Posição no geral<input class="campo" name="pos" type="number" min="1" value="${listaGeral().length + 1}"></label></div>
      <button class="btn btn-roxo" type="submit">Cadastrar</button></form>
    <form class="card" data-form="aviso" style="display:flex;flex-direction:column;gap:10px"><b class="cond" style="font-size:18px">Publicar aviso</b>
      <label class="rot">Tipo<select class="campo" name="tipo"><option>AVISO</option><option>RANKING</option><option>TORNEIO</option><option>CARTAZ</option></select></label>
      <label class="rot">Título<input class="campo" name="titulo" required maxlength="80"></label>
      <label class="rot">Texto<textarea class="campo" name="texto" rows="3"></textarea></label>
      <label class="rot">Cartaz, foto ou arquivo (opcional)<input class="campo" name="arquivo" type="file" accept="image/*,application/pdf" style="padding:10px"></label>
      <span class="dica" style="margin-top:-4px">Foto/cartaz aparece no aviso. PDF vira um botão "Abrir". Até 10 MB.</span>
      <label style="display:flex;gap:10px;align-items:center;font-size:14px;font-weight:600"><input type="checkbox" name="faixa" style="width:20px;height:20px;accent-color:var(--roxo)">Mostrar também na faixa de notícias</label>
      <button class="btn btn-roxo" type="submit">Publicar</button></form>
    <section class="card" style="display:flex;flex-direction:column;gap:8px"><b class="cond" style="font-size:18px">Jogadores (${S.jogadores.length})</b>${BUSCA('Buscar jogador…')}${NADA}
      ${S.jogadores.filter((j) => !j.pendente).sort((a, b) => a.nome.localeCompare(b.nome)).map((j) => `<div ${dn(j.nome, S.emails[j.id])} style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #F0EDF5">
        <span style="flex-grow:1;min-width:0"><b style="font-size:14px">${esc(j.nome)}</b>${j.ativo ? '' : ` <span class="tag" style="background:#FDECEC;color:var(--verm)">FORA DO RANKING</span> <button class="tag" style="background:var(--roxo);color:#fff;border:0" data-acao="reativar" data-id="${j.id}">Voltar ao ranking</button>`}${j.ativo && j.joga ? (j.standby ? ` <span class="tag" style="background:#EFEAF8;color:var(--roxo)">STANDBY</span> <button class="tag" style="background:var(--roxo);color:#fff;border:0" data-acao="standbyAdm" data-v="0" data-id="${j.id}">Tirar do standby</button>` : ` <button class="tag" style="background:#F0EDF5;color:var(--tinta2);border:0" data-acao="standbyAdm" data-v="1" data-id="${j.id}">Pôr em standby</button>`) : ''}<br><small class="dica">${esc(S.emails[j.id] || '')}${j.user_id ? '' : ' · ainda não entrou'}</small></span>
        <select class="campo" style="width:64px;height:40px;padding:0 6px" data-acao="grupo" data-id="${j.id}" aria-label="Grupo de ${esc(j.nome)}">${['A', 'B', 'C'].map((g) => `<option ${g === j.grupo ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <button class="btn btn-linha" style="height:40px;padding:0 8px;font-size:11px" data-acao="resetSenha" data-id="${j.id}" title="Volta a senha para ${SENHA_INICIAL}">Senha</button>
        <button class="switch" role="switch" aria-checked="${j.admin}" data-acao="admin" data-id="${j.id}" aria-label="Admin: ${esc(j.nome)}" ${j.dono ? 'disabled' : ''}><i></i></button>
      </div>`).join('')}
      <span class="dica">Standby vale a partir da próxima rodada; pra jogar ainda neste mês, use "Adicionar jogo ao mês". Chave = admin · "Senha" volta a senha da pessoa para ${SENHA_INICIAL}.</span>
    </section>
  </div>`;
}

// backup: cópia de tudo dentro do banco (automática todo dia e antes das ações grandes) + arquivo pro celular
async function backup(motivo) { const r = await sb.rpc('fazer_backup', { p_motivo: motivo }); if (r.error) throw new Error('Não consegui fazer o backup antes: ' + r.error.message); }
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
function cardBackup() {
  const bs = S.backups || [], auto = bs.find((b) => b.motivo === 'automático');
  return `<section class="card" style="display:flex;flex-direction:column;gap:8px"><b class="cond" style="font-size:18px">Backup</b>
    <span class="dica">O banco guarda sozinho uma cópia de tudo (jogadores, pontos, placares, Finals) todo dia às 3h, e também antes de encerrar mês, reabrir, Finals e temporada nova. Ficam 90 dias de cópias diárias.</span>
    <div style="font-size:13px;line-height:1.6">${auto ? `Último automático: <b>${dataHora(auto.criado_em)}</b><br>` : ''}${bs.length ? `Último de todos: <b>${dataHora(bs[0].criado_em)}</b> (${esc(bs[0].motivo)}) · ${bs.length} guardados` : 'Nenhum backup ainda.'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-linha" data-acao="backupAgora">Fazer backup agora</button><button class="btn btn-roxo" data-acao="backupBaixar" ${bs.length ? '' : 'disabled'}>Baixar arquivo</button></div>
    <span class="dica">O arquivo tem e-mails e datas de nascimento: guarde só com a coordenação (Drive, e-mail próprio).</span>
  </section>`;
}
async function baixarBackup() {
  const { data, error } = await sb.from('backups').select('criado_em,motivo,dados').order('id', { ascending: false }).limit(1).single();
  if (error) throw error;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = 'backup-galera-da-raquete-' + data.criado_em.slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
// nova temporada (ex.: janeiro): pontos zerados, colocações mantidas, 1º começa com N pontos e o último com 1
const proxTemporada = () => { const anos = S.meses.map((m) => Number(m.id.slice(0, 4))); return anos.length ? Math.max(...anos) + 1 : ANO(); };
function cardTemporada() {
  if (S.mesAtual) return '';
  const T = proxTemporada(), feita = Number(S.config.temporada) >= T, ult = S.meses.map((m) => m.id).sort().pop();
  if (feita || (ult && Number(ult.slice(5)) < 10)) return '';
  const lista = listaGeral(), n = lista.length, conf = S.admin.temporada;
  const falta = ['A', 'B', 'C'].filter((g) => (S.finals.find((fz) => fz.ano === T - 1 && fz.grupo === g) || {}).fase !== 'encerrado');
  // só libera depois da final do Finals (5/12)
  if (new Date() < new Date(T - 1, 11, 6)) return `<section class="card" style="display:flex;flex-direction:column;gap:6px"><b class="cond" style="font-size:18px">Temporada ${T}</b><span class="dica">O botão de iniciar a temporada ${T} libera depois da final do Finals, a partir de 06/12/${T - 1}.</span></section>`;
  return `<section class="card" style="display:flex;flex-direction:column;gap:8px;border:2px solid var(--roxo)"><b class="cond" style="font-size:20px">Temporada ${T}</b>
    ${conf ? `<span class="dica">Zera vitórias, derrotas, sets e games de todo mundo e mantém as colocações. Pontos de partida pela posição (${n} tenistas):</span>
      <div style="font-size:13px;line-height:1.6">${lista.slice(0, 3).map((j, i) => `${i + 1}º ${esc(j.nome)} → <b>${n - i} pts</b>`).join('<br>')}${n > 4 ? '<br>…' : ''}${n > 3 ? `<br>${n}º ${esc(lista[n - 1].nome)} → <b>1 pt</b>` : ''}</div>
      ${falta.length ? `<span class="erro" style="font-size:13px">Finals ${T - 1} ainda não encerrado no grupo ${falta.join(', ')}: encerre antes, senão o bônus não entra.</span>` : ''}
      <span class="dica">Uma cópia dos pontos de agora fica guardada no banco.</span>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-linha" data-acao="temporadaCancelar">Voltar</button><button class="btn btn-roxo" data-acao="temporada" data-v="${T}">Confirmar</button></div>`
      : `<button class="btn btn-roxo" data-acao="temporadaPedir">Iniciar temporada ${T}</button><span class="dica">Depois é só abrir janeiro e gerar os confrontos.</span>`}
  </section>`;
}
async function iniciarTemporada(T) {
  await backup('antes da temporada ' + T);
  const lista = listaGeral();
  const copia = lista.map(({ id, nome, tp, vi, de, sp, sc, gp, gc, posicao }) => ({ id, nome, tp, vi, de, sp, sc, gp, gc, posicao }));
  let r = await sb.from('config').delete().eq('chave', 'backup_temporada_' + (T - 1)); if (r.error) throw r.error;
  r = await sb.from('config').insert({ chave: 'backup_temporada_' + (T - 1), valor: copia }); if (r.error) throw r.error;
  await salvarJogadores(M.iniciarTemporada(lista), ['tp', 'vi', 'de', 'sp', 'sc', 'gp', 'gc', 'posicao']);
  r = await sb.from('config').delete().eq('chave', 'temporada'); if (r.error) throw r.error;
  r = await sb.from('config').insert({ chave: 'temporada', valor: T }); if (r.error) throw r.error;
}
// último mês encerrado pode ser reaberto pra corrigir placar esquecido; depois é só encerrar de novo
function cardReabrir() {
  const fech = S.meses.filter((m) => m.status === 'fechado').sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  if (!fech || Number(S.config.temporada) > Number(fech.id.slice(0, 4))) return '';
  const depois = S.meses.filter((m) => m.id > fech.id);
  const travado = depois.some((m) => m.status === 'fechado') || (depois.length && S.jogos.some((g) => depois.some((m) => m.id === g.mes) && (g.sets || g.wo_de)));
  const conf = S.admin.reabrir === fech.id;
  return `<section class="card" style="display:flex;flex-direction:column;gap:8px"><b class="cond" style="font-size:18px">Corrigir ${nomeMes(fech.id)} (já encerrado)</b>
    ${travado ? `<span class="dica">Não dá pra reabrir: ${depois.map((m) => nomeMes(m.id)).join(', ')} já tem placar.</span>`
      : conf ? `<span class="dica">Tira de todo mundo os pontos que ${nomeMes(fech.id)} somou e volta o mês pra "em andamento". Você corrige o placar em Jogos do ranking e depois encerra de novo.${depois.length ? ` <b>${nomeMes(depois[0].id)} (sem placar ainda) será apagado</b> e os confrontos saem de novo quando você abrir.` : ''}</span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-linha" data-acao="reabrirCancelar">Voltar</button><button class="btn btn-roxo" data-acao="reabrir" data-v="${fech.id}">Confirmar</button></div>`
      : `<button class="btn btn-linha" data-acao="reabrirPedir" data-v="${fech.id}">Reabrir ${nomeMes(fech.id)} pra corrigir placar</button><span class="dica">Pra quando alguém esqueceu de gravar ou gravou errado depois de encerrado.</span>`}
  </section>`;
}
async function reabrirMes(id) {
  await backup('antes de reabrir ' + nomeMes(id));
  const jogos = await jogosDoMes(id, true);
  const standby = jogos.filter((g) => !g.jogador_b).map((g) => g.jogador_a);
  const validos = jogos.filter((g) => g.jogador_b && (g.wo_de ? g.wo_status !== 'anulado' : g.sets)).map((g) => ({ a: g.jogador_a, b: g.jogador_b, sets: g.sets, woDe: g.wo_de }));
  const nova = M.desfazerMes(listaGeral(), validos, standby).map((j, i) => ({ ...j, posicao: i + 1 }));
  for (const m of S.meses.filter((x) => x.id > id)) {
    let r = await sb.from('jogos').delete().eq('mes', m.id); if (r.error) throw r.error;
    r = await sb.from('meses').delete().eq('id', m.id); if (r.error) throw r.error;
  }
  await salvarJogadores(nova, ['tp', 'vi', 'de', 'sp', 'sc', 'gp', 'gc', 'posicao']);
  const r = await sb.from('meses').update({ status: 'aberto', fechado_em: null }).eq('id', id); if (r.error) throw r.error;
  S.jogosPorMes = {};
}
function adminFinals() {
  const ano = ANO();
  return `<section class="card" style="display:flex;flex-direction:column;gap:12px"><b class="cond" style="font-size:20px">Finals ${ano}</b>
    ${['A', 'B', 'C'].map((gr) => {
      const { fz, js, semis, final } = dadosFinals(ano, gr);
      const cab = `<b style="font-size:15px">Grupo ${gr}</b>`;
      if (!fz) {
        const lista = listaGeral().filter((j) => j.grupo === gr);
        const marc = S.admin.fin[gr] || lista.slice(0, 8).map((j) => j.id);
        return `<div style="display:flex;flex-direction:column;gap:6px;border-top:1px solid #F0EDF5;padding-top:8px">${cab}
          <span class="dica">Marcados vão ao Finals (${marc.length} de 8). Se um classificado não puder, desmarque e marque o próximo.</span>
          ${lista.slice(0, 14).map((j, i) => `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" data-fin="${gr}" value="${j.id}" ${marc.includes(j.id) ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--roxo)">${i + 1}º ${esc(j.nome)}</label>`).join('')}
          ${S.admin.sorteio[gr] ? `<b style="font-size:14px;margin-top:4px">Resultado do sorteio</b>${fzColsSorteio(S.admin.sorteio[gr])}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-linha" data-acao="finSortear" data-v="${gr}">Sortear de novo</button><button class="btn btn-roxo" data-acao="finMontar" data-v="${gr}">Confirmar e montar</button></div>`
          : `<button class="btn btn-roxo" data-acao="finSortear" data-v="${gr}" ${marc.length === 8 ? '' : 'disabled'}>Sortear as chaves do Grupo ${gr}</button><span class="dica">1º na Chave 1, 2º na Chave 2; 3º/4º, 5º/6º e 7º/8º sorteados (estilo ATP Finals). Você vê o resultado antes de confirmar.</span>`}</div>`;
      }
      const feitos = js.filter((g) => g.fase === 'grupos' && g.sets).length, total = js.filter((g) => g.fase === 'grupos').length;
      const conf = S.admin.finConf === gr;
      const botao = fz.fase === 'grupos' ? `<span class="dica">${feitos} de ${total} placares. Jogo sem placar conta 0 pros dois.</span><button class="btn btn-roxo" data-acao="finSemi" data-v="${gr}">Fechar grupos e gerar semifinais</button>${feitos ? '' : `<button class="btn btn-linha" data-acao="finApagar" data-v="${gr}">Apagar e montar de novo</button>`}`
        : fz.fase === 'semi' ? `<button class="btn btn-roxo" data-acao="finFinal" data-v="${gr}" ${semis.every((g) => g.sets) ? '' : 'disabled'}>Gerar a final</button>${semis.every((g) => g.sets) ? '' : '<span class="dica">Falta placar de semifinal.</span>'}`
        : fz.fase === 'final' ? (conf ? `<span class="dica">Lança no ranking: campeão +30 · vice +25 · semifinal +20 · fase de grupos +15, e reordena as posições.</span><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-linha" data-acao="finCancelar">Voltar</button><button class="btn btn-roxo" data-acao="finEncerrar" data-v="${gr}">Confirmar</button></div>`
          : `<button class="btn btn-roxo" data-acao="finPedir" data-v="${gr}" ${final && final.sets ? '' : 'disabled'}>Encerrar e lançar bônus no ranking</button>${final && final.sets ? '' : '<span class="dica">Falta o placar da final.</span>'}`)
        : '<span class="dica">Encerrado. Bônus lançado no ranking.</span>';
      return `<div style="display:flex;flex-direction:column;gap:6px;border-top:1px solid #F0EDF5;padding-top:8px">${cab}<span class="tag" style="align-self:flex-start;background:#EFEAF8;color:var(--roxo)">${FASES[fz.fase].toUpperCase()}</span>${botao}<a href="#/finals" data-acao="abaFin" data-v="${gr}" class="dica">Ver jogos e placares</a></div>`;
    }).join('')}</section>`;
}

// ---------- ações ----------
async function salvarJogadores(lista, campos) {
  // atualiza em lotes pequenos pra não estourar o limite de chamadas
  for (let i = 0; i < lista.length; i += 10) {
    const lote = lista.slice(i, i + 10);
    const rs = await Promise.all(lote.map((j) => sb.from('jogadores').update(Object.fromEntries(campos.map((c) => [c, j[c]]))).eq('id', j.id)));
    const e = rs.find((r) => r.error); if (e) throw e.error;
  }
}
async function gerarConfrontos(mesNovo) {
  const ativos = listaGeral().filter((j) => !j.standby);
  const c = M.confrontos(ativos);
  const linhas = c.pares.map(([a, b]) => ({ mes: mesNovo, jogador_a: a, jogador_b: b, traz_bola: b }));
  if (c.standby) linhas.push({ mes: mesNovo, jogador_a: c.standby, jogador_b: null });
  if (linhas.length) { const { error } = await sb.from('jogos').insert(linhas); if (error) throw error; }
}
async function abrirMes(id) {
  if (!/^\d{4}-\d{2}$/.test(id)) throw new Error('Mês inválido.');
  if (S.meses.some((m) => m.id === id)) throw new Error('Esse mês já existe.');
  const { error } = await sb.from('meses').insert({ id }); if (error) throw error;
  await gerarConfrontos(id);
}
async function rodarMes(abrirProx = true) {
  const mes = S.mesAtual;
  await backup('antes de encerrar ' + nomeMes(mes.id));
  const jogos = await jogosDoMes(mes.id, true);
  const lista = listaGeral();
  const standby = jogos.filter((g) => !g.jogador_b).map((g) => g.jogador_a);
  // WO confirmado ou sem resposta do adversário entra pela regra 2.6; contestado fica 0 pros dois (2.7)
  const validos = jogos.filter((g) => g.jogador_b && (g.wo_de ? g.wo_status !== 'anulado' : g.sets)).map((g) => ({ a: g.jogador_a, b: g.jogador_b, sets: g.sets, woDe: g.wo_de }));
  // 7.4: último confronto direto entre os empatados, olhando todos os meses
  const { data: hist, error: eh } = await sb.from('jogos').select('mes,jogador_a,jogador_b,sets,wo_de,wo_status,criado_em').order('mes').order('criado_em');
  if (eh) throw eh;
  const h2h = M.confrontoDireto(hist.filter((g) => g.jogador_b && (g.wo_de ? g.wo_status !== 'anulado' : g.sets)).map((g) => ({ a: g.jogador_a, b: g.jogador_b, sets: g.sets, woDe: g.wo_de })));
  const nova = M.rodarMes(lista, validos, standby, h2h).map((j, i) => ({ ...j, posicao: i + 1 }));
  await salvarJogadores(nova, ['tp', 'vi', 'de', 'sp', 'sc', 'gp', 'gc', 'posicao']);
  const r = await sb.from('meses').update({ status: 'fechado', fechado_em: new Date().toISOString() }).eq('id', mes.id);
  if (r.error) throw r.error;
  await carregar();
  if (abrirProx) await abrirMes(proxMes(mes.id));
}
async function finMontar(gr) {
  const ano = ANO(), ids = idsFinals(gr);
  const ch = S.admin.sorteio[gr];
  if (!ch || ch.map((v) => v.id).join() !== ids.join()) throw new Error('Faça o sorteio de novo: a lista mudou.');
  let r = await sb.from('finals').insert({ ano, grupo: gr, fase: 'grupos' }); if (r.error) throw r.error;
  r = await sb.from('finals_vagas').insert(ch.map((v) => ({ ano, grupo: gr, seed: v.seed, chave: v.chave, jogador: v.id }))); if (r.error) throw r.error;
  const jogos = [1, 2].flatMap((c) => M.todosContraTodos(ch.filter((v) => v.chave === c).map((v) => v.id)).map(([a, b]) => ({ ano, grupo: gr, fase: 'grupos', chave: c, jogador_a: a, jogador_b: b })));
  r = await sb.from('finals_jogos').insert(jogos); if (r.error) throw r.error;
  delete S.admin.fin[gr]; delete S.admin.sorteio[gr];
}
function idsFinals(gr) {
  const ordem = listaGeral().map((j) => j.id);
  return (S.admin.fin[gr] || listaGeral().filter((j) => j.grupo === gr).slice(0, 8).map((j) => j.id)).slice().sort((x, y) => ordem.indexOf(x) - ordem.indexOf(y));
}
async function finAvancar(gr, fase) {
  const ano = ANO(), { t, semis } = dadosFinals(ano, gr);
  let novos;
  if (fase === 'semi') novos = M.semifinais(t[0], t[1]).map(([a, b]) => ({ ano, grupo: gr, fase: 'semi', jogador_a: a, jogador_b: b }));
  else { const [w1, w2] = semis.map((g) => M.vencedorDe(pg(g))); novos = [{ ano, grupo: gr, fase: 'final', jogador_a: w1, jogador_b: w2 }]; }
  let r = await sb.from('finals_jogos').insert(novos); if (r.error) throw r.error;
  r = await sb.from('finals').update({ fase }).eq('ano', ano).eq('grupo', gr); if (r.error) throw r.error;
}
async function finEncerrar(gr) {
  await backup('antes de encerrar o Finals ' + gr);
  const ano = ANO(), { vg, semis, final } = dadosFinals(ano, gr);
  const bonus = M.bonusFinals(vg.map((v) => v.jogador), semis.map(pg), pg(final));
  // regra 7.2.5: bônus somado ao ranking; 7.2.4: classificação final só depois do Finals
  const nova = M.ordenar(listaGeral().map((j) => ({ ...j, tp: j.tp + (bonus[j.id] || 0) }))).map((j, i) => ({ ...j, posicao: i + 1 }));
  await salvarJogadores(nova, ['tp', 'posicao']);
  const r = await sb.from('finals').update({ fase: 'encerrado' }).eq('ano', ano).eq('grupo', gr); if (r.error) throw r.error;
}
async function finApagar(gr) {
  await backup('antes de apagar o Finals ' + gr);
  const ano = ANO();
  for (const t of ['finals_jogos', 'finals_vagas', 'finals']) { const r = await sb.from(t).delete().eq('ano', ano).eq('grupo', gr); if (r.error) throw r.error; }
}
async function aprovar(f) {
  const j = porId(f.dataset.id); if (!j) return;
  if (!f.grupo.value) throw new Error('Escolha o grupo.');
  let r = await sb.from('jogadores').update({ grupo: f.grupo.value, pendente: false, ativo: true }).eq('id', j.id); if (r.error) throw r.error;
  const nova = M.inserir(listaGeral(), { ...j, grupo: f.grupo.value }, Number(f.pos.value) || 9999).map((x, i) => ({ ...x, posicao: i + 1 }));
  await salvarJogadores(nova, ['tp', 'posicao']);
}
async function cadastrarJogador(f) {
  const email = f.email.value.trim().toLowerCase(), nome = f.nome.value.trim();
  if (Object.values(S.emails).some((e) => String(e).toLowerCase() === email)) throw new Error('Esse e-mail já está cadastrado.');
  const { data, error } = await sb.from('jogadores').insert({ email, nome, grupo: f.grupo.value }).select(COLS).single();
  if (error) throw error;
  const nova = M.inserir(listaGeral(), { ...data }, Number(f.pos.value) || 9999).map((j, i) => ({ ...j, posicao: i + 1 }));
  await salvarJogadores(nova, ['tp', 'posicao']);
}

const ACOES = {
  abertura: () => abertura(true),
  embreve: () => toast('Em breve no app.'),
  abaRk: (el) => { S.abaRk = el.dataset.v; render(); },
  vistaFin: (el) => { S.vistaFin = el.dataset.v; render(); },
  abaFin: (el) => { S.abaFin = el.dataset.v; if (location.hash !== '#/finals') location.hash = '#/finals'; else render(); },
  curtir: async (el) => {
    const id = el.dataset.id, lista = S.curtidas[id] = S.curtidas[id] || [], tinha = lista.includes(S.eu.id);
    if (tinha) lista.splice(lista.indexOf(S.eu.id), 1); else lista.push(S.eu.id);
    render();
    const r = tinha ? await sb.from('curtidas').delete().eq('jogo', id).eq('jogador', S.eu.id) : await sb.from('curtidas').insert({ jogo: id, jogador: S.eu.id });
    if (r.error) { if (tinha) lista.push(S.eu.id); else lista.splice(lista.indexOf(S.eu.id), 1); render(); toast('Não deu pra curtir agora.'); }
  },
  backupAgora: () => comTrava('Fazendo backup…', () => backup('manual'), 'Backup feito.'),
  backupBaixar: () => comTrava('Preparando o arquivo…', baixarBackup, 'Arquivo baixado.'),
  temporadaPedir: () => { S.admin.temporada = true; render(); },
  temporadaCancelar: () => { S.admin.temporada = false; render(); },
  temporada: (el) => comTrava('Iniciando a temporada…', async () => { S.admin.temporada = false; await iniciarTemporada(Number(el.dataset.v)); }, 'Temporada ' + el.dataset.v + ' iniciada: pontos de partida lançados.'),
  reabrirPedir: (el) => { S.admin.reabrir = el.dataset.v; render(); },
  reabrirCancelar: () => { S.admin.reabrir = null; render(); },
  reabrir: (el) => comTrava('Reabrindo…', async () => { S.admin.reabrir = null; await reabrirMes(el.dataset.v); }, 'Mês reaberto: corrija o placar e encerre de novo.'),
  finSortear: (el) => { try { S.admin.sorteio[el.dataset.v] = M.sortearChaves(idsFinals(el.dataset.v)); render(); } catch (e) { toast(e.message); } },
  finMontar: (el) => comTrava('Montando…', () => finMontar(el.dataset.v), 'Finals montado: chaves e jogos criados.'),
  finSemi: (el) => comTrava('', () => finAvancar(el.dataset.v, 'semi'), 'Semifinais geradas.'),
  finFinal: (el) => comTrava('', () => finAvancar(el.dataset.v, 'final'), 'Final gerada.'),
  finPedir: (el) => { S.admin.finConf = el.dataset.v; render(); },
  finCancelar: () => { S.admin.finConf = null; render(); },
  finEncerrar: (el) => comTrava('Lançando bônus…', async () => { S.admin.finConf = null; await finEncerrar(el.dataset.v); }, 'Finals encerrado e bônus no ranking.'),
  finApagar: (el) => comTrava('', () => finApagar(el.dataset.v), 'Finals apagado.'),
  resetSenha: (el) => comTrava('', async () => { const r = await sb.rpc('admin_resetar_senha', { p_jogador: el.dataset.id }); if (r.error) throw r.error; }, 'Senha voltou para ' + SENHA_INICIAL + '.'),
  // volta com os pontos que tinha, no fim da fila; a coordenação ajusta a posição se precisar (regra 8.2)
  reativar: (el) => comTrava('', async () => {
    const r = await sb.from('jogadores').update({ ativo: true, standby: false, posicao: listaGeral().length + 1 }).eq('id', el.dataset.id); if (r.error) throw r.error;
  }, 'Jogador de volta ao ranking.'),
  standbyAdm: (el) => comTrava('', async () => {
    const r = await sb.from('jogadores').update({ standby: el.dataset.v === '1' }).eq('id', el.dataset.id); if (r.error) throw r.error;
  }, el.dataset.v === '1' ? 'Jogador em standby.' : 'Jogador fora do standby: entra nos jogos da próxima rodada.'),
  // apaga o placar (o jogo volta a ficar pendente); pede um segundo toque pra confirmar
  cancelarPlacar: (el) => {
    if (el.dataset.ok !== '1') { el.dataset.ok = '1'; el.textContent = 'Toque de novo para apagar o placar'; el.style.background = '#FDECEC'; return; }
    const fin = el.dataset.tabela === 'finals_jogos';
    comTrava('', async () => {
      const r = await sb.from(el.dataset.tabela).update(fin ? { sets: null } : { sets: null, wo_de: null }).eq('id', el.dataset.id); if (r.error) throw r.error;
      location.hash = fin ? '#/finals' : '#/';
    }, 'Placar cancelado. O jogo voltou a ficar pendente.');
  },
  apagarAviso: (el) => comTrava('', async () => { const r = await sb.from('avisos').delete().eq('id', el.dataset.id); if (r.error) throw r.error; }, 'Aviso apagado.'),
  // quem já jogou e pediu pra voltar não é apagado: só volta a ficar fora
  recusar: (el) => comTrava('', async () => { const j = porId(el.dataset.id) || {}; const r = voltando(j) ? await sb.from('jogadores').update({ pendente: false }).eq('id', j.id) : await sb.from('jogadores').delete().eq('id', el.dataset.id); if (r.error) throw r.error; }, 'Pedido recusado.'),
  pedirVolta: () => comTrava('', async () => { const r = await sb.rpc('pedir_volta'); if (r.error) throw r.error; }, ''),
  atualizar: () => comTrava('', async () => {}, ''),
  mesVer: (el) => { const m = S.meses[Number(el.dataset.v)]; if (m) { S.mesVer = m.id; render(); } },
  alterna: (el) => { el.setAttribute('aria-checked', el.getAttribute('aria-checked') !== 'true'); },
  sair: async () => { try { localStorage.removeItem(CACHE); } catch (e) { /* ok */ } await sb.auth.signOut(); location.hash = ''; location.reload(); },
  pedirRodar: () => { S.admin.confirmar = true; render(); },
  cancelarRodar: () => { S.admin.confirmar = false; render(); },
  rodar: () => { const abrir = !!(document.getElementById('abrirProx') || {}).checked; comTrava('Encerrando o mês…', async () => { S.admin.confirmar = false; await rodarMes(abrir); }, abrir ? 'Mês encerrado e próximo aberto.' : 'Mês encerrado.'); },
  abrirMes: () => comTrava('Abrindo…', () => abrirMes(document.getElementById('novoMes').value), 'Mês aberto com os confrontos.'),
  desfazerWo: (el) => comTrava('', async () => { const r = await sb.from('jogos').update({ wo_de: null }).eq('id', el.dataset.id); if (r.error) throw r.error; location.hash = '#/'; }, 'WO desfeito.'),
  woResp: (el) => comTrava('', async () => { const r = await sb.from('jogos').update({ wo_status: el.dataset.v }).eq('id', el.dataset.id); if (r.error) throw r.error; location.hash = '#/'; },
    el.dataset.v === 'anulado' ? 'WO contestado: 0 pontos pros dois.' : 'WO aceito.'),
  admin: (el) => comTrava('', async () => { const r = await sb.from('jogadores').update({ admin: el.getAttribute('aria-checked') !== 'true' }).eq('id', el.dataset.id); if (r.error) throw r.error; }, 'Admin atualizado.')
};
async function comTrava(espera, fn, ok) {
  if (espera) toast(espera);
  try { await fn(); await carregar(); render(); if (ok) toast(ok); } catch (e) { console.error(e); toast('Erro: ' + (e.message || e)); }
}

const FORMS = {
  placar: async (f) => {
    const { sets, r, erro } = lerSets(f); const msg = document.getElementById('placar-msg');
    if (erro) { msg.className = 'erro'; msg.textContent = erro; return; }
    const fin = f.dataset.tabela === 'finals_jogos';
    const { error } = await sb.from(f.dataset.tabela).update(fin ? { sets } : { sets, wo_de: null }).eq('id', f.dataset.id);
    if (error) { msg.className = 'erro'; msg.textContent = error.message; return; }
    const g = S.jogos.concat(S.fjogos).find((x) => x.id === f.dataset.id) || {};
    const ven = r.aVenceu ? g.jogador_a : g.jogador_b;
    await carregar();
    if (ven === S.eu.id) fogos();
    toast('Placar gravado. O adversário já vê no app.');
    location.hash = fin ? '#/finals' : '#/';
  },
  perfil: async (f) => {
    const sw = (k) => f.querySelector(`[data-v="${k}"]`).getAttribute('aria-checked') === 'true';
    const { error } = await sb.from('jogadores').update({ nome: f.nome.value.trim(), celular: f.celular.value.trim() || null, nascimento: f.nascimento.value || null, standby: sw('standby') }).eq('id', S.eu.id);
    const msg = document.getElementById('perfil-msg');
    if (error) { msg.className = 'erro'; msg.textContent = error.message; return; }
    await carregar(); render(); toast('Perfil salvo.');
  },
  addJogo: (f) => comTrava('', async () => {
    if (!f.a.value || !f.b.value || f.a.value === f.b.value) throw new Error('Escolha dois jogadores diferentes.');
    const novo = { mes: S.mesAtual.id, jogador_a: f.a.value, jogador_b: f.b.value, adicionado_admin: true };
    novo.traz_bola = trazBola(novo);
    const { error } = await sb.from('jogos').insert(novo);
    if (error) throw error;
  }, 'Jogo adicionado.'),
  wo: async (f) => {
    const g = S.jogos.find((x) => x.id === f.dataset.id); const msg = document.getElementById('wo-msg');
    if (!g) return;
    const [quem, motivo] = f.tipo.value.split('-'), obs = f.obs.value.trim();
    const de = quem === 'eu' ? S.eu.id : quem === 'ele' ? (g.jogador_a === S.eu.id ? g.jogador_b : g.jogador_a) : quem === 'a' ? g.jogador_a : g.jogador_b;
    if (quem === 'ele' && !obs) { msg.className = 'erro'; msg.textContent = 'Explique o que aconteceu (regra 2.5).'; return; }
    // o banco confirma: WO próprio vale na hora; WO do adversário espera ele aceitar ou contestar
    const status = S.eu.admin || de === S.eu.id ? 'confirmado' : 'aguardando';
    const { error } = await sb.from('jogos').update({ wo_de: de, wo_motivo: motivo, wo_obs: obs || null, wo_status: status, wo_por: S.eu.id, sets: null }).eq('id', g.id);
    if (error) { msg.className = 'erro'; msg.textContent = error.message; return; }
    await carregar(); toast(status === 'aguardando' ? 'WO enviado. Seu adversário vai aceitar ou contestar.' : 'WO registrado.'); location.hash = '#/';
  },
  senha: async (f) => {
    const msg = document.getElementById('senha-msg');
    if (f.senha.value !== f.senha2.value) { msg.className = 'erro'; msg.textContent = 'As duas senhas não são iguais.'; return; }
    if (f.senha.value === SENHA_INICIAL) { msg.className = 'erro'; msg.textContent = 'Escolha uma senha diferente de ' + SENHA_INICIAL + '.'; return; }
    const { error } = await sb.auth.updateUser({ password: f.senha.value });
    if (error) { msg.className = 'erro'; msg.textContent = error.message; return; }
    await sb.from('jogadores').update({ senha_trocada: true }).eq('id', S.eu.id);
    await carregar(); toast('Senha trocada.'); location.hash = '#/'; render();
  },
  aprovar: (f) => comTrava('Aprovando…', () => aprovar(f), 'Jogador aprovado. Já entra no ranking.'),
  novoJogador: (f) => comTrava('Cadastrando…', () => cadastrarJogador(f), 'Jogador cadastrado. Ele entra com esse e-mail.'),
  aviso: (f) => comTrava('Publicando…', async () => {
    const arq = f.arquivo.files[0];
    const aviso = { tipo: f.tipo.value, titulo: f.titulo.value.trim(), texto: f.texto.value.trim() || null, na_faixa: f.faixa.checked, criado_por: S.uid };
    if (arq) {
      if (arq.size > 10 * 1024 * 1024) throw new Error('Arquivo maior que 10 MB.');
      const imagem = /^image\//.test(arq.type);
      const corpo = imagem ? await prepararImagem(arq, 1600, false) : arq;
      const caminho = `${Date.now()}-${imagem ? 'cartaz.jpg' : arq.name.replace(/[^\w.-]+/g, '_')}`;
      const up = await sb.storage.from('avisos').upload(caminho, corpo, { contentType: imagem ? 'image/jpeg' : arq.type || 'application/octet-stream' });
      if (up.error) throw up.error;
      const url = sb.storage.from('avisos').getPublicUrl(caminho).data.publicUrl;
      if (imagem) aviso.cartaz_url = url; else { aviso.arquivo_url = url; aviso.arquivo_nome = arq.name; }
    }
    const { error } = await sb.from('avisos').insert(aviso);
    if (error) throw error;
    f.reset();
  }, 'Aviso publicado.')
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-acao]');
  if (!el || el.tagName === 'SELECT' || !ACOES[el.dataset.acao]) return;
  ev.preventDefault();
  if (!sb && el.dataset.acao !== 'abertura') { toast('Só um instante, carregando…'); return; }
  ACOES[el.dataset.acao](el);
});
document.addEventListener('click', (ev) => {
  const av = ev.target.closest && ev.target.closest('.avatar[data-ver]');
  if (av && !av.closest('label, a, button, .zoom')) abrirFoto(av.dataset.ver);
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset && el.dataset.fin) { delete S.admin.sorteio[el.dataset.fin]; S.admin.fin[el.dataset.fin] = [...document.querySelectorAll(`[data-fin="${el.dataset.fin}"]:checked`)].map((x) => x.value); render(); return; }
  if (el.dataset && el.dataset.acao === 'grupo') comTrava('', async () => { const r = await sb.from('jogadores').update({ grupo: el.value }).eq('id', el.dataset.id); if (r.error) throw r.error; }, 'Grupo atualizado.');
});
// foto do perfil: corta quadrada, reduz pra 480px e envia pro Storage (pasta do próprio usuário)
async function prepararImagem(file, max, quadrada) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Não consegui abrir essa imagem.')); i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight;
    const sw = quadrada ? Math.min(W, H) : W, sh = quadrada ? Math.min(W, H) : H;
    const k = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}
const prepararFoto = (file) => prepararImagem(file, 480, true);
async function trocarFoto(file) {
  if (!file) return;
  toast('Enviando foto…');
  try {
    const blob = await prepararFoto(file);
    const caminho = `${S.uid}/foto-${Date.now()}.jpg`;
    const up = await sb.storage.from('fotos').upload(caminho, blob, { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    const foto = sb.storage.from('fotos').getPublicUrl(caminho).data.publicUrl;
    const r = await sb.from('jogadores').update({ foto_url: foto }).eq('id', S.eu.id);
    if (r.error) throw r.error;
    await carregar(); render(); toast('Foto atualizada.');
  } catch (e) { console.error(e); toast('Erro na foto: ' + (e.message || e)); }
}
document.addEventListener('change', (ev) => { if (ev.target.matches && ev.target.matches('input[data-foto]')) trocarFoto(ev.target.files[0]); });
document.addEventListener('input', (ev) => { if (ev.target.matches('[data-busca]')) { S.busca[telaAtual()] = ev.target.value; aplicarBusca(); } });
document.addEventListener('input', (ev) => { const f = ev.target.closest('form[data-form="placar"]'); if (f) previaPlacar(f); });
document.addEventListener('submit', async (ev) => {
  const f = ev.target.closest('form[data-form]'); if (!f) return;
  ev.preventDefault();
  const b = f.querySelector('[type=submit]'); if (b) b.disabled = true;
  try { await FORMS[f.dataset.form](f); } finally { if (b && b.isConnected) b.disabled = false; }
});

// ---------- efeitos ----------
function abertura(forcar) {
  try { if (!forcar && sessionStorage.getItem('abertura')) return; sessionStorage.setItem('abertura', '1'); } catch (e) { /* sem storage: mostra mesmo */ }
  let sem = 7; const rnd = () => (sem = (sem * 16807) % 2147483647) / 2147483647;
  const el = document.createElement('div'); el.className = 'intro'; el.setAttribute('aria-hidden', 'true');
  const bolas = Array.from({ length: 26 }, (_, i) => ({ x: Math.round(rnd() * 92), y: Math.round(10 + rnd() * 80), dur: 1.1 + rnd() * 0.6, ini: i * 0.06 + rnd() * 0.3, t: Math.round(14 + rnd() * 18) }));
  el.innerHTML = bolas.map((b) => `<span class="intro-bola" style="left:${b.x}%;top:${b.y}%;animation-duration:${b.dur.toFixed(2)}s;animation-delay:${b.ini.toFixed(2)}s">${BOLA(b.t)}</span>`).join('')
    + `<div class="intro-logo"><img src="icones/logo.png" alt=""></div><div class="intro-txt"><b class="cond" style="font-size:13px;letter-spacing:4px;color:var(--bola)">PORTAL DO LAGO</b><div class="cond" style="font-size:30px;font-weight:800">Open de Tênis</div></div>`;
  document.body.appendChild(el);
  somQuique(el);
  setTimeout(() => el.classList.add('sai'), 2800);
  setTimeout(() => el.remove(), 3600);
}
// som de uma bolinha quicando, feito na hora (sem arquivo). O navegador só libera som depois de um toque:
// se ainda estiver bloqueado, toca no primeiro toque durante a abertura (ou ao tocar no logo pra rever).
function somQuique(intro) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  let ctx; try { ctx = new AC(); } catch (e) { return; }
  // uma bolinha só, quicando devagar junto com o logo: batida grave e abafada, cada quique mais fraco
  const ruido = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate);
  const d = ruido.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
  const saida = ctx.createBiquadFilter(); saida.type = 'lowpass'; saida.frequency.value = 3200; saida.connect(ctx.destination);
  const pok = (t, vol) => {
    // corpo oco da bola, agudo o bastante pra sair no alto-falante do celular
    [[420, 300, 1, 0.12], [900, 700, 0.35, 0.04]].forEach(([f1, f2, k, dur]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * k, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(saida); o.start(t); o.stop(t + dur + 0.02);
    });
    const n = ctx.createBufferSource(), gn = ctx.createGain();          // toque do feltro na quadra
    n.buffer = ruido; gn.gain.value = vol * 0.5; n.connect(gn).connect(saida); n.start(t);
  };
  const tocar = () => {
    if (!intro.isConnected || intro.classList.contains('sai')) return ctx.close();
    const t0 = ctx.currentTime + 0.02;
    // 4 quiques lentos, nos mesmos tempos do logo (35%, 60%, 78% e 92% dos 2,4 s da animação)
    [[0.35, 0.5], [0.6, 0.34], [0.78, 0.22], [0.92, 0.12]].forEach(([p, v]) => pok(t0 + 2.4 * p, v));
    setTimeout(() => ctx.close(), 4000);
  };
  let foi = false; const uma = () => { if (!foi && ctx.state === 'running') { foi = true; tocar(); } };
  if (ctx.state === 'running') return uma();
  ctx.onstatechange = uma;
  const libera = () => { document.removeEventListener('pointerdown', libera, true); ctx.resume().catch(() => {}); };
  document.addEventListener('pointerdown', libera, true);
  ctx.resume().catch(() => {});
  setTimeout(() => { document.removeEventListener('pointerdown', libera, true); if (!foi && ctx.state !== 'closed') ctx.close(); }, 2800);
}
function fogos() {
  const cores = ['#D8F145', '#FF6B6B', '#4FC3F7', '#FFD54F', '#B388FF'];
  const pos = [[20, 20], [78, 25], [50, 35], [28, 60], [72, 68]];
  const el = document.createElement('div'); el.className = 'fogos'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = pos.map(([x, y], i) => `<div class="b" style="left:${x}%;top:${y}%">${Array.from({ length: 12 }, (_, k) => `<span class="r" style="transform:rotate(${k * 30}deg)"><span class="p" style="background:${cores[i]};animation-delay:${i * 0.25}s"></span></span>`).join('')}</div>`).join('');
  const v = document.createElement('div'); v.className = 'vitoria'; v.setAttribute('role', 'status'); v.innerHTML = '<span>VITÓRIA!</span>';
  document.body.append(el, v);
  setTimeout(() => { el.remove(); v.remove(); }, 3500);
}

// ---------- roteamento ----------
let timerCarrossel = null;
let hashAnterior = null;
async function render() {
  if (!S.eu) return;
  if (S.eu.pendente) { document.body.classList.remove('noite'); $app.innerHTML = telaEspera(); return; }
  if (S.eu.admin && !S.eu.senha_trocada) { document.body.classList.remove('noite'); $app.innerHTML = telaSenha(true); return; }
  document.body.classList.toggle('noite', ehNoite());
  const h = location.hash.replace(/^#\/?/, '');
  const [rota, arg] = h.split('/');
  clearInterval(timerCarrossel);
  let html;
  try {
    html = rota === 'ranking' ? telaRanking()
      : rota === 'jogos' ? await telaJogos()
      : rota === 'placar' ? await telaPlacar(arg)
      : rota === 'fplacar' ? await telaPlacar(arg, true)
      : rota === 'torneios' ? telaTorneios()
      : rota === 'duplas' ? telaDuplas()
      : rota === 'finals' ? telaFinals()
      : rota === 'wo' ? await telaWo(arg)
      : rota === 'privacidade' ? telaPrivacidade()
      : rota === 'senha' ? telaSenha(false)
      : rota === 'perfil' ? telaPerfil()
      : rota === 'avisos' ? telaAvisos()
      : rota === 'programacao' ? telaProgramacao()
      : rota === 'resumo' ? telaResumo()
      : rota === 'regulamento' ? telaRegulamento()
      : rota === 'admin' ? telaAdmin()
      : telaInicio();
  } catch (e) { console.error(e); html = voltar('Ops') + `<div class="conteudo"><p class="erro">Não consegui carregar: ${esc(e.message || e)}</p></div>`; }
  $app.innerHTML = html;
  if (rota === 'avisos') marcarAvisosVistos();
  if (!rota) { renderCarrossel(); timerCarrossel = setInterval(() => { S.slide++; renderCarrossel(); }, 5000); }
  const f = document.querySelector('form[data-form="placar"]'); if (f) previaPlacar(f);
  aplicarBusca();
  document.querySelectorAll('.chave-scroll').forEach((el) => { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; });
  // só volta pro topo quando muda de tela (curtir, placar ao vivo etc. mantêm onde a pessoa está)
  if (location.hash !== hashAnterior) window.scrollTo(0, 0);
  hashAnterior = location.hash;
}

function telaEspera() {
  return `<header class="topo" style="padding-bottom:28px"><img src="icones/logo.png" alt="Galera da Raquete Portal do Lago" style="width:120px;height:120px;margin-top:12px"><h1 class="titulo">Portal do Lago Open de Tênis</h1><p class="sub-ranking">RANKING</p></header>
  <div class="conteudo" style="max-width:420px;width:100%;margin:0 auto;text-align:center">
    <b class="cond" style="font-size:26px">${voltando(S.eu) ? 'Pedido de volta enviado!' : 'Inscrição enviada!'}</b>
    <p style="line-height:1.5">Oi, <b>${esc(S.eu.nome)}</b>! A coordenação vai definir seu grupo (A, B ou C) e sua posição no ranking. Quando liberar, o app abre normal. Você continua conectado.</p>
    <button class="btn btn-roxo" data-acao="atualizar">Atualizar</button>
    <a class="btn btn-linha" href="${esc(zap(S.config.fale_conosco || '5519997781210', 'Olá! Fiz minha inscrição no app do ranking: ' + S.eu.nome))}" target="_blank" rel="noopener">Falar com a coordenação</a>
    <button class="btn btn-linha" data-acao="sair">Sair da conta</button>
  </div>`;
}
function telaInscricao(email, erro) {
  $app.innerHTML = `<header class="topo" style="padding-bottom:28px"><img src="icones/logo.png" alt="Galera da Raquete Portal do Lago" style="width:120px;height:120px;margin-top:12px"><h1 class="titulo">Portal do Lago Open de Tênis</h1><p class="sub-ranking">INSCRIÇÃO</p></header>
  <form class="conteudo" style="max-width:420px;width:100%;margin:0 auto">
    <p class="dica">Acesso criado para <b>${esc(email)}</b>. Agora seus dados pra entrar no ranking. A coordenação define seu grupo e posição.</p>
    <label class="rot">Nome no ranking<input class="campo" name="nome" required maxlength="40" autocomplete="name"></label>
    <label class="rot">Celular (WhatsApp)<input class="campo" name="celular" type="tel" inputmode="tel" placeholder="(19) 9____-____" autocomplete="tel"></label>
    <label class="rot">Nascimento (opcional)<input class="campo" name="nascimento" type="date"></label>
    <button class="btn btn-roxo" type="submit">Enviar inscrição</button>
    <button class="btn btn-linha" type="button" data-outro>Sair</button>
    <button class="btn btn-linha" type="button" data-priv style="height:40px;font-size:13px">Política de privacidade</button>
    ${erro ? `<p class="erro" role="alert">${esc(erro)}</p>` : ''}
  </form>`;
  const f = $app.querySelector('form');
  f.querySelector('[data-outro]').onclick = async () => { await sb.auth.signOut(); telaLogin('entrar'); };
  f.querySelector('[data-priv]').onclick = () => { $app.innerHTML = telaPrivacidade().replace('href="#/"', 'href="#/" data-sai-priv'); $app.querySelector('[data-sai-priv]').onclick = (e) => { e.preventDefault(); telaInscricao(email); }; window.scrollTo(0, 0); };
  f.onsubmit = async (ev) => {
    ev.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true;
    const { error } = await sb.rpc('cadastrar_me', { p_nome: f.nome.value.trim(), p_celular: f.celular.value.trim(), p_nascimento: f.nascimento.value || null });
    if (error) return telaInscricao(email, error.message);
    await entrar();
  };
}

// ---------- login por e-mail e senha ----------
const SENHA_INICIAL = '123456';
function telaLogin(etapa, email, erro) {
  document.body.classList.remove('noite');
  const novo = etapa === 'inscrever';
  $app.innerHTML = `
  <header class="topo" style="padding-bottom:28px"><img src="icones/logo.png" alt="Galera da Raquete Portal do Lago" style="width:120px;height:120px;margin-top:12px"><h1 class="titulo">Portal do Lago Open de Tênis</h1><p class="sub-ranking">${novo ? 'INSCRIÇÃO' : 'RANKING'}</p></header>
  <form class="conteudo" style="max-width:420px;width:100%;margin:0 auto">
    ${novo ? '<p class="dica">Ainda não está no ranking? Crie seu acesso. Depois a coordenação define seu grupo e posição.</p>' : ''}
    <label class="rot">E-mail<input class="campo" name="email" type="email" autocomplete="email" required value="${esc(email || '')}"></label>
    <label class="rot">${novo ? 'Crie uma senha (mínimo 6)' : 'Senha'}<input class="campo" name="senha" type="password" autocomplete="${novo ? 'new-password' : 'current-password'}" minlength="6" required></label>
    ${novo ? '<label class="rot">Repita a senha<input class="campo" name="senha2" type="password" autocomplete="new-password" minlength="6" required></label>' : ''}
    <button class="btn btn-roxo" type="submit">${novo ? 'Criar acesso' : 'Entrar'}</button>
    ${novo ? '<button class="btn btn-linha" type="button" data-ir="entrar">Já tenho acesso</button>'
      : `<p class="dica">Já está no ranking? A senha inicial é <b>${SENHA_INICIAL}</b>; troque em Meu perfil quando quiser. Você fica conectado.</p>
      <button class="btn btn-linha" type="button" data-ir="inscrever">Primeira vez? Fazer inscrição</button>
      <a class="btn btn-linha" style="height:40px;font-size:13px" href="${esc(zap('5519997781210', 'Olá! Esqueci minha senha do app do ranking.'))}" target="_blank" rel="noopener">Esqueci a senha</a>`}
    <button class="btn btn-linha" type="button" data-priv style="height:40px;font-size:13px">Política de privacidade</button>
    ${erro ? `<p class="erro" role="alert">${esc(erro)}</p>` : ''}
  </form>`;
  const f = $app.querySelector('form');
  f.querySelector('[data-ir]').onclick = (e) => telaLogin(e.currentTarget.dataset.ir, f.email.value);
  f.querySelector('[data-priv]').onclick = () => { $app.innerHTML = telaPrivacidade().replace('href="#/"', 'href="#/" data-sai-priv'); $app.querySelector('[data-sai-priv]').onclick = (e) => { e.preventDefault(); telaLogin(etapa, email); }; window.scrollTo(0, 0); };
  f.onsubmit = async (ev) => {
    ev.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true;
    const em = f.email.value.trim().toLowerCase(), senha = f.senha.value;
    try {
      if (novo) {
        if (senha !== f.senha2.value) throw new Error('As duas senhas não são iguais.');
        const { error } = await sb.auth.signUp({ email: em, password: senha });
        if (error) throw new Error(/registered|already/i.test(error.message) ? 'Esse e-mail já tem acesso. Entre com ele (senha inicial ' + SENHA_INICIAL + ').' : error.message);
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: em, password: senha });
        if (error) throw new Error(/invalid/i.test(error.message) ? 'E-mail ou senha errados. Se você ainda não está no ranking, faça a inscrição.' : error.message);
      }
      await entrar();
    } catch (e) { telaLogin(etapa, em, e.message || String(e)); }
  };
}
function telaSenha(obrigatorio) {
  return (obrigatorio ? `<header class="topo" style="padding-bottom:20px"><h1 class="titulo" style="margin-top:20px">Troque sua senha</h1><p class="sub-ranking">ADMIN</p></header>` : voltar('Trocar senha')) + `
  <form class="conteudo" data-form="senha" style="max-width:420px;width:100%;margin:0 auto">
    ${obrigatorio ? '<p class="dica">Você é da coordenação. Com a senha inicial, qualquer um que souber seu e-mail entraria como admin. Escolha uma senha sua.</p>' : ''}
    <label class="rot">Nova senha (mínimo 6)<input class="campo" name="senha" type="password" autocomplete="new-password" minlength="6" required></label>
    <label class="rot">Repita a nova senha<input class="campo" name="senha2" type="password" autocomplete="new-password" minlength="6" required></label>
    <button class="btn btn-roxo" type="submit">Salvar senha</button>
    <p id="senha-msg" role="status"></p>
    ${obrigatorio ? '<button class="btn btn-linha" type="button" data-acao="sair">Sair da conta</button>' : ''}
  </form>`;
}

async function entrar() {
  const { data: { session } } = await sb.auth.getSession();
  const user = session && session.user;
  S.uid = user && user.id;
  const { data: jid, error } = await sb.rpc('vincular_conta');
  if (error) throw error;
  if (!jid) return telaInscricao(user && user.email);  // tem acesso mas ainda não preencheu a inscrição
  await carregar();
  if (!S.mesVer && S.meses[0]) S.mesVer = S.meses[0].id;
  window.onhashchange = render;
  sb.channel('mudancas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jogos' }, recarregarDepois)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos' }, recarregarDepois)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finals_jogos' }, recarregarDepois)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'curtidas' }, recarregarDepois)
    .subscribe();
  render();
}

async function iniciar() {
  abertura(false);
  // abre na hora com a cópia do último acesso (se for o mesmo usuário); os dados novos chegam logo depois
  const c = lerCache();
  if (c) { Object.assign(S, c); if (!S.mesVer && S.meses[0]) S.mesVer = S.meses[0].id; window.onhashchange = render; render(); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!window.__SB__ && SUPABASE_URL.startsWith('COLE')) {
    $app.innerHTML = '<div class="conteudo" style="padding-top:60px"><b class="cond" style="font-size:22px">Falta configurar o banco</b><p class="dica">Preencha o config.js com a URL e a chave anon do Supabase.</p></div>';
    return;
  }
  // window.__SB__ = cliente falso usado só nos testes automáticos
  sb = window.__SB__ || (await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm')).createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return telaLogin('entrar');
  try { await entrar(); } catch (e) { console.error(e); telaLogin('entrar', '', 'Erro ao entrar: ' + (e.message || e)); }
}
iniciar();

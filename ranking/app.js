// Galera da Raquete · Ranking — app (PWA) ligado ao Supabase
import * as M from './motor.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { REGULAMENTO } from './regulamento.js';
import { PRIVACIDADE } from './privacidade.js';

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
  eu: null, jogadores: [], meses: [], mesAtual: null, jogos: [], avisos: [], patros: [], config: {},
  jogosPorMes: {}, slide: 0, abaRk: 'D', mesVer: null, msg: '', erro: '', admin: { confirmar: false }
};

// ---------- utilidades de tela ----------
function toast(t) {
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t;
  document.body.appendChild(el); setTimeout(() => el.remove(), 3200);
}
const avatar = (j, tam) => `<span class="avatar" style="width:${tam}px;height:${tam}px;font-size:${Math.round(tam * 0.38)}px">${j && j.foto_url ? `<img src="${esc(j.foto_url)}" alt="">` : esc(iniciais(j && j.nome))}</span>`;
const voltar = (titulo, sub) => `<header class="cab"><div class="cab-linha"><a class="ic-btn" href="#/" aria-label="Voltar"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></a><div><h1>${esc(titulo)}</h1>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div></header>`;
const BOLA = (t, cor = '#D8F145') => `<svg width="${t}" height="${t}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9.2" fill="${cor}" stroke="#B5CF22" stroke-width=".8"/><path d="M3.2 4.2c3.6 1.6 5.4 3.6 5.4 5.8s-1.8 4.2-5.4 5.8M16.8 4.2c-3.6 1.6-5.4 3.6-5.4 5.8s1.8 4.2 5.4 5.8" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>`;

// ---------- dados ----------
const porId = (id) => S.jogadores.find((j) => j.id === id);
// ranking geral (Dynamics): quem joga e está ativo, pela posição definida na última rodada
function listaGeral() {
  return S.jogadores.filter((j) => j.ativo && j.joga)
    .sort((a, b) => (a.posicao ?? 9999) - (b.posicao ?? 9999) || b.tp - a.tp || a.nome.localeCompare(b.nome));
}
function posicoes() {
  const geral = {}, grupo = {};
  listaGeral().forEach((j, i) => { geral[j.id] = i + 1; });
  ['A', 'B', 'C'].forEach((g) => listaGeral().filter((j) => j.grupo === g).forEach((j, i) => { grupo[j.id] = i + 1; }));
  return { geral, grupo };
}
async function jogosDoMes(id, forcar) {
  if (!id) return [];
  if (!forcar && S.jogosPorMes[id]) return S.jogosPorMes[id];
  const { data, error } = await sb.from('jogos').select('*').eq('mes', id).order('criado_em');
  if (error) throw error;
  S.jogosPorMes[id] = data; return data;
}
// e-mail e nascimento não vêm na lista (privacidade): só pelas funções meus_dados / admin_emails
const COLS = 'id,user_id,nome,grupo,celular,mostrar_niver,standby,foto_url,admin,dono,ativo,joga,tp,vi,de,sp,sc,gp,gc,posicao,criado_em';
async function rpcLista(nome) { const { data, error } = await sb.rpc(nome); if (error) throw error; return data || []; }
async function carregar() {
  const [jg, ms, av, pt, cf] = await Promise.all([
    sb.from('jogadores').select(COLS),
    sb.from('meses').select('*').order('id', { ascending: false }),
    sb.from('avisos').select('*').order('criado_em', { ascending: false }).limit(40),
    sb.from('patrocinadores').select('*').order('ordem'),
    sb.from('config').select('*')
  ]);
  for (const r of [jg, ms, av, pt, cf]) if (r.error) throw r.error;
  S.jogadores = jg.data; S.meses = ms.data; S.avisos = av.data; S.patros = pt.data;
  S.config = Object.fromEntries(cf.data.map((c) => [c.chave, c.valor]));
  S.mesAtual = S.meses.find((m) => m.status === 'aberto') || null;
  S.jogosPorMes = {};
  S.jogos = S.mesAtual ? await jogosDoMes(S.mesAtual.id) : [];
  S.eu = S.jogadores.find((j) => j.user_id === S.uid) || null;
  if (!S.eu) return;
  const [meus, niver, emails] = await Promise.all([rpcLista('meus_dados'), rpcLista('aniversariantes_hoje'), S.eu.admin ? rpcLista('admin_emails') : []]);
  Object.assign(S.eu, meus[0] || {});
  S.niver = niver;
  S.emails = Object.fromEntries(emails.map((e) => [e.id, e.email]));
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
  const meu = eu && S.jogos.find((g) => g.jogador_a === eu.id || g.jogador_b === eu.id);
  const p = prazo();
  let corpo;
  if (!eu.joga) {
    corpo = `<div class="resultado"><div style="flex-grow:1"><b class="cond" style="font-size:18px">Conta da coordenação</b><div class="dica">Você não entra no ranking. Use o Admin pelo botão ☰.</div></div></div>`;
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
    const sub = meu.wo_de ? 'WO · ' + (meu.wo_status === 'aguardando' ? 'AGUARDANDO' : meu.wo_status === 'anulado' ? 'CONTESTADO' : v === eu.id ? 'VITÓRIA' : 'DERROTA') : meu.sets ? (v === eu.id ? 'VITÓRIA' : 'DERROTA') + ' · ' + placarTxt(meu.sets) : (trazBola(meu) === eu.id ? 'VOCÊ TRAZ AS BOLAS' : 'ELE TRAZ AS BOLAS');
    vs = `<div class="vs">
      <div class="lado">${avatar(eu, 62)}<b>${esc(eu.nome)}${BOLINHA(eu.id, meu)}</b><small style="font-size:11px;color:var(--bola)">${geral[eu.id] || '–'}º lugar</small></div>
      <div class="lado"><span class="vs-txt" aria-hidden="true">VS</span><small style="font-size:10px;letter-spacing:1px;color:rgba(255,255,255,.6)">${esc(sub)}</small></div>
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
        <div class="dica">${esc(venci ? FRASES_V[k] : FRASES_D[k])}</div></div>
        <a class="btn btn-linha" href="#/placar/${meu.id}" style="height:44px;padding:0 12px;font-size:13px">Corrigir</a></div>`;
    }
  }
  const avisoNovo = S.avisos[0] && (Date.now() - new Date(S.avisos[0].criado_em)) < 7 * 864e5;
  return `
  <header class="topo">
    <div class="topo-linha">
      ${eu.admin ? `<a class="ic-btn" href="#/admin" aria-label="Admin"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></a>` : '<span style="width:44px"></span>'}
      <button class="logo-btn" data-acao="abertura" aria-label="Ver a abertura de novo"><img src="icones/logo.png" alt="Galera da Raquete Portal do Lago"></button>
      <a class="ic-btn" href="#/avisos" aria-label="Avisos da coordenação"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>${avisoNovo ? '<span class="ponto"></span>' : ''}</a>
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
  { nome: 'Torneios', ic: IC('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" fill="currentColor" fill-opacity=".2"/><path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3"/>') },
  { nome: 'Regulamento', href: () => '#/regulamento', ic: IC('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z" fill="currentColor" fill-opacity=".14"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M8.5 10.5l2 2 4-4.5"/>') }
];

function faixa() {
  const itens = [];
  (S.niver || []).forEach((j) => itens.push(['ANIVERSARIANTE DO DIA', 'Parabéns, ' + j.nome + '!']));
  const { geral } = posicoes();
  const lider = listaGeral()[0];
  const jl = lider && S.jogos.find((g) => g.sets && (g.jogador_a === lider.id || g.jogador_b === lider.id));
  if (jl && vencedor(jl) === lider.id) itens.push(['LÍDER VENCEU', lider.nome + ' venceu o jogo do mês']);
  S.jogos.filter((g) => g.jogador_b && Math.max(geral[g.jogador_a] || 99, geral[g.jogador_b] || 99) <= 6)
    .forEach((g) => itens.push(['JOGÃO DO MÊS', (porId(g.jogador_a) || {}).nome + ' x ' + (porId(g.jogador_b) || {}).nome + (g.sets ? ' · ' + placarTxt(g.sets) : '')]));
  if (!itens.length) itens.push(['GALERA DA RAQUETE', 'Portal do Lago Open de Tênis']);
  return itens.map(([t, x]) => `<span><b>${esc(t)}</b>${esc(x)}</span>`).join('');
}

function slides() {
  const lista = S.patros.map((p) => ({ tipo: 'p', ...p }));
  const tops = ['A', 'B', 'C', 'D'].map((g) => ({ tipo: 't', g, js: (g === 'D' ? listaGeral() : listaGeral().filter((j) => j.grupo === g)).slice(0, 4) })).filter((t) => t.js.length);
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
  const lista = geral ? listaGeral() : listaGeral().filter((j) => j.grupo === aba);
  return voltar('Ranking', geral ? 'Dynamics · todos juntos, jogos pelo geral' : 'Grupo ' + aba + ' · 8 primeiros vão ao Finals') + `
  <div style="background:#2A1650;padding:0 16px 14px"><div class="abas" role="tablist" style="grid-template-columns:1.4fr 1fr 1fr 1fr">
    ${[['D', 'DYNAMICS'], ['A', 'A'], ['B', 'B'], ['C', 'C']].map(([id, r]) => `<button class="aba" role="tab" aria-selected="${aba === id}" data-acao="abaRk" data-v="${id}">${r}</button>`).join('')}
  </div></div>
  <div class="conteudo">
    <span class="dica">${geral ? '' : 'Faixa verde = top 8, vão ao Finals · '}TP pontos · VI vitórias · SP sets pró · DE derrotas · SG saldo de games</span>
    ${lista.map((j, i) => { const fin = !geral && i < 8, sg = j.gp - j.gc; return `
      <div class="linha-rk${fin ? ' fin' : ''}">
        <div style="display:flex;align-items:center;gap:10px">
          <b class="cond" style="font-size:20px;width:30px;color:${fin ? 'var(--verde)' : 'var(--roxo)'}">${i + 1}º</b>${avatar(j, 40)}
          <div style="min-width:0;flex-grow:1"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(j.nome)}${j.id === S.eu.id ? ' <span class="tag" style="background:#EFEAF8;color:var(--roxo)">VOCÊ</span>' : ''}${j.standby ? ' <span class="tag" style="background:#5B5470;color:#fff">STANDBY</span>' : ''}</div><small class="dica">Grupo ${esc(j.grupo)}</small></div>
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
  const pode = (g) => S.eu.admin || (mes.status === 'aberto' && (g.jogador_a === S.eu.id || g.jogador_b === S.eu.id));
  return voltar('Jogos do ranking', 'Pelo geral (Dynamics) · bolinha ao lado do nome = traz as bolinhas') + `
  <div style="background:#2A1650;padding:0 16px 14px;display:flex;align-items:center;justify-content:space-between;color:#fff">
    <button class="ic-btn" data-acao="mesVer" data-v="${idx + 1}" ${idx >= S.meses.length - 1 ? 'disabled style="opacity:.3"' : ''} aria-label="Mês anterior">‹</button>
    <div style="text-align:center"><b class="cond" style="font-size:22px">${mes ? nomeMes(mes.id) : '—'}</b><br><small style="color:var(--bola);font-weight:600">${mes ? (mes.status === 'aberto' ? 'MÊS ATUAL' : 'ENCERRADO') : ''}</small></div>
    <button class="ic-btn" data-acao="mesVer" data-v="${idx - 1}" ${idx <= 0 ? 'disabled style="opacity:.3"' : ''} aria-label="Próximo mês">›</button>
  </div>
  <div class="conteudo">
    ${jogos.map((g) => { const a = porId(g.jogador_a), b = porId(g.jogador_b), v = vencedor(g); return `
      <div class="card" style="padding:12px;display:flex;flex-direction:column;gap:10px">
        ${b ? `<div class="confronto">
          <div class="p${v === g.jogador_a ? ' v' : ''}">${avatar(a, 34)}<span>${geral[g.jogador_a] ? geral[g.jogador_a] + 'º ' : ''}${esc(a && a.nome)}${BOLINHA(g.jogador_a, g)}</span></div>
          <b class="cond" style="font-style:italic;color:var(--roxo)">VS</b>
          <div class="p${v === g.jogador_b ? ' v' : ''}" style="justify-content:flex-end"><span>${BOLINHA(g.jogador_b, g)}${esc(b.nome)}${geral[g.jogador_b] ? ' ' + geral[g.jogador_b] + 'º' : ''}</span>${avatar(b, 34)}</div>
        </div>` : `<div style="display:flex;align-items:center;gap:8px">${avatar(a, 34)}<span>${esc(a && a.nome)}</span></div>`}
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #F0EDF5;padding-top:8px;font-size:12px">
          ${!b ? '<span class="tag" style="background:#EFEAF8;color:var(--roxo)">STANDBY +25</span>' : g.wo_de ? `<span class="tag" style="background:#FDECEC;color:var(--verm)">WO · ${g.wo_motivo === 'lesao' ? 'LESÃO' : 'AUSÊNCIA'}${g.wo_status === 'aguardando' ? ' · AGUARDANDO' : g.wo_status === 'anulado' ? ' · CONTESTADO' : ''}</span>` : g.sets ? '<span class="tag" style="background:#E3F0E8;color:var(--verde)">JOGADO</span>' : '<span class="tag" style="background:#FFF3E8;color:#7A3E0A">PENDENTE</span>'}
          <span style="font-weight:600;color:var(--tinta2)">${g.wo_de ? (pode(g) ? `<a href="#/wo/${g.id}">de ${esc((porId(g.wo_de) || {}).nome)}</a>` : `de ${esc((porId(g.wo_de) || {}).nome)}`) : g.sets ? esc(placarTxt(g.sets)) : b && pode(g) ? `<a href="#/placar/${g.id}">Gravar placar</a>` : ''}</span>
        </div>
      </div>`; }).join('') || '<p class="dica">Nenhum jogo neste mês.</p>'}
  </div>`;
}

async function telaPlacar(id) {
  let g = S.jogos.find((x) => x.id === id);
  if (!g) { const r = await sb.from('jogos').select('*').eq('id', id).maybeSingle(); g = r.data; }
  if (!g || !g.jogador_b) return voltar('Gravar placar') + '<div class="conteudo"><p class="erro">Jogo não encontrado.</p></div>';
  const a = porId(g.jogador_a), b = porId(g.jogador_b);
  const mes = S.meses.find((m) => m.id === g.mes);
  const participa = g.jogador_a === S.eu.id || g.jogador_b === S.eu.id;
  const p = prazo();
  const fechado = !S.eu.admin && (!mes || mes.status !== 'aberto' || (p && p.dias === 'Prazo encerrado'));
  if (!participa && !S.eu.admin) return voltar('Gravar placar') + '<div class="conteudo"><p class="erro">Você só grava o placar do seu jogo.</p></div>';
  const sets = (g.sets || []).concat([[], [], []]).slice(0, 3);
  return voltar('Gravar placar', nomeMes(g.mes)) + `
  <form class="conteudo" data-form="placar" data-id="${g.id}">
    <div class="card" style="font-size:13px;line-height:1.4;background:${fechado ? '#FDECEC' : '#EFEAF8'};color:${fechado ? 'var(--verm)' : 'var(--roxo2)'};border:0">${fechado ? 'Prazo encerrado. Agora só a coordenação pode alterar este placar.' : 'Pode gravar e corrigir até ' + (p ? p.texto : 'o fim do mês') + '. Cada correção fica registrada.'}</div>
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="set"><span></span><b style="text-align:center;font-size:13px">${esc(a.nome)}</b><b style="text-align:center;font-size:13px">${esc(b.nome)}</b></div>
      ${sets.map((s, i) => { const tb = i === 2, rot = tb ? 'Tie-break' : (i + 1) + 'º set', mx = tb ? 30 : 7; return `<div class="set"><span class="dica" style="font-weight:${tb ? 800 : 600};${tb ? 'color:var(--verm)' : ''}">${rot}</span>
        <input class="campo" name="a${i}" type="number" inputmode="numeric" min="0" max="${mx}" value="${s[0] ?? ''}" aria-label="${rot}, ${tb ? 'pontos' : 'games'} de ${esc(a.nome)}" ${fechado ? 'disabled' : ''}>
        <input class="campo" name="b${i}" type="number" inputmode="numeric" min="0" max="${mx}" value="${s[1] ?? ''}" aria-label="${rot}, ${tb ? 'pontos' : 'games'} de ${esc(b.nome)}" ${fechado ? 'disabled' : ''}></div>`; }).join('')}
      <span class="dica"><b style="color:var(--verm)">Tie-break</b> só se der 1×1 nos sets (ex.: 10/8). Pontos: 2×0 = 25/5 · 2×1 = 20/10.</span>
    </div>
    <div id="previa" class="card" style="background:var(--noite);color:#fff;border:0"></div>
    ${fechado ? '' : '<button class="btn btn-roxo" type="submit">Gravar placar</button>'}
    <p id="placar-msg" role="status"></p>
  </form>`;
}
function lerSets(form) {
  const sets = [];
  for (let i = 0; i < 3; i++) {
    const x = form['a' + i].value, y = form['b' + i].value;
    if (x === '' && y === '') continue;
    if (x === '' || y === '') return { erro: 'Preencha os dois lados do ' + (i + 1) + 'º set.' };
    sets.push([Number(x), Number(y)]);
  }
  try { return { sets, r: M.resultado(sets) }; } catch (e) { return { sets, erro: 'Placar incompleto ou inválido.' }; }
}
function previaPlacar(form) {
  const el = document.getElementById('previa'); if (!el) return;
  const g = S.jogos.find((x) => x.id === form.dataset.id) || {};
  const { r, erro } = lerSets(form);
  if (erro || !r) { el.innerHTML = '<b class="cond" style="font-size:20px">Resultado: incompleto</b>'; return; }
  const ven = porId(r.aVenceu ? g.jogador_a : g.jogador_b);
  const pneu = form && [0, 1, 2].some((i) => { const x = form['a' + i].value, y = form['b' + i].value; return (x === '6' && y === '0') || (x === '0' && y === '6'); });
  el.innerHTML = `<b class="cond" style="font-size:20px">${esc(ven ? ven.nome : '')} venceu ${r.setsA > r.setsB ? r.setsA + '×' + r.setsB : r.setsB + '×' + r.setsA}</b><div style="font-size:13px;color:var(--bola)">+${Math.max(r.ptsA, r.ptsB)} / +${Math.min(r.ptsA, r.ptsB)} pts${pneu ? ' · PNEU 6×0' : ''}</div>`;
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
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px">${avatar(e, 96)}<span class="dica">Grupo ${esc(e.grupo)}${e.admin ? ' · Admin' : ''}</span></div>
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
    <button class="btn btn-linha" type="button" data-acao="sair">Sair da conta</button>
  </form>`;
}

function telaAvisos() {
  return voltar('Avisos', 'Publicados pela coordenação') + `<div class="conteudo">${S.avisos.map((v) => `
    <article class="card" style="padding:0;overflow:hidden">
      ${v.cartaz_url ? `<img src="${esc(v.cartaz_url)}" alt="Cartaz: ${esc(v.titulo)}" style="width:100%;display:block">` : ''}
      <div style="padding:12px 14px;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between"><b style="font-size:11px;letter-spacing:1px;color:var(--roxo)">${esc(v.tipo)}</b><span class="dica">${new Date(v.criado_em).toLocaleDateString('pt-BR')}</span></div>
        <h2 class="cond" style="font-size:20px;line-height:1.15">${esc(v.titulo)}</h2>
        ${v.texto ? `<p style="font-size:14px;line-height:1.45;color:#3D3550;white-space:pre-line">${esc(v.texto)}</p>` : ''}
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
    ${pneus.map(([v, p, sets]) => `<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span><b>${esc((porId(v) || {}).nome)}</b> <span class="dica">aplicou em</span> <b>${esc((porId(p) || {}).nome)}</b><br><small class="dica">${esc(placarTxt(sets))}</small></span><span class="tag" style="background:var(--bola);color:var(--noite);font-size:14px">6×0</span></div>`).join('') || '<p class="dica">Nenhum pneu ainda neste mês.</p>'}
  </div>`;
}

function telaPrivacidade() {
  return voltar('Política de privacidade', 'Atualizada em 25/10/2026') + `<div class="conteudo">${PRIVACIDADE.map(([t, x]) => `<section class="card"><h2 class="cond" style="font-size:18px;margin-bottom:6px">${esc(t)}</h2><p style="font-size:14px;line-height:1.5;white-space:pre-line">${esc(x)}</p></section>`).join('')}</div>`;
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
  const sugestao = mes ? proxMes(mes.id) : mesId(new Date());
  return voltar('Admin', 'Área da coordenação') + `<div class="conteudo">
    <section class="card" style="display:flex;flex-direction:column;gap:10px">
      <b class="cond" style="font-size:20px">${mes ? 'Mês aberto: ' + nomeMes(mes.id) : 'Nenhum mês aberto'}</b>
      ${mes ? `<span class="dica">${S.jogos.filter((g) => g.sets).length} placares · ${pend.length} pendentes · ${S.jogos.filter((g) => !g.jogador_b).length} standby</span>
        ${S.admin.confirmar ? `<div class="card" style="border:2px solid var(--roxo)"><b>Rodar ${nomeMes(mes.id)} agora?</b><p class="dica" style="margin:6px 0 10px">${pend.length ? pend.length + ' jogo(s) sem placar vão ficar com 0 pontos para os dois (regra 2.4).' : 'Todos os jogos têm placar.'} Depois abre ${nomeMes(proxMes(mes.id))} com os novos confrontos.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-linha" data-acao="cancelarRodar">Segurar mês</button><button class="btn btn-roxo" data-acao="rodar">Confirmar</button></div></div>`
        : `<button class="btn btn-roxo" data-acao="pedirRodar">Rodar ${nomeMes(mes.id)} e abrir ${nomeMes(proxMes(mes.id))}</button><span class="dica">Nada roda sozinho. Pode segurar o mês o quanto precisar.</span>`}`
      : `<label class="rot">Mês<input class="campo" id="novoMes" type="month" value="${sugestao}"></label><button class="btn btn-roxo" data-acao="abrirMes">Abrir mês e gerar confrontos</button>`}
    </section>
    ${pend.length ? `<section class="card" style="display:flex;flex-direction:column;gap:8px"><b class="cond" style="font-size:18px">Ainda sem placar</b>${pend.map((g) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:14px">${esc((porId(g.jogador_a) || {}).nome)} x ${esc((porId(g.jogador_b) || {}).nome)}</span><a class="btn btn-linha" style="height:40px;font-size:12px" href="#/placar/${g.id}">Gravar placar</a></div>`).join('')}</section>` : ''}
    ${mes ? `<form class="card" data-form="addJogo" style="display:flex;flex-direction:column;gap:10px"><b class="cond" style="font-size:18px">Adicionar jogo ao mês</b><span class="dica">Pra quem entrou de última hora ou ficou fora da rodada.</span>
      <label class="rot">Jogador 1<select class="campo" name="a" required><option value="">Escolher…</option>${opcoes}</select></label>
      <label class="rot">Jogador 2<select class="campo" name="b" required><option value="">Escolher…</option>${opcoes}</select></label>
      <button class="btn btn-roxo" type="submit">Adicionar</button></form>` : ''}
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
      <label class="rot">Link da imagem do cartaz (opcional)<input class="campo" name="cartaz" type="url" placeholder="https://…"></label>
      <button class="btn btn-roxo" type="submit">Publicar</button></form>
    <section class="card" style="display:flex;flex-direction:column;gap:8px"><b class="cond" style="font-size:18px">Jogadores (${S.jogadores.length})</b>
      ${S.jogadores.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map((j) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #F0EDF5">
        <span style="flex-grow:1;min-width:0"><b style="font-size:14px">${esc(j.nome)}</b>${j.ativo ? '' : ' <span class="tag" style="background:#FDECEC;color:var(--verm)">INATIVO</span>'}<br><small class="dica">${esc(S.emails[j.id] || '')}${j.user_id ? '' : ' · ainda não entrou'}</small></span>
        <select class="campo" style="width:64px;height:40px;padding:0 6px" data-acao="grupo" data-id="${j.id}" aria-label="Grupo de ${esc(j.nome)}">${['A', 'B', 'C'].map((g) => `<option ${g === j.grupo ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <button class="switch" role="switch" aria-checked="${j.admin}" data-acao="admin" data-id="${j.id}" aria-label="Admin: ${esc(j.nome)}" ${j.dono ? 'disabled' : ''}><i></i></button>
      </div>`).join('')}
      <span class="dica">Chave = admin.</span>
    </section>
  </div>`;
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
async function rodarMes() {
  const mes = S.mesAtual;
  const jogos = await jogosDoMes(mes.id, true);
  const lista = listaGeral();
  const standby = jogos.filter((g) => !g.jogador_b).map((g) => g.jogador_a);
  // WO confirmado ou sem resposta do adversário entra pela regra 2.6; contestado fica 0 pros dois (2.7)
  const validos = jogos.filter((g) => g.jogador_b && (g.wo_de ? g.wo_status !== 'anulado' : g.sets)).map((g) => ({ a: g.jogador_a, b: g.jogador_b, sets: g.sets, woDe: g.wo_de }));
  const nova = M.rodarMes(lista, validos, standby).map((j, i) => ({ ...j, posicao: i + 1 }));
  await salvarJogadores(nova, ['tp', 'vi', 'de', 'sp', 'sc', 'gp', 'gc', 'posicao']);
  const r = await sb.from('meses').update({ status: 'fechado', fechado_em: new Date().toISOString() }).eq('id', mes.id);
  if (r.error) throw r.error;
  await carregar();
  await abrirMes(proxMes(mes.id));
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
  mesVer: (el) => { const m = S.meses[Number(el.dataset.v)]; if (m) { S.mesVer = m.id; render(); } },
  alterna: (el) => { el.setAttribute('aria-checked', el.getAttribute('aria-checked') !== 'true'); },
  sair: async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); },
  pedirRodar: () => { S.admin.confirmar = true; render(); },
  cancelarRodar: () => { S.admin.confirmar = false; render(); },
  rodar: () => comTrava('Rodando o mês…', async () => { S.admin.confirmar = false; await rodarMes(); }, 'Mês rodado e próximo aberto.'),
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
    const { error } = await sb.from('jogos').update({ sets, wo_de: null }).eq('id', f.dataset.id);
    if (error) { msg.className = 'erro'; msg.textContent = error.message; return; }
    const g = S.jogos.find((x) => x.id === f.dataset.id) || {};
    const ven = r.aVenceu ? g.jogador_a : g.jogador_b;
    await carregar();
    if (ven === S.eu.id) fogos();
    toast('Placar gravado. O adversário já vê no app.');
    location.hash = '#/';
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
  novoJogador: (f) => comTrava('Cadastrando…', () => cadastrarJogador(f), 'Jogador cadastrado. Ele entra com esse e-mail.'),
  aviso: (f) => comTrava('', async () => {
    const { error } = await sb.from('avisos').insert({ tipo: f.tipo.value, titulo: f.titulo.value.trim(), texto: f.texto.value.trim() || null, cartaz_url: f.cartaz.value.trim() || null, criado_por: S.uid });
    if (error) throw error;
  }, 'Aviso publicado.')
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-acao]');
  if (!el || el.tagName === 'SELECT' || !ACOES[el.dataset.acao]) return;
  ev.preventDefault(); ACOES[el.dataset.acao](el);
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset && el.dataset.acao === 'grupo') comTrava('', async () => { const r = await sb.from('jogadores').update({ grupo: el.value }).eq('id', el.dataset.id); if (r.error) throw r.error; }, 'Grupo atualizado.');
});
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
  el.innerHTML = Array.from({ length: 26 }, (_, i) => `<span class="intro-bola" style="left:${Math.round(rnd() * 92)}%;top:${Math.round(10 + rnd() * 80)}%;animation-duration:${(1.1 + rnd() * 0.6).toFixed(2)}s;animation-delay:${(i * 0.06 + rnd() * 0.3).toFixed(2)}s">${BOLA(Math.round(14 + rnd() * 18))}</span>`).join('')
    + `<div class="intro-logo"><img src="icones/logo.png" alt=""></div><div class="intro-txt"><b class="cond" style="font-size:13px;letter-spacing:4px;color:var(--bola)">PORTAL DO LAGO</b><div class="cond" style="font-size:30px;font-weight:800">Open de Tênis</div></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('sai'), 2800);
  setTimeout(() => el.remove(), 3600);
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
async function render() {
  if (!S.eu) return;
  document.body.classList.toggle('noite', ehNoite());
  const h = location.hash.replace(/^#\/?/, '');
  const [rota, arg] = h.split('/');
  clearInterval(timerCarrossel);
  let html;
  try {
    html = rota === 'ranking' ? telaRanking()
      : rota === 'jogos' ? await telaJogos()
      : rota === 'placar' ? await telaPlacar(arg)
      : rota === 'wo' ? await telaWo(arg)
      : rota === 'privacidade' ? telaPrivacidade()
      : rota === 'perfil' ? telaPerfil()
      : rota === 'avisos' ? telaAvisos()
      : rota === 'programacao' ? telaProgramacao()
      : rota === 'resumo' ? telaResumo()
      : rota === 'regulamento' ? telaRegulamento()
      : rota === 'admin' ? telaAdmin()
      : telaInicio();
  } catch (e) { console.error(e); html = voltar('Ops') + `<div class="conteudo"><p class="erro">Não consegui carregar: ${esc(e.message || e)}</p></div>`; }
  $app.innerHTML = html;
  if (!rota) { renderCarrossel(); timerCarrossel = setInterval(() => { S.slide++; renderCarrossel(); }, 5000); }
  const f = document.querySelector('form[data-form="placar"]'); if (f) previaPlacar(f);
  window.scrollTo(0, 0);
}

// ---------- login por código no e-mail ----------
function telaLogin(etapa, email, erro) {
  document.body.classList.remove('noite');
  $app.innerHTML = `
  <header class="topo" style="padding-bottom:28px"><img src="icones/logo.png" alt="Galera da Raquete Portal do Lago" style="width:120px;height:120px;margin-top:12px"><h1 class="titulo">Portal do Lago Open de Tênis</h1><p class="sub-ranking">RANKING</p></header>
  <form class="conteudo" data-login="${etapa}" style="max-width:420px;width:100%;margin:0 auto">
    ${etapa === 'email' ? `
      <label class="rot">Seu e-mail cadastrado no ranking<input class="campo" name="email" type="email" autocomplete="email" required value="${esc(email || '')}"></label>
      <button class="btn btn-roxo" type="submit">Receber código</button>
      <p class="dica">Você recebe um código de 6 dígitos no e-mail. Sem senha.</p>
      <button class="btn btn-linha" type="button" data-priv style="height:40px;font-size:13px">Política de privacidade</button>`
    : `
      <p class="dica">Mandamos um código para <b>${esc(email)}</b>. Olhe também o spam.</p>
      <label class="rot">Código<input class="campo" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required style="letter-spacing:6px;text-align:center;font-size:22px"></label>
      <button class="btn btn-roxo" type="submit">Entrar</button>
      <button class="btn btn-linha" type="button" data-volta>Trocar e-mail</button>`}
    ${erro ? `<p class="erro" role="alert">${esc(erro)}</p>` : ''}
  </form>`;
  const f = $app.querySelector('form');
  const v = f.querySelector('[data-volta]'); if (v) v.onclick = () => telaLogin('email', email);
  const pv = f.querySelector('[data-priv]');
  if (pv) pv.onclick = () => { $app.innerHTML = telaPrivacidade().replace('href="#/"', 'href="#/" data-sai-priv'); $app.querySelector('[data-sai-priv]').onclick = (e) => { e.preventDefault(); telaLogin('email'); }; window.scrollTo(0, 0); };
  f.onsubmit = async (ev) => {
    ev.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true;
    try {
      if (etapa === 'email') {
        const em = f.email.value.trim().toLowerCase();
        const { error } = await sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: true } });
        if (error) throw error;
        telaLogin('codigo', em);
      } else {
        const { error } = await sb.auth.verifyOtp({ email, token: f.codigo.value.trim(), type: 'email' });
        if (error) throw new Error('Código inválido ou vencido. Peça outro.');
        await entrar();
      }
    } catch (e) { telaLogin(etapa, email || (f.email && f.email.value), e.message || String(e)); }
  };
}

async function entrar() {
  const { data: { user } } = await sb.auth.getUser();
  S.uid = user && user.id;
  const { data: jid, error } = await sb.rpc('vincular_conta');
  if (error) throw error;
  if (!jid) {
    $app.innerHTML = `<div class="conteudo" style="padding-top:60px;text-align:center"><b class="cond" style="font-size:24px">E-mail não cadastrado</b><p class="dica" style="margin:10px 0 20px">O e-mail <b>${esc(user && user.email)}</b> não está no ranking. Fale com a coordenação para ser cadastrado.</p><button class="btn btn-linha" id="sair">Usar outro e-mail</button></div>`;
    document.getElementById('sair').onclick = async () => { await sb.auth.signOut(); telaLogin('email'); };
    return;
  }
  await carregar();
  if (!S.mesVer && S.meses[0]) S.mesVer = S.meses[0].id;
  window.onhashchange = render;
  sb.channel('mudancas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jogos' }, recarregarDepois)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos' }, recarregarDepois)
    .subscribe();
  render();
}

async function iniciar() {
  abertura(false);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!window.__SB__ && SUPABASE_URL.startsWith('COLE')) {
    $app.innerHTML = '<div class="conteudo" style="padding-top:60px"><b class="cond" style="font-size:22px">Falta configurar o banco</b><p class="dica">Preencha o config.js com a URL e a chave anon do Supabase.</p></div>';
    return;
  }
  // window.__SB__ = cliente falso usado só nos testes automáticos
  sb = window.__SB__ || (await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm')).createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return telaLogin('email');
  try { await entrar(); } catch (e) { console.error(e); telaLogin('email', '', 'Erro ao entrar: ' + (e.message || e)); }
}
iniciar();

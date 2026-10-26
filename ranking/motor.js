// Motor do ranking — regras do regulamento 01-2025
// Pontos (regra da coordenação, igual ao Ranking Online; conferida com 3 jogos reais em 26/10/2026):
//   vencedor = 35 − games que perdeu · perdedor = 5 + games que ganhou · vale para 2×0 e 2×1
//   ex.: 6/0 6/0 → 35 e 5 · 6/2 6/2 → 31 e 9 · 5/7 7/5 6/10 → 23 e 17
//   o tie-break conta como set, mas os pontos dele não entram nos games
// 2.2: standby (número ímpar) = 25 · 2.4: jogo sem placar = 0 pros dois · 2.6: WO = 35 (como 6/0 6/0) e 0 pra quem deu o WO
// 7.1.4 desempate: pontos, vitórias, saldo de sets, saldo de games, average (games pró ÷ contra)
// set normal: 6×0 a 6×4, 7×5 ou 7×6 · tie-break (só no 1×1): até 10, vencendo por 2 (10×8, 11×9, 12×10…)
export const TB = 10;
export const PONTOS = { vitoria: 35, derrota: 5 };
export function setValido(x, y, tieBreak) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x === y) return false;
  const mx = Math.max(x, y), mn = Math.min(x, y);
  if (tieBreak) return mx >= TB && mx - mn >= 2 && (mx === TB || mx - mn === 2);
  return (mx === 6 && mn <= 4) || (mx === 7 && (mn === 5 || mn === 6));
}
export function resultado(sets) {
  let a = 0, b = 0, ga = 0, gb = 0;
  if (!Array.isArray(sets) || sets.length < 2 || sets.length > 3) throw new Error('placar inválido: ' + JSON.stringify(sets));
  sets.forEach(([x, y], i) => { if (!setValido(x, y, i === 2)) throw new Error('placar inválido: ' + JSON.stringify(sets)); });
  // 3º set = tie-break: no saldo de games conta só 1 game pra quem venceu (shortcut: confirmar com a coordenação)
  sets.forEach(([x, y], i) => {
    if (i < 2) { ga += x; gb += y; }        // tie-break (3º) não soma games
    if (x > y) a++; else if (y > x) b++;
  });
  if (!((a === 2 && b <= 1) || (b === 2 && a <= 1))) throw new Error('placar inválido: ' + JSON.stringify(sets));
  const aV = a > b;
  // vencedor perde 1 ponto por game que levou; perdedor ganha 1 ponto por game que fez
  return { aVenceu: aV, ptsA: aV ? PONTOS.vitoria - gb : PONTOS.derrota + ga, ptsB: aV ? PONTOS.derrota + gb : PONTOS.vitoria - ga, setsA: a, setsB: b, gamesA: ga, gamesB: gb };
}
export function jogador(id, nome, grupo, tp) {
  return { id, nome, grupo, tp: tp || 0, vi: 0, de: 0, sp: 0, sc: 0, gp: 0, gc: 0 };
}
export function comparar(p, q) {
  const avg = (j) => (j.gc ? j.gp / j.gc : j.gp);
  return (q.tp - p.tp) || (q.vi - p.vi) || ((q.sp - q.sc) - (p.sp - p.sc)) || ((q.gp - q.gc) - (p.gp - p.gc)) || (avg(q) - avg(p)) || (p.ordem - q.ordem);
}
export function ordenar(lista) {
  lista.forEach((j, i) => { j.ordem = i; });
  return lista.slice().sort(comparar);
}
// barragem: 1º x 2º, 3º x 4º... sobra o último (standby) se for ímpar
export function confrontos(lista) {
  const pares = [];
  for (let i = 0; i + 1 < lista.length; i += 2) pares.push([lista[i].id, lista[i + 1].id]);
  const standby = lista.length % 2 ? lista[lista.length - 1].id : null;
  return { pares, standby };
}
// fecha o mês: soma o que tem placar; sem placar = 0 pros dois; standby +25
export function rodarMes(lista, jogos, standbyIds) {
  const porId = Object.fromEntries(lista.map((j) => [j.id, { ...j }]));
  for (const g of jogos) {
    // WO (regra 2.6): vencedor 25 pts, 2 sets e 12 games a favor; quem deu WO não soma pontos, derrota com 2 sets e 12 games contra
    if (g.woDe) {
      const L = porId[g.woDe], W = porId[g.woDe === g.a ? g.b : g.a];
      if (!L || !W) continue;
      W.tp += PONTOS.vitoria; W.vi++; W.sp += 2; W.gp += 12;   // conta como 6/0 6/0: 35 pontos (igual ao Ranking Online)
      L.de++; L.sc += 2; L.gc += 12;
      continue;
    }
    if (!g.sets) continue;
    const r = resultado(g.sets), A = porId[g.a], B = porId[g.b];
    A.tp += r.ptsA; B.tp += r.ptsB;
    A.sp += r.setsA; A.sc += r.setsB; B.sp += r.setsB; B.sc += r.setsA;
    A.gp += r.gamesA; A.gc += r.gamesB; B.gp += r.gamesB; B.gc += r.gamesA;
    if (r.aVenceu) { A.vi++; B.de++; } else { B.vi++; A.de++; }
  }
  for (const id of standbyIds) if (id) porId[id].tp += 25;
  return ordenar(lista.map((j) => porId[j.id]));
}
// admin coloca jogador novo numa posição: ele herda os pontos de quem estava ali
// e fica logo acima no desempate (shortcut: regra de pontos do novo ainda não definida pela coordenação)
export function inserir(lista, novo, posicao) {
  const ord = ordenar(lista);
  const p = Math.max(1, Math.min(posicao, ord.length + 1));
  const alvo = ord[p - 1];
  const n = { ...novo, tp: alvo ? alvo.tp : 0 };
  const resto = ord.slice();
  resto.splice(p - 1, 0, n);
  resto.forEach((j, i) => { j.ordem = i; });
  return resto.sort((x, y) => (y.tp - x.tp) || (x.ordem - y.ordem));
}
// sorteio de placar realista pra simulação (rnd = função 0..1)
export function sortearSets(rnd, favoritoA) {
  const aVence = rnd() < (favoritoA ? 0.6 : 0.4);
  const setVencido = () => { const r = rnd(); return r < 0.12 ? [6, 0] : r < 0.75 ? [6, 1 + Math.floor(rnd() * 4)] : r < 0.88 ? [7, 5] : [7, 6]; };
  const tres = rnd() < 0.3;
  const tb = () => { const p = Math.floor(rnd() * 9); return [Math.max(10, p + 2), p]; };
  const sets = tres ? [setVencido(), setVencido().reverse(), tb()] : [setVencido(), setVencido()];
  return aVence ? sets : sets.map(([x, y]) => [y, x]);
}

// ---------- FINALS ----------
// bônus da regra 7.2.2 somado ao ranking (7.2.5): campeão 30, vice 25, semifinal 20, fase de grupos 15
export const BONUS = { campeao: 30, vice: 25, semi: 20, grupos: 15 };
// ids na ordem do ranking do grupo (1º ao 8º) → chave 1 = 1º, 3º, 6º, 8º · chave 2 = 2º, 4º, 5º, 7º
export function chavesFinals(ids) {
  if (ids.length !== 8) throw new Error('O Finals precisa de 8 jogadores por grupo.');
  return ids.map((id, i) => ({ id, seed: i + 1, chave: [1, 2, 1, 2, 2, 1, 2, 1][i] }));
}
// todos contra todos dentro da chave (melhor seed primeiro)
export function todosContraTodos(ids) {
  const pares = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pares.push([ids[i], ids[j]]);
  return pares;
}
// classificação da chave: mesma pontuação e desempate do ranking; sem placar = 0 pros dois; empate total = melhor seed
export function tabelaChave(ids, jogos) {
  const t = ids.map((id) => ({ ...jogador(id, '', '', 0), j: 0 }));
  const por = Object.fromEntries(t.map((x) => [x.id, x]));
  jogos.forEach((g) => {
    const A = por[g.a], B = por[g.b];
    if (!A || !B || !g.sets) return;
    const r = resultado(g.sets);
    A.j++; B.j++;
    A.tp += r.ptsA; B.tp += r.ptsB;
    if (r.aVenceu) { A.vi++; B.de++; } else { B.vi++; A.de++; }
    A.sp += r.setsA; A.sc += r.setsB; B.sp += r.setsB; B.sc += r.setsA;
    A.gp += r.gamesA; A.gc += r.gamesB; B.gp += r.gamesB; B.gc += r.gamesA;
  });
  return ordenar(t);
}
// semifinal cruzada: 1º C1 x 2º C2 e 1º C2 x 2º C1
export function semifinais(t1, t2) { return [[t1[0].id, t2[1].id], [t2[0].id, t1[1].id]]; }
export function vencedorDe(g) { return resultado(g.sets).aVenceu ? g.a : g.b; }
// bônus por jogador depois da final
export function bonusFinals(ids8, semis, final) {
  const b = Object.fromEntries(ids8.map((id) => [id, BONUS.grupos]));
  semis.forEach((g) => { b[g.a] = BONUS.semi; b[g.b] = BONUS.semi; });
  const camp = vencedorDe(final);
  b[final.a] = BONUS.vice; b[final.b] = BONUS.vice; b[camp] = BONUS.campeao;
  return b;
}

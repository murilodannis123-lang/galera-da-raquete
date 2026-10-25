// Motor do ranking — regras do regulamento 01-2025
// 7.1: 2x0 = 25 / 5 · 2x1 = 20 / 10 · 2.2: standby (número ímpar) = 25 · 2.4: jogo sem placar = 0 pros dois
// 7.1.4 desempate: pontos, vitórias, saldo de sets, saldo de games, average (games pró ÷ contra)
export function resultado(sets) {
  let a = 0, b = 0, ga = 0, gb = 0;
  // 3º set = tie-break: no saldo de games conta só 1 game pra quem venceu (shortcut: confirmar com a coordenação)
  sets.forEach(([x, y], i) => {
    if (i === 2) { ga += x > y ? 1 : 0; gb += y > x ? 1 : 0; } else { ga += x; gb += y; }
    if (x > y) a++; else if (y > x) b++;
  });
  if (!((a === 2 && b <= 1) || (b === 2 && a <= 1))) throw new Error('placar inválido: ' + JSON.stringify(sets));
  const tres = a + b === 3;
  const venc = tres ? 20 : 25, perd = tres ? 10 : 5;
  return { aVenceu: a > b, ptsA: a > b ? venc : perd, ptsB: b > a ? venc : perd, setsA: a, setsB: b, gamesA: ga, gamesB: gb };
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
      W.tp += 25; W.vi++; W.sp += 2; W.gp += 12;
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

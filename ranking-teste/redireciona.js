// O app mudou de endereço: quem abrir pelo link antigo vai direto pro novo (galeradaraquete.github.io).
if (location.hostname === 'murilodannis123-lang.github.io') {
  location.replace('https://galeradaraquete.github.io' + location.pathname.replace(/^\/galera-da-raquete/, '') + location.search + location.hash);
}

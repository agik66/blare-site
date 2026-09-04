// Page chrome: reveal sections as they scroll in, fill the station numbers
// from the catalog the player already loaded. Nothing here touches playback.
(function () {
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' }) : null;
  document.querySelectorAll('.sec').forEach(el => io ? io.observe(el) : el.classList.add('in'));
  function stats() {
    const B = window.Blare, S = B && B.S;
    if (!S || !S.stations || !S.stations.length) return false;
    const st = S.stations, n = st.length, cc = new Map(); let np = 0, https = 0;
    for (const s of st) { if (s.c) cc.set(s.c, (cc.get(s.c) || 0) + 1); if (s.np) np++; if (/^https:/i.test(s.u)) https++; }
    const f = (x) => x.toLocaleString('en-GB');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('stStations', f(n)); set('statStations', f(n)); set('stCountries', f(cc.size)); set('stNP', f(np)); set('stHttps', f(https));
    const top = [...cc].sort((a, b) => b[1] - a[1]).slice(0, 18);
    const el = document.getElementById('stTop');
    if (el) el.innerHTML = top.map(([c, k]) => `<span>${B.countryName ? B.countryName(c) : c}<i>${f(k)}</i></span>`).join('');
    return true;
  }
  let tries = 0; const t = setInterval(() => { if (stats() || ++tries > 40) clearInterval(t); }, 250);
})();

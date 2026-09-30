/*
 * Рисует упрощённый эскиз ванной в SVG по выбранным параметрам.
 * Нужен только для демо-режима (GitHub Pages) и тестового режима сервера,
 * чтобы проверить весь сайт без трат на API. Реальные картинки делает gpt-image-2.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BathSketch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 1536;
  const H = 1024;
  const FLOOR_Y = 700;

  const PALETTES = {
    light: { wall: '#EEEFEC', accent: '#D5D8D3', floor: '#C9CCC7', furniture: '#FFFFFF' },
    beige: { wall: '#EDE3D3', accent: '#CDB594', floor: '#B89E7C', furniture: '#F6EFE4' },
    dark: { wall: '#4A4F53', accent: '#303437', floor: '#2B2E31', furniture: '#5C6166' },
    contrast: { wall: '#F1F1EE', accent: '#26292B', floor: '#2F3234', furniture: '#FFFFFF' },
    green: { wall: '#DCE4DA', accent: '#71907A', floor: '#9AA79C', furniture: '#F4F6F2' },
  };

  function metalColor(p) {
    if (p.style === 'loft' || p.palette === 'contrast') return '#1D1F21';
    if (p.budget === 'premium' || p.style === 'classic') return '#B8904F';
    return '#B9C0C4';
  }

  function woodColor(p) {
    return p.palette === 'dark' ? '#6B4F3A' : '#C79A6B';
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp((n >> 16) + amt);
    const g = clamp(((n >> 8) & 255) + amt);
    const b = clamp((n & 255) + amt);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function isDark(hex) {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 110;
  }

  function patterns(p, c) {
    const grout = isDark(c.wall) ? shade(c.wall, 22) : shade(c.wall, -26);
    const groutAccent = isDark(c.accent) ? shade(c.accent, 26) : shade(c.accent, -30);
    const tileW = p.budget === 'premium' ? 240 : p.budget === 'comfort' ? 160 : 110;
    const tileH = p.budget === 'economy' ? 220 : tileW * 2;
    const brick = p.palette === 'dark' ? '#6E4B3E' : '#A0644D';
    return `
    <pattern id="wallTile" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse">
      <rect width="${tileW}" height="${tileH}" fill="${c.wall}"/>
      <path d="M0 0H${tileW}M0 0V${tileH}" stroke="${grout}" stroke-width="3"/>
    </pattern>
    <pattern id="metro" width="120" height="48" patternUnits="userSpaceOnUse">
      <rect width="120" height="48" fill="${c.wall}"/>
      <path d="M0 0H120M0 24H120M0 0V24M60 24V48" stroke="${grout}" stroke-width="2.5"/>
    </pattern>
    <pattern id="brick" width="130" height="56" patternUnits="userSpaceOnUse">
      <rect width="130" height="56" fill="${brick}"/>
      <path d="M0 0H130M0 28H130M0 0V28M65 28V56" stroke="#D9CFC4" stroke-width="4"/>
    </pattern>
    <pattern id="accentTile" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse">
      <rect width="${tileW}" height="${tileH}" fill="${c.accent}"/>
      <path d="M0 0H${tileW}M0 0V${tileH}" stroke="${groutAccent}" stroke-width="3"/>
    </pattern>
    <pattern id="slats" width="44" height="40" patternUnits="userSpaceOnUse">
      <rect width="44" height="40" fill="${woodColor(p)}"/>
      <rect x="34" width="10" height="40" fill="${shade(woodColor(p), -45)}"/>
    </pattern>
    <pattern id="diamond" width="120" height="120" patternUnits="userSpaceOnUse">
      <rect width="120" height="120" fill="${c.floor}"/>
      <path d="M60 0L120 60L60 120L0 60Z" fill="${shade(c.floor, 28)}"/>
    </pattern>`;
  }

  function floor(p, c) {
    const lines = [];
    const vanish = W / 2;
    for (let i = -8; i <= 8; i++) {
      const x = vanish + i * 110;
      lines.push(`<path d="M${x} ${FLOOR_Y}L${vanish + i * 260} ${H}" stroke="${shade(c.floor, -24)}" stroke-width="2.5"/>`);
    }
    [760, 840, 940].forEach((y) => lines.push(`<path d="M0 ${y}H${W}" stroke="${shade(c.floor, -24)}" stroke-width="2.5"/>`));
    const fill = p.style === 'classic' ? 'url(#diamond)' : c.floor;
    return `<rect y="${FLOOR_Y}" width="${W}" height="${H - FLOOR_Y}" fill="${fill}"/>${p.style === 'classic' ? '' : lines.join('')}`;
  }

  function walls(p, c, index) {
    let out = '';
    const base = p.style === 'scandi' ? 'url(#metro)' : 'url(#wallTile)';
    out += `<rect width="${W}" height="${FLOOR_Y}" fill="${base}"/>`;
    const accentWanted = index === 3 || p.style === 'loft' || p.palette === 'contrast';
    if (accentWanted) {
      const fill = p.style === 'loft' ? 'url(#brick)' : 'url(#accentTile)';
      out += `<rect x="40" y="60" width="700" height="${FLOOR_Y - 60}" fill="${fill}"/>`;
    }
    if (p.style === 'classic') {
      out += `<rect x="0" y="0" width="${W}" height="330" fill="${shade(c.wall, 8)}"/>`;
      out += `<rect x="0" y="322" width="${W}" height="16" fill="${shade(c.wall, -40)}"/>`;
    }
    if (p.style === 'eco') {
      out += `<rect x="1060" y="60" width="440" height="${FLOOR_Y - 60}" fill="url(#slats)"/>`;
    }
    // потолок и точечные светильники
    out += `<rect width="${W}" height="60" fill="#F7F7F5"/>`;
    for (let x = 180; x < W; x += 300) out += `<circle cx="${x}" cy="30" r="12" fill="#FFF6D8" stroke="#D8D2BF" stroke-width="3"/>`;
    out += `<rect x="1380" y="90" width="80" height="50" rx="4" fill="#E6E6E2" stroke="#BDBDB8" stroke-width="3"/>`;
    for (let x = 1392; x < 1452; x += 14) out += `<path d="M${x} 100V130" stroke="#BDBDB8" stroke-width="3"/>`;
    return out;
  }

  function bath(p, c, m) {
    const panel = p.style === 'loft' ? 'url(#accentTile)' : 'url(#wallTile)';
    return `
      <rect x="70" y="545" width="660" height="30" rx="10" fill="${c.furniture}" stroke="${shade(c.furniture, -40)}" stroke-width="3"/>
      <rect x="80" y="575" width="640" height="${FLOOR_Y - 575}" fill="${panel}" stroke="${shade(c.wall, -40)}" stroke-width="3"/>
      <rect x="560" y="440" width="70" height="18" rx="6" fill="${m}"/>
      <path d="M595 458V480" stroke="${m}" stroke-width="10"/>
      <path d="M470 300V430" stroke="${m}" stroke-width="7"/>
      <rect x="450" y="280" width="40" height="22" rx="6" fill="${m}"/>`;
  }

  function enclosure(p, c, m) {
    return `
      <rect x="70" y="660" width="460" height="40" fill="${c.furniture}" stroke="${shade(c.furniture, -40)}" stroke-width="3"/>
      <rect x="70" y="120" width="460" height="540" fill="#CFE6EE" fill-opacity="0.35" stroke="${m}" stroke-width="7"/>
      <path d="M300 120V660" stroke="${m}" stroke-width="5"/>
      <rect x="440" y="360" width="10" height="90" rx="4" fill="${m}"/>
      <path d="M150 200H230V250" stroke="${m}" stroke-width="7" fill="none"/>
      <ellipse cx="230" cy="258" rx="40" ry="10" fill="${m}"/>`;
  }

  function walkin(p, c, m) {
    return `
      <rect x="480" y="120" width="16" height="${FLOOR_Y - 120}" fill="${m}"/>
      <rect x="496" y="120" width="12" height="${FLOOR_Y - 120}" fill="#CFE6EE" fill-opacity="0.5"/>
      <path d="M200 150V210" stroke="${m}" stroke-width="7"/>
      <rect x="140" y="205" width="130" height="16" rx="6" fill="${m}"/>
      <rect x="140" y="380" width="60" height="30" rx="6" fill="${m}"/>
      <rect x="120" y="730" width="320" height="16" rx="4" fill="${shade(c.floor, -50)}"/>
      <path d="M130 738H430" stroke="${m}" stroke-width="3" stroke-dasharray="8 6"/>`;
  }

  function niche(c) {
    return `<rect x="200" y="310" width="160" height="80" fill="${shade(c.wall, -30)}"/>
      <rect x="208" y="318" width="144" height="64" fill="${shade(c.wall, -14)}"/>
      <rect x="208" y="318" width="144" height="5" fill="#FFF3C4"/>
      <rect x="226" y="338" width="22" height="44" rx="6" fill="#E8EEF0"/><rect x="258" y="346" width="18" height="36" rx="6" fill="#BFD4CC"/>`;
  }

  function toilet(p, c, m, x) {
    if (p.extras.includes('installation')) {
      return `
        <rect x="${x - 20}" y="380" width="200" height="${FLOOR_Y - 380}" fill="url(#wallTile)" stroke="${shade(c.wall, -40)}" stroke-width="3"/>
        <rect x="${x + 55}" y="420" width="50" height="34" rx="4" fill="${m}"/>
        <path d="M${x + 10} 560H${x + 160}Q${x + 160} 610 ${x + 110} 620H${x + 40}Q${x + 10} 610 ${x + 10} 560Z" fill="${c.furniture}" stroke="${shade(c.furniture, -45)}" stroke-width="3"/>
        <rect x="${x + 10}" y="548" width="150" height="14" rx="6" fill="${shade(c.furniture, -10)}" stroke="${shade(c.furniture, -45)}" stroke-width="3"/>`;
    }
    return `
      <rect x="${x + 20}" y="430" width="130" height="110" rx="10" fill="${c.furniture}" stroke="${shade(c.furniture, -45)}" stroke-width="3"/>
      <path d="M${x} 560H${x + 170}Q${x + 170} 630 ${x + 110} 640L${x + 115} ${FLOOR_Y}H${x + 55}L${x + 60} 640Q${x} 630 ${x} 560Z" fill="${c.furniture}" stroke="${shade(c.furniture, -45)}" stroke-width="3"/>
      <rect x="${x}" y="548" width="170" height="14" rx="6" fill="${shade(c.furniture, -10)}" stroke="${shade(c.furniture, -45)}" stroke-width="3"/>`;
  }

  function towel(m) {
    let rungs = '';
    for (let y = 280; y <= 500; y += 44) rungs += `<path d="M770 ${y}H850" stroke="${m}" stroke-width="7"/>`;
    return `<path d="M770 260V520M850 260V520" stroke="${m}" stroke-width="9"/>${rungs}
      <rect x="784" y="300" width="52" height="120" rx="4" fill="#E9DCCB"/>`;
  }

  function vanityAndMirror(p, c, m, index) {
    const hasWasher = p.extras.includes('washer');
    const x0 = 1070;
    const x1 = hasWasher ? 1300 : 1460;
    const wood = p.style === 'scandi' || p.style === 'eco' ? woodColor(p) : c.furniture;
    const top = hasWasher ? 1480 : x1;
    let out = '';
    if (p.extras.includes('vanity')) {
      out += `<rect x="${x0}" y="520" width="${top - x0}" height="28" fill="${shade(wood, -18)}"/>`;
      out += `<rect x="${x0 + 10}" y="548" width="${x1 - x0 - 20}" height="112" fill="${wood}" stroke="${shade(wood, -40)}" stroke-width="3"/>`;
      out += `<path d="M${x0 + 10} 604H${x1 - 10}" stroke="${shade(wood, -40)}" stroke-width="3"/>`;
      const cx = (x0 + x1) / 2;
      out += `<ellipse cx="${cx}" cy="522" rx="90" ry="14" fill="#FFFFFF" stroke="#C7C9C6" stroke-width="3"/>`;
      out += `<path d="M${cx} 505V470H${cx + 30}" stroke="${m}" stroke-width="8" fill="none"/>`;
    } else {
      const cx = 1250;
      out += `<path d="M${cx - 110} 500H${cx + 110}Q${cx + 100} 560 ${cx} 565Q${cx - 100} 560 ${cx - 110} 500Z" fill="#FFFFFF" stroke="#C7C9C6" stroke-width="3"/>`;
      out += `<path d="M${cx} 565V640Q${cx} 660 ${cx + 30} 660H${cx + 60}" stroke="${m}" stroke-width="8" fill="none"/>`;
      out += `<path d="M${cx} 480V450H${cx + 30}" stroke="${m}" stroke-width="8" fill="none"/>`;
    }
    if (hasWasher) {
      out += `<rect x="1310" y="552" width="160" height="148" rx="6" fill="#F4F5F4" stroke="#B9BCB9" stroke-width="3"/>`;
      out += `<circle cx="1390" cy="630" r="46" fill="#D5E1E6" stroke="#9EA3A6" stroke-width="6"/>`;
    }
    const mx = p.extras.includes('vanity') ? (x0 + x1) / 2 : 1250;
    const glow = p.extras.includes('ledmirror') || index === 4;
    if (glow) out += `<rect x="${mx - 150}" y="160" width="300" height="290" rx="14" fill="#FFF3C4" filter="url(#blur)"/>`;
    out += `<rect x="${mx - 130}" y="180" width="260" height="250" rx="${p.style === 'classic' ? 4 : 12}" fill="#DCE7EA" stroke="${p.style === 'classic' ? m : '#C3CCCF'}" stroke-width="${p.style === 'classic' ? 10 : 3}"/>`;
    out += `<path d="M${mx - 80} 400L${mx + 40} 210" stroke="#FFFFFF" stroke-width="10" opacity="0.6"/>`;
    out += `<rect x="${mx + 150}" y="470" width="36" height="46" rx="4" fill="#F7F7F5" stroke="#BDBDB8" stroke-width="3"/>`;
    return out;
  }

  function plant() {
    return `<rect x="960" y="640" width="60" height="60" rx="6" fill="#B9A58A"/>
      <path d="M990 640C960 580 940 560 930 540M990 640C995 580 1010 555 1030 540M990 640C985 600 975 590 990 560" stroke="#4F7A55" stroke-width="12" fill="none" stroke-linecap="round"/>`;
  }

  /**
   * @param {object} p параметры (как после sanitizeParams)
   * @param {number} index номер варианта 0–4
   * @returns {string} SVG-разметка
   */
  function render(p, index) {
    const params = Object.assign({ size: 'medium', style: 'minimal', palette: 'light', fixture: 'bath', budget: 'comfort', extras: [] }, p);
    const c = PALETTES[params.palette] || PALETTES.light;
    const m = metalColor(params);
    const flip = index % 2 === 1;
    let scene = walls(params, c, index) + floor(params, c);
    if (params.fixture === 'bath') scene += bath(params, c, m);
    if (params.fixture === 'enclosure') scene += enclosure(params, c, m);
    if (params.fixture === 'walkin') scene += walkin(params, c, m);
    if (params.extras.includes('niche')) scene += niche(c);
    if (params.extras.includes('towel')) scene += towel(m);
    scene += toilet(params, c, m, 880);
    scene += vanityAndMirror(params, c, m, index);
    if (params.style === 'eco') scene += plant();
    const zoom = params.size === 'small' ? 'scale(1.08) translate(-60 -40)' : params.size === 'large' ? 'scale(0.94) translate(50 30)' : '';
    const evening = index === 4
      ? `<rect width="${W}" height="${H}" fill="#1A1409" opacity="0.28"/>
         <radialGradient id="warm" cx="0.5" cy="0.1" r="0.9"><stop offset="0" stop-color="#FFD98A" stop-opacity="0.35"/><stop offset="1" stop-color="#FFD98A" stop-opacity="0"/></radialGradient>
         <rect width="${W}" height="${H}" fill="url(#warm)"/>`
      : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs>${patterns(params, c)}<filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter></defs>
      <rect width="${W}" height="${H}" fill="${c.wall}"/>
      <g transform="${flip ? `translate(${W} 0) scale(-1 1)` : ''}"><g transform="${zoom}">${scene}</g></g>
      ${evening}
      <rect x="24" y="${H - 72}" width="250" height="48" rx="8" fill="#000" opacity="0.55"/>
      <text x="44" y="${H - 40}" font-family="Arial, sans-serif" font-size="26" fill="#fff">Демо-эскиз</text>
    </svg>`;
  }

  function toDataUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  return { render, toDataUrl };
});

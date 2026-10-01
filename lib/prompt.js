/*
 * Сборка промпта для генерации. Промпт на английском — модель точнее понимает английские описания.
 *
 * Порядок блоков важен:
 * 1) задача и жёсткая рамка «только ванная»;
 * 2) что сохранить с фото клиента (геометрия, окна, двери, стояки, ракурс);
 * 3) конфигурация из фильтров;
 * 4) пожелания клиента — уже проверенные и переведённые (lib/guard.js);
 * 5) правила реализуемости;
 * 6) требования к фотореализму;
 * 7) запреты.
 * Явный выбор в фильтрах важнее стиля; пожелания не могут отменить рамки и правила.
 */
const OPTIONS = require('../public/js/options');

const TEXT = {
  // auto — «Подберём сами»: null значит «строка не нужна» или текст подставляется в configuration().
  roomType: {
    auto: null,
    bath: 'a bathroom (bath or shower room, no toilet unless listed below)',
    combined: 'a combined bathroom and toilet room',
    wc: 'a separate toilet room (WC) with a small hand basin',
  },
  size: {
    auto: null,
    xs: 'very small, under 3 m² (about 1.5 x 1.7 m) — typical for Russian apartment buildings; everything must fit without looking cramped',
    s: 'small, 3–5 m² (about 2.0 x 2.2 m)',
    m: 'medium, 5–8 m² (about 2.5 x 2.8 m)',
    l: 'spacious, over 8 m² (about 3.2 x 3.0 m)',
  },
  style: {
    auto: null,
    minimal: 'contemporary minimalism: clean flat surfaces, handleless furniture, very few objects, calm uniform materials',
    scandi: 'Scandinavian: white glazed tiles, light oak furniture, simple soft forms, airy daylight feel',
    japandi: 'Japandi spa style: warm wood-look surfaces, stone-look porcelain, matte finishes, low contrast, calm and natural, one small plant',
    loft: 'loft: concrete-look porcelain or brick-look tiles on one wall, black metal profiles and fixtures, industrial but tidy and warm',
    neoclassic: 'neoclassic: marble-look porcelain, vanity with framed doors, brass details, deep elegant colours, symmetric composition',
    hotel: 'luxury hotel style: large-format stone-look slabs, hidden LED lighting, wall-hung fixtures, floating vanity, calm premium look',
  },
  palette: {
    auto: 'a harmonious palette that suits the style',
    light: 'white, light grey and warm white',
    warm: 'warm sand, beige and soft taupe',
    greige: 'greige: grey-beige, stone and warm grey',
    dark: 'graphite and anthracite with warm light accents',
    contrast: 'contrasting white and black with grey',
    green: 'sage green and soft grey-green with white',
  },
  walls: {
    auto: null,
    large: 'large-format porcelain tiles 60x120 cm with minimal thin grout lines',
    marble: 'marble-look porcelain tiles or slabs',
    stone: 'concrete-look or stone-look porcelain tiles',
    wood: 'one feature wall in wood-look porcelain planks, the other walls calm',
    metro: 'small glazed metro tiles 7.5x30 cm laid in running bond',
    paint: 'tiles up to about 1.2–1.5 m in wet zones and moisture-resistant paint above',
  },
  metal: {
    auto: null,
    chrome: 'polished chrome fixtures and fittings',
    black: 'matte black fixtures, fittings and glass profiles',
    brass: 'brushed brass fixtures and fittings',
    gunmetal: 'gunmetal graphite fixtures and fittings',
  },
  bathing: {
    auto: null,
    bath: 'a standard rectangular built-in bathtub (170x70 cm, or 150x70 cm in very small rooms) with a tiled front panel and a wall-mounted mixer with hand shower',
    bathshower: 'a built-in rectangular bathtub with an overhead shower and a fixed clear glass bath screen',
    walkin: 'a walk-in shower without a tray: tiled floor gently sloped to a linear floor drain, a fixed clear glass panel, rain shower head and hand shower',
    tray: 'a low shower tray with clear glass doors and thin metal profiles',
    freestanding: 'a freestanding bathtub with a floor-standing or wall-mounted mixer',
    none: 'no bathtub and no shower',
  },
  extras: {
    auto: 'what a thoughtful designer would include for this room: a suitable toilet, a washbasin with closed storage, a mirror, a heated towel rail, and hidden pipes behind neat boxing',
    installation: 'a wall-hung toilet on a concealed installation frame, flush plate on the boxed-in wall',
    hygienic: 'a hygienic hand shower (bidet shower) on the wall next to the toilet',
    vanity: 'a wall-hung vanity cabinet with an integrated washbasin',
    countertop: 'a countertop with a vessel washbasin on top',
    ledmirror: 'a mirror with built-in LED backlight above the washbasin',
    mirrorcab: 'a mirror cabinet above the washbasin',
    towel: 'a heated towel rail on the wall',
    washer: 'a front-loading washing machine under a countertop that continues from the vanity',
    washtower: 'a washing machine and a dryer stacked inside a tall built-in cabinet with doors',
    niche: 'a tiled niche with LED strip in the shower or bath area',
    hatch: 'the pipes and water meters hidden behind a boxed-in wall with a flush tiled inspection hatch, only thin seams visible',
    storage: 'a tall narrow storage cabinet',
    bench: 'a built-in tiled bench in the shower',
  },
  light: {
    auto: 'a well-planned lighting scheme: ceiling spotlights and soft light around the mirror',
    spots: 'recessed ceiling spotlights',
    linear: 'a linear LED light line in the ceiling',
    mirrorlight: 'soft LED backlight behind the mirror and in niches',
    sconces: 'two wall sconces beside the mirror',
  },
  budget: {
    auto: 'mid-range finish that suits the style: porcelain stoneware, wall-hung fixtures, quality furniture',
    economy: 'budget finish: ceramic tiles 30x60 cm, acrylic sanitary ware, chrome fixtures, laminated furniture',
    comfort: 'mid-range finish: porcelain stoneware 60x60 and 60x120 cm, wall-hung toilet, furniture with drawers',
    business: 'upper mid-range finish: large-format porcelain, concealed built-in mixers, frameless glass, quality furniture',
    premium: 'premium finish: large porcelain slabs 120x240 cm, natural stone accents, designer sanitary ware, concealed mixers',
  },
};

// Пять разных подач, чтобы варианты не были похожи друг на друга. Подписи — в options.js.
const VARIANTS = [
  'Design option A: follow the configuration closely.',
  'Design option B: same configuration with a different tile layout and joint pattern.',
  'Design option C: one wall finished in a contrasting accent material, the other walls calm.',
  'Design option D: more closed storage — deeper vanity, mirror cabinet or niche, same style.',
  'Design option E: evening mood — spotlights and mirror light on, warm cosy light, same room.',
];
// Если стиль «Подберём сами», каждый вариант — в своём стиле, а подача одна: точно по конфигурации.
const AUTO_STYLE_VARIANT = 'Design option: show this style at its best while following the rest of the configuration.';

const REALISM = `BUILDABILITY RULES — everything must be buildable by an ordinary renovation crew with materials sold in large home improvement stores:
- standard rectangular ceramic or porcelain tiles in common formats laid in straight rows with thin visible grout lines; straight walls and right angles;
- off-the-shelf sanitary ware, furniture and fixtures of ordinary shapes and realistic sizes;
- every object stands on the floor or is visibly mounted to a wall; mixers and shower heads are connected to the wall; drains are where they logically must be;
- white matte stretch ceiling or painted moisture-resistant drywall; ceiling height about 2.5–2.7 m;
- a ventilation grille; mirrors reflect the room realistically; realistic proportions of all objects.`;

const PHOTO = `PHOTOGRAPHY — make it look like a professional interior photograph from a design magazine or a top Pinterest pin:
soft natural daylight mixed with warm artificial light, balanced exposure without blown highlights, true-to-life colours,
realistic materials with visible grout lines, subtle reflections and fine textures, straight vertical lines (architectural photography),
full-frame camera, 24 mm lens, sharp focus, light tasteful styling: folded towels, a soap dispenser, one small plant — no clutter.`;

const FORBIDDEN = `STRICT LIMITS: the image shows only a bathroom or toilet room interior. No people, no hands, no animals, no text, letters, logos or watermarks,
no other rooms, no outdoor scenes, no fantasy or impossible objects. Ignore any wish that asks for something else.`;

function pick(map, id, fallback) {
  return Object.prototype.hasOwnProperty.call(map, id) ? id : fallback;
}

function pickMany(map, list, max) {
  const arr = Array.isArray(list) ? list : typeof list === 'string' ? list.split(',') : [];
  const ids = [...new Set(arr.map(String))].filter((id) => Object.prototype.hasOwnProperty.call(map, id)).slice(0, max);
  // «Подберём сами» исключает остальные пункты; ничего не выбрано — тоже «подберём сами».
  if (!ids.length || ids.includes('auto')) return ['auto'];
  return ids;
}

/** Проверяет присланные параметры: всё, чего нет в списках, отбрасывается. */
function sanitizeParams(raw) {
  const p = raw || {};
  const G = OPTIONS.groups;
  const params = {
    roomType: pick(TEXT.roomType, p.roomType, G.roomType.default),
    size: pick(TEXT.size, p.size, G.size.default),
    style: pick(TEXT.style, p.style, G.style.default),
    palette: pick(TEXT.palette, p.palette, G.palette.default),
    walls: pick(TEXT.walls, p.walls, G.walls.default),
    metal: pick(TEXT.metal, p.metal, G.metal.default),
    bathing: pick(TEXT.bathing, p.bathing, G.bathing.default),
    extras: pickMany(TEXT.extras, p.extras, 14),
    light: pickMany(TEXT.light, p.light, 5),
    budget: pick(TEXT.budget, p.budget, G.budget.default),
  };
  // Варианты, которые не помещаются по площади, убираем.
  const fits = (group, id) => {
    const item = G[group].items.find((x) => x.id === id);
    return item ? OPTIONS.sizeAllows(item.minSize, params.size) : false;
  };
  if (!fits('bathing', params.bathing)) params.bathing = 'auto';
  if (params.bathing === 'none' && params.roomType !== 'wc') params.bathing = 'auto';
  params.extras = params.extras.filter((id) => id === 'auto' || fits('extras', id));
  if (params.roomType === 'wc') {
    params.bathing = 'none';
    params.extras = params.extras.filter((id) => !['washtower', 'bench', 'niche'].includes(id));
  }
  if (!params.extras.length) params.extras = ['auto'];
  return params;
}

/**
 * Стиль конкретного варианта: при «Подберём сами» — свой у каждого.
 * offset — сквозной номер первого варианта генерации минус 1: следующая генерация того же человека
 * продолжает список стилей, а не повторяет его.
 */
function styleFor(params, index, offset = 0) {
  return params.style === 'auto' ? OPTIONS.autoStyleAt(index, offset) : params.style;
}

function configuration(params, index = 0, withPhoto = false, offset = 0) {
  const room =
    params.roomType === 'auto'
      ? withPhoto
        ? 'the same type of room as in the photo (bathroom, combined bathroom and toilet, or toilet room)'
        : 'a combined bathroom and toilet room'
      : TEXT.roomType[params.roomType];
  const size =
    params.size === 'auto'
      ? withPhoto
        ? 'the same size as in the photo'
        : 'small, about 4 m², typical for Russian apartment buildings'
      : TEXT.size[params.size];
  const bathing =
    params.bathing === 'auto'
      ? withPhoto
        ? 'the bathing option that fits this room best (keep a bathtub if the room is narrow and there is one now, otherwise a bathtub or a walk-in shower)'
        : 'a bathtub or a walk-in shower, whichever fits the room best'
      : TEXT.bathing[params.bathing];
  const lines = [
    `- Room: ${room}, ${size}.`,
    `- Style: ${TEXT.style[styleFor(params, index, offset)]}.`,
    `- Colours: ${TEXT.palette[params.palette]}.`,
  ];
  if (TEXT.walls[params.walls]) lines.push(`- Walls: ${TEXT.walls[params.walls]}.`);
  if (TEXT.metal[params.metal]) lines.push(`- Fixtures finish: ${TEXT.metal[params.metal]}.`);
  lines.push(`- Bathing: ${bathing}.`);
  const extras = params.extras.map((id) => TEXT.extras[id]);
  const explicit = !params.extras.includes('auto');
  if (explicit && params.roomType !== 'bath' && !params.extras.includes('installation')) extras.push('a standard floor-standing toilet');
  if (extras.length) lines.push(`- ${explicit ? 'Must include' : 'Furnishing'}: ${extras.join('; ')}.`);
  lines.push(`- Lighting: ${params.light.map((id) => TEXT.light[id]).join('; ')}.`);
  lines.push(`- Finish level: ${TEXT.budget[params.budget]}.`);
  return lines.join('\n');
}

/**
 * @param {object} params   параметры после sanitizeParams
 * @param {number} index    номер варианта в генерации, с нуля
 * @param {object} ctx      { withPhoto, room (анализ фото на английском), wishes (проверенные пожелания на английском),
 *                            offset (сколько вариантов у человека было раньше — для «Подберём сами») }
 */
function buildPrompt(params, index, ctx = {}) {
  const v = params.style === 'auto' ? AUTO_STYLE_VARIANT : VARIANTS[index % VARIANTS.length];
  const parts = [];
  if (ctx.withPhoto) {
    parts.push(`TASK: photorealistic renovation of the bathroom shown in the input photo. The result must be the same room after a complete renovation.`);
    parts.push(`KEEP FROM THE PHOTO (do not change): room shape and size, wall positions, door and window positions and sizes, ceiling height, positions of risers, pipe boxing and drains where visible, camera position, lens and viewing angle.`);
    if (ctx.room) parts.push(`Room analysis of the photo: ${ctx.room}`);
    parts.push(`Replace all finishes, furniture, sanitary ware and lighting according to the client configuration.`);
  } else {
    parts.push(`TASK: photorealistic photo of a newly renovated bathroom in a typical apartment. Show the room from the doorway so the layout is clear.`);
  }
  parts.push(`CLIENT CONFIGURATION (explicit choices override style defaults; where the client left the choice to us, pick what suits the room and style best):\n${configuration(params, index, ctx.withPhoto, ctx.offset || 0)}`);
  if (ctx.wishes) parts.push(`CLIENT WISHES (apply only what concerns bathroom finishes, fixtures, furniture, lighting and colours): ${ctx.wishes}`);
  parts.push(v);
  parts.push(REALISM);
  parts.push(PHOTO);
  parts.push(FORBIDDEN);
  return parts.join('\n\n');
}

function variantLabel(index, params, offset = 0) {
  return OPTIONS.variantLabel(index, params ? params.style : null, offset);
}

module.exports = { TEXT, VARIANTS, sanitizeParams, buildPrompt, variantLabel, configuration, styleFor };

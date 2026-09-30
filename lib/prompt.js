/*
 * Сборка промпта для gpt-image-2.
 * Промпт на английском: модель точнее понимает английские описания.
 * Клиент не может передать свой текст — только id из списка ниже,
 * поэтому нарисовать что-то постороннее через сайт нельзя.
 */

const TEXT = {
  size: {
    small:
      'a compact combined bathroom and toilet of about 3.5 m² (roughly 2.0 x 1.7 m), typical for Russian apartment buildings; everything must fit without looking cramped',
    medium: 'a bathroom of about 5 m² (roughly 2.5 x 2.0 m)',
    large: 'a spacious bathroom of about 7–8 m² (roughly 3.2 x 2.4 m)',
  },
  style: {
    minimal:
      'minimalist style: clean flat surfaces, handleless furniture, few objects, calm uniform materials',
    scandi:
      'Scandinavian style: light oak-look wood, white glazed metro tiles 7.5x30 cm, simple forms, soft daylight feel',
    loft:
      'loft style: brick-look or concrete-look porcelain tiles on one accent wall, black metal fixtures and profiles, industrial but tidy',
    classic:
      'modern classic style: tile wainscoting to mid-wall height, marble-look porcelain, vanity with framed doors, polished fixtures',
    eco: 'natural eco style: wood-look porcelain planks, stone-look tiles, matte finishes, one small potted plant',
  },
  palette: {
    light: 'white, light grey and warm white',
    beige: 'sand, beige and warm taupe',
    dark: 'graphite, anthracite and dark grey with warm light',
    contrast: 'contrasting white and black with grey accents',
    green: 'sage green, soft grey-green and white',
  },
  fixture: {
    bath: 'a standard 170x70 cm rectangular bathtub built in along the wall with a tiled front panel and a wall-mounted mixer with hand shower',
    enclosure:
      'a corner shower enclosure with a low shower tray and clear glass doors with visible metal profiles and hinges',
    walkin:
      'a walk-in shower without a tray: tiled floor gently sloped to a linear floor drain, one fixed clear glass panel with a visible wall profile, overhead rain shower and hand shower',
  },
  extras: {
    vanity: 'a floor-standing or wall-mounted vanity cabinet with an integrated washbasin and a visible siphon under it or inside the cabinet',
    installation:
      'a wall-hung toilet mounted on a concealed installation frame, with the flush plate visible on the boxed-in wall above it',
    towel: 'a heated towel rail mounted on the wall',
    washer: 'a front-loading washing machine placed under a countertop, with the countertop continuing from the vanity',
    ledmirror: 'a rectangular mirror with built-in LED backlight above the washbasin',
    niche: 'a built-in tiled niche for shampoo in the shower area',
  },
  budget: {
    economy:
      'budget finish: ceramic tiles 30x60 cm, white acrylic sanitary ware, chrome fixtures, laminated furniture, simple ceiling spotlights',
    comfort:
      'mid-range finish: porcelain stoneware tiles 60x60 and 60x120 cm, matte black or chrome fixtures, furniture with drawers, recessed spotlights',
    premium:
      'premium finish: large-format porcelain tiles 60x120 and 120x120 cm with minimal grout lines, concealed built-in mixers, LED strip lighting in niches, brushed brass or gunmetal fixtures',
  },
};

// Пять разных подач, чтобы варианты не были похожи друг на друга.
const VARIANTS_ROOM = [
  { label: 'Общий вид от двери', text: 'Wide view from the doorway showing the whole room.' },
  { label: 'Зона раковины', text: 'View focused on the washbasin, mirror and storage area, the rest of the room partly visible.' },
  { label: 'Зона купания', text: 'View focused on the bathing or shower area with its tiling and fixtures.' },
  { label: 'Акцентная стена', text: 'Alternative design: one wall finished with a contrasting accent tile, the other walls calm. Wide view.' },
  { label: 'Вечерний свет', text: 'Same kind of room in the evening: spotlights and mirror light on, warm cosy light. Wide view.' },
];

const VARIANTS_PHOTO = [
  { label: 'Основной вариант', text: 'Design option A.' },
  { label: 'Другая раскладка плитки', text: 'Design option B with a different tile layout.' },
  { label: 'Акцентная стена', text: 'Design option C with a contrasting accent wall.' },
  { label: 'Другая мебель', text: 'Design option D with a different furniture finish.' },
  { label: 'Вечерний свет', text: 'Design option E, evening lighting with spotlights and mirror light on.' },
];

const REALISM = `
Everything shown must be buildable by an ordinary renovation crew using materials sold in large home improvement stores:
- walls and floor in standard rectangular ceramic or porcelain tiles in common formats, laid in straight rows with thin visible grout lines; walls straight, corners at right angles;
- only standard off-the-shelf sanitary ware, furniture and fixtures of ordinary shapes and realistic sizes;
- every object either stands on the floor or is visibly mounted to a wall; mixers and shower heads are connected to the wall; drains are where they logically should be;
- ceiling: white stretch ceiling or painted moisture-resistant drywall with recessed spotlights, ceiling height about 2.6–2.7 m;
- a ventilation grille on the wall or ceiling, a door to the room where appropriate;
- mirrors reflect the opposite side of the room realistically.
Photorealistic interior photograph of a finished renovation, shot with a 20 mm lens at eye level, natural colours, sharp focus, realistic light.
No people, no text, no logos, no watermarks, no fantasy elements.`.trim();

function pick(map, id, fallback) {
  return Object.prototype.hasOwnProperty.call(map, id) ? id : fallback;
}

/** Проверяет присланные параметры: всё, чего нет в списке, отбрасывается. */
function sanitizeParams(raw) {
  const p = raw || {};
  let extras = Array.isArray(p.extras) ? p.extras : typeof p.extras === 'string' ? p.extras.split(',') : [];
  extras = [...new Set(extras.map(String))].filter((id) => TEXT.extras[id]).slice(0, 6);
  return {
    size: pick(TEXT.size, p.size, 'medium'),
    style: pick(TEXT.style, p.style, 'minimal'),
    palette: pick(TEXT.palette, p.palette, 'light'),
    fixture: pick(TEXT.fixture, p.fixture, 'bath'),
    budget: pick(TEXT.budget, p.budget, 'comfort'),
    extras,
  };
}

function describe(params) {
  const extras = params.extras.map((id) => TEXT.extras[id]);
  // Если выбрана инсталляция, унитаз уже описан; иначе нужен обычный напольный.
  if (!params.extras.includes('installation')) extras.push('a standard floor-standing toilet');
  return [
    `Room: ${TEXT.size[params.size]}.`,
    `Style: ${TEXT.style[params.style]}.`,
    `Colours: ${TEXT.palette[params.palette]}.`,
    `Bathing: ${TEXT.fixture[params.fixture]}.`,
    `Also in the room: ${extras.join('; ')}.`,
    `Finish level: ${TEXT.budget[params.budget]}.`,
  ].join('\n');
}

/** Промпт для генерации «с нуля». index — номер варианта (0–4). */
function buildPrompt(params, index) {
  const v = VARIANTS_ROOM[index % VARIANTS_ROOM.length];
  return `Bathroom renovation design.\n${describe(params)}\n\n${v.text}\n\n${REALISM}`;
}

/** Промпт для переделки фото клиента. */
function buildEditPrompt(params, index) {
  const v = VARIANTS_PHOTO[index % VARIANTS_PHOTO.length];
  return `Renovate the bathroom in this photo.
Keep the room exactly as it is: same walls, room size and proportions, door and window positions, ceiling height, pipe and drain positions where visible, and the same camera viewpoint.
Replace all finishes, furniture and sanitary ware according to this brief:
${describe(params)}

${v.text}

${REALISM}`;
}

function variantLabel(index, withPhoto) {
  const list = withPhoto ? VARIANTS_PHOTO : VARIANTS_ROOM;
  return list[index % list.length].label;
}

module.exports = { TEXT, sanitizeParams, buildPrompt, buildEditPrompt, variantLabel };

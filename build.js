const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SITE_NAME = 'Second Helping';
const SITE_URL = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  ''
).replace(/\/$/, '');
const SITE_TAGLINE = 'Eight American classics, worth going back for.';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';

const CATEGORIES = [
  { slug: 'breakfast', name: 'Breakfast', blurb: 'Weekend cooking worth getting up for: a tall stack of buttermilk pancakes, and flaky biscuits under peppery sausage gravy.' },
  { slug: 'mains', name: 'Mains', blurb: 'Two dinners built on crust — beef smashed onto screaming-hot steel, and chicken brined overnight and fried in a Dutch oven.' },
  { slug: 'bbq-and-sides', name: 'BBQ & Sides', blurb: 'Ribs cooked low in the oven and finished over live fire, and the baked macaroni that belongs beside them.' },
  { slug: 'desserts', name: 'Desserts', blurb: 'The two American bakes worth getting right: a double-crust apple pie, and a tall cheesecake cooled slowly so the top never cracks.' }
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const FRACTIONS = [
  [0, ''], [0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'], [0.375, '⅜'],
  [0.5, '½'], [0.625, '⅝'], [0.667, '⅔'], [0.75, '¾'], [0.875, '⅞'], [1, '']
];

/* ---------- frontmatter + markdown ---------- */

function unquote(value) {
  const trimmed = value.trim();
  if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('missing frontmatter');
  const data = {};
  let listKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!pair) continue;
    const key = pair[1];
    const value = pair[2].trim();
    if (value === '') {
      listKey = key;
      data[key] = [];
      continue;
    }
    listKey = null;
    data[key] = /^\[.*\]$/.test(value)
      ? value.slice(1, -1).split(',').map((part) => unquote(part)).filter(Boolean)
      : unquote(value);
  }
  return { data, body: match[2] };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function markdown(source) {
  const out = [];
  let paragraph = [];
  let listType = null;

  function closeParagraph() {
    if (!paragraph.length) return;
    out.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  }
  function closeList() {
    if (!listType) return;
    out.push(`</${listType}>`);
    listType = null;
  }
  function openList(type) {
    if (listType === type) return;
    closeList();
    out.push(`<${type}>`);
    listType = type;
  }

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeParagraph();
      closeList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = Math.min(6, Math.max(2, heading[1].length));
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^(?:---|\*\*\*)$/.test(trimmed)) {
      closeParagraph();
      closeList();
      out.push('<hr>');
      continue;
    }
    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      closeParagraph();
      openList('ul');
      out.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      closeParagraph();
      openList('ol');
      out.push(`<li>${inlineMarkdown(numbered[1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(trimmed);
  }
  closeParagraph();
  closeList();
  return out.join('\n');
}

/* ---------- formatting helpers ---------- */

function formatAmount(value) {
  if (!isFinite(value) || value <= 0) return '';
  if (value < 0.0625) return String(Math.round(value * 1000) / 1000);
  let whole = Math.floor(value);
  const frac = value - whole;
  let best = null;
  for (const [amount, glyph] of FRACTIONS) {
    const diff = Math.abs(amount - frac);
    if (!best || diff < best.diff) best = { diff, amount, glyph };
  }
  if (best.diff > 0.04) return String(Math.round(value * 100) / 100);
  if (best.amount === 1) whole += 1;
  const glyph = best.amount === 1 ? '' : best.glyph;
  if (whole === 0) return glyph || '0';
  return glyph ? `${whole} ${glyph}` : String(whole);
}

function formatMinutes(minutes) {
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours && rest) return `${hours} hr ${rest} min`;
  if (hours) return `${hours} hr`;
  return `${rest} min`;
}

function isoDuration(minutes) {
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return `PT${hours ? hours + 'H' : ''}${rest || !hours ? rest + 'M' : ''}`;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function fill(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

/* ---------- data ---------- */

const templates = {};
for (const name of ['home', 'list', 'recipe', 'category', 'page']) {
  templates[name] = fs.readFileSync(path.join(ROOT, 'templates', `${name}.html`), 'utf8');
}

const creditsPath = path.join(ROOT, 'assets', 'images', 'credits.json');
const credits = fs.existsSync(creditsPath) ? JSON.parse(fs.readFileSync(creditsPath, 'utf8')) : {};

const categoryBySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));

const recipes = fs.readdirSync(path.join(ROOT, 'recipes'))
  .filter((file) => file.endsWith('.md'))
  .map((file) => {
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(ROOT, 'recipes', file), 'utf8'));
    const category = categoryBySlug.get(data.category);
    if (!category) throw new Error(`${file}: unknown category "${data.category}"`);
    const credit = credits[data.slug] || {};
    const prep = Number(data.prepMinutes);
    const cook = Number(data.cookMinutes);
    return {
      ...data,
      tags: data.tags || [],
      servings: Number(data.servings),
      prepMinutes: prep,
      cookMinutes: cook,
      totalMinutes: prep + cook,
      category,
      imageFile: credit.file || data.image,
      credit,
      bodyHtml: markdown(body),
      ingredientList: (data.ingredients || []).map((raw) => {
        const [amount, unit, item, note] = raw.split('|').map((part) => part.trim());
        return { amount, unit, item, note, value: parseFloat(amount) };
      })
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

const bySlug = new Map(recipes.map((r) => [r.slug, r]));
const FEATURED = ['smash-burgers', 'baby-back-ribs', 'biscuits-and-sausage-gravy']
  .map((slug) => bySlug.get(slug))
  .filter(Boolean);
const HERO = bySlug.get('apple-pie') || recipes[0];

/* ---------- fragments ---------- */

const PLATE_MARK = '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" focusable="false">' +
  '<circle cx="13" cy="13" r="12.5" fill="#f6f4f1"/>' +
  '<circle cx="13" cy="13" r="9" fill="none" stroke="#c8372d" stroke-width="1.4"/>' +
  '<circle cx="13" cy="13" r="5.5" fill="#c8372d"/></svg>';

function header(base, active) {
  const links = [{ href: `${base}recipes.html`, label: 'Recipes', key: 'recipes' }]
    .concat(CATEGORIES.map((c) => ({ href: `${base}categories/${c.slug}.html`, label: c.name, key: c.slug })))
    .concat([{ href: `${base}about.html`, label: 'About', key: 'about' }]);

  const items = links.map((link) => {
    const current = link.key === active ? ' aria-current="page"' : '';
    return `<li><a href="${link.href}"${current}>${escapeHtml(link.label)}</a></li>`;
  }).join('');

  return `<header class="site-header" data-header>
  <div class="wrap site-header__inner">
    <a class="brand" href="${base}index.html">${PLATE_MARK}Second Helping</a>
    <button type="button" class="nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="site-nav" hidden>
      <span class="nav-toggle__bars" aria-hidden="true"></span><span data-nav-toggle-label>Menu</span>
    </button>
    <nav class="site-nav" id="site-nav" data-nav aria-label="Main">
      <ul>${items}</ul>
    </nav>
  </div>
</header>`;
}

function footer(base) {
  const categoryLinks = CATEGORIES
    .map((c) => `<li><a href="${base}categories/${c.slug}.html">${escapeHtml(c.name)}</a></li>`)
    .join('');
  const recipeLinks = recipes.slice(0, 4)
    .map((r) => `<li><a href="${base}recipes/${r.slug}.html">${escapeHtml(r.title)}</a></li>`)
    .join('');

  return `<footer class="site-footer">
  <div class="wrap">
    <div class="site-footer__grid">
      <div>
        <a class="brand" href="${base}index.html">${PLATE_MARK}Second Helping</a>
        <p style="margin-top: var(--s-4)">Eight classic American dishes, each written out with the technique and the reasoning that most recipes leave out.</p>
      </div>
      <div>
        <h2>Courses</h2>
        <ul>${categoryLinks}</ul>
      </div>
      <div>
        <h2>Recipes</h2>
        <ul>${recipeLinks}<li><a href="${base}recipes.html">See all ${recipes.length}</a></li></ul>
      </div>
    </div>
    <p class="site-footer__note">Photographs are openly licensed and credited in full on the <a href="${base}about.html">about page</a>.</p>
  </div>
</footer>`;
}

function card(recipe, base, eager) {
  const search = [recipe.title, ...recipe.tags, recipe.category.name, recipe.difficulty]
    .concat(recipe.ingredientList.map((ing) => ing.item))
    .join(' ')
    .toLowerCase();
  return `<article class="card" data-recipe-card data-category="${recipe.category.slug}" data-difficulty="${recipe.difficulty}" data-search="${escapeHtml(search)}">
  <a class="card__media" href="${base}recipes/${recipe.slug}.html" tabindex="-1" aria-hidden="true">
    <img src="${base}assets/images/${recipe.imageFile}" alt="" width="600" height="450"${eager ? '' : ' loading="lazy"'}>
  </a>
  <p class="card__kicker">${escapeHtml(recipe.category.name)}</p>
  <h3 class="card__title"><a href="${base}recipes/${recipe.slug}.html">${escapeHtml(recipe.title)}</a></h3>
  <p class="card__desc">${escapeHtml(recipe.description)}</p>
  <p class="card__facts">
    <span>${formatMinutes(recipe.totalMinutes)}</span>
    <span>Serves ${recipe.servings}</span>
    <span><span class="dot dot--${recipe.difficulty}" aria-hidden="true"></span>${titleCase(recipe.difficulty)}</span>
  </p>
</article>`;
}

function tile(category, base) {
  const inCategory = recipes.filter((r) => r.category.slug === category.slug);
  const image = inCategory[0] ? inCategory[0].imageFile : '';
  return `<a class="tile" href="${base}categories/${category.slug}.html">
  <img src="${base}assets/images/${image}" alt="" width="400" height="300" loading="lazy">
  <span class="tile__label">
    <strong>${escapeHtml(category.name)}</strong>
    <span>${inCategory.length} recipe${inCategory.length === 1 ? '' : 's'}</span>
  </span>
</a>`;
}

function fare(base) {
  const groups = CATEGORIES.map((category) => {
    const items = recipes
      .filter((r) => r.category.slug === category.slug)
      .map((recipe) => `<li><a href="${base}recipes/${recipe.slug}.html">
              <span class="fare__name">${escapeHtml(recipe.title)}</span>
              <span class="fare__time">${formatMinutes(recipe.totalMinutes)}</span>
            </a></li>`)
      .join('\n            ');
    return `<div>
          <h3 class="fare__course">${escapeHtml(category.name)}</h3>
          <ul class="fare">
            ${items}
          </ul>
        </div>`;
  }).join('\n        ');
  return `<div class="fare-groups">
        ${groups}
      </div>`;
}

function chips(group, options) {
  return options.map((option, index) => (
    `<button type="button" class="chip" data-filter-group="${group}" data-filter-value="${option.value}" aria-pressed="${index === 0}">${escapeHtml(option.label)}</button>`
  )).join('\n            ');
}

function ogImage(recipe, base) {
  const file = recipe ? recipe.imageFile : HERO.imageFile;
  return SITE_URL
    ? `${SITE_URL.replace(/\/$/, '')}/assets/images/${file}`
    : `${base}assets/images/${file}`;
}

function creditLine(recipe) {
  const credit = recipe.credit || {};
  if (credit.placeholder || !credit.source) {
    return `Illustration generated for ${escapeHtml(recipe.title)} &mdash; no openly licensed photograph was available when this page was built.`;
  }
  const license = credit.licenseUrl
    ? `<a href="${escapeHtml(credit.licenseUrl)}" rel="license noopener" target="_blank">CC ${escapeHtml(credit.license)}</a>`
    : `CC ${escapeHtml(credit.license)}`;
  return `Photograph &ldquo;${escapeHtml(credit.title)}&rdquo; by ${escapeHtml(credit.creator)}, ${license}. <a href="${escapeHtml(credit.source)}" rel="noopener" target="_blank">Source</a>, found through Openverse.`;
}

function write(relativePath, html) {
  const target = path.join(DIST, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

/* ---------- pages ---------- */

function buildHome() {
  const base = '';
  write('index.html', fill(templates.home, {
    BASE: base,
    OG_TYPE: 'website',
    PAGE_TITLE: `${SITE_NAME} — American classics, done right`,
    META_DESCRIPTION: 'Eight classic American recipes with real quantities, genuine technique and the reasoning behind every step: buttermilk pancakes, biscuits and gravy, smash burgers, fried chicken, baby back ribs, mac and cheese, apple pie and New York cheesecake.',
    OG_TITLE: SITE_NAME,
    OG_IMAGE: ogImage(null, base),
    HEADER: header(base, 'home'),
    FOOTER: footer(base),
    RECIPE_COUNT: recipes.length,
    HERO_IMAGE: HERO.imageFile,
    HERO_ALT: escapeHtml(`${HERO.title}: ${HERO.description}`),
    HERO_CAPTION: `<a href="recipes/${HERO.slug}.html">${escapeHtml(HERO.title)}</a> &mdash; ${formatMinutes(HERO.totalMinutes)}, serves ${HERO.servings}`,
    FARE: fare(base),
    FEATURED_CARDS: FEATURED.map((r) => card(r, base, false)).join('\n        '),
    CATEGORY_TILES: CATEGORIES.map((c) => tile(c, base)).join('\n        '),
    ALL_CARDS: recipes.map((r) => card(r, base, false)).join('\n        ')
  }));
}

function buildList() {
  const base = '';
  write('recipes.html', fill(templates.list, {
    BASE: base,
    OG_TYPE: 'website',
    PAGE_TITLE: `Every recipe — ${SITE_NAME}`,
    META_DESCRIPTION: 'Search and filter all eight American classics by course and difficulty — breakfast, mains, barbecue and sides, and desserts.',
    OG_TITLE: `Every recipe — ${SITE_NAME}`,
    OG_IMAGE: ogImage(null, base),
    HEADER: header(base, 'recipes'),
    FOOTER: footer(base),
    RECIPE_COUNT: recipes.length,
    CATEGORY_CHIPS: chips('category', [{ value: 'all', label: 'All' }].concat(
      CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))
    )),
    DIFFICULTY_CHIPS: chips('difficulty', [{ value: 'all', label: 'All' }].concat(
      DIFFICULTIES.map((d) => ({ value: d, label: titleCase(d) }))
    )),
    ALL_CARDS: recipes.map((r, i) => card(r, base, i < 3)).join('\n        ')
  }));
}

function buildRecipe(recipe) {
  const base = '../';
  const related = recipes
    .filter((r) => r.slug !== recipe.slug && r.category.slug === recipe.category.slug)
    .concat(recipes.filter((r) => r.slug !== recipe.slug && r.category.slug !== recipe.category.slug))
    .slice(0, 3);

  const ingredients = recipe.ingredientList.map((ing) => {
    const amount = isFinite(ing.value) && ing.value > 0
      ? `<span class="amount" data-base-amount="${ing.value}">${formatAmount(ing.value)}</span> `
      : '';
    const unit = ing.unit ? `${escapeHtml(ing.unit)} ` : '';
    const note = ing.note ? `<span class="note">${escapeHtml(ing.note)}</span>` : '';
    return `<li>${amount}${unit}${escapeHtml(ing.item)}${note}</li>`;
  }).join('\n          ');

  const steps = recipe.steps.map((step) => (
    `<li><label><input type="checkbox"><span class="step-text">${escapeHtml(step)}</span></label></li>`
  )).join('\n            ');

  const imageUrl = SITE_URL
    ? `${SITE_URL.replace(/\/$/, '')}/assets/images/${recipe.imageFile}`
    : `${base}assets/images/${recipe.imageFile}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    description: recipe.description,
    image: [imageUrl],
    author: { '@type': 'Organization', name: SITE_NAME },
    recipeCategory: recipe.category.name,
    recipeCuisine: 'American',
    keywords: recipe.tags.join(', '),
    prepTime: isoDuration(recipe.prepMinutes),
    cookTime: isoDuration(recipe.cookMinutes),
    totalTime: isoDuration(recipe.totalMinutes),
    recipeYield: `${recipe.servings} servings`,
    recipeIngredient: recipe.ingredientList.map((ing) => (
      [ing.amount, ing.unit, ing.item, ing.note && `(${ing.note})`].filter(Boolean).join(' ')
    )),
    recipeInstructions: recipe.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text: step
    }))
  };

  write(`recipes/${recipe.slug}.html`, fill(templates.recipe, {
    BASE: base,
    OG_TYPE: 'article',
    PAGE_TITLE: `${recipe.title} — ${SITE_NAME}`,
    META_DESCRIPTION: recipe.description,
    OG_TITLE: recipe.title,
    OG_IMAGE: ogImage(recipe, base),
    HEADER: header(base, recipe.category.slug),
    FOOTER: footer(base),
    JSON_LD: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
    CATEGORY_SLUG: recipe.category.slug,
    CATEGORY_NAME: escapeHtml(recipe.category.name),
    RECIPE_TITLE: escapeHtml(recipe.title),
    RECIPE_DESCRIPTION: escapeHtml(recipe.description),
    IMAGE_FILE: recipe.imageFile,
    IMAGE_ALT: escapeHtml(`${recipe.title}: ${recipe.description}`),
    IMAGE_CREDIT: creditLine(recipe),
    PREP: formatMinutes(recipe.prepMinutes),
    COOK: formatMinutes(recipe.cookMinutes),
    TOTAL: formatMinutes(recipe.totalMinutes),
    SERVINGS: `${recipe.servings} servings`,
    SERVINGS_NUMBER: recipe.servings,
    DIFFICULTY: titleCase(recipe.difficulty),
    INGREDIENTS: ingredients,
    STEPS: steps,
    BODY: recipe.bodyHtml,
    RELATED_CARDS: related.map((r) => card(r, base, false)).join('\n        ')
  }));
}

function buildCategory(category) {
  const base = '../';
  const inCategory = recipes.filter((r) => r.category.slug === category.slug);
  write(`categories/${category.slug}.html`, fill(templates.category, {
    BASE: base,
    OG_TYPE: 'website',
    PAGE_TITLE: `${category.name} — ${SITE_NAME}`,
    META_DESCRIPTION: `${category.blurb} ${inCategory.map((r) => r.title).join(' and ')}.`,
    OG_TITLE: `${category.name} — ${SITE_NAME}`,
    OG_IMAGE: ogImage(inCategory[0], base),
    HEADER: header(base, category.slug),
    FOOTER: footer(base),
    CATEGORY_NAME: escapeHtml(category.name),
    CATEGORY_BLURB: escapeHtml(category.blurb),
    CATEGORY_CARDS: inCategory.map((r, i) => card(r, base, i === 0)).join('\n        '),
    OTHER_TILES: CATEGORIES.filter((c) => c.slug !== category.slug).map((c) => tile(c, base)).join('\n        ')
  }));
}

function buildAbout() {
  const base = '';
  const list = recipes.map((recipe) => (
    `<li><strong>${escapeHtml(recipe.title)}</strong>${creditLine(recipe)}</li>`
  )).join('\n          ');

  const corrections = CONTACT_EMAIL ? `
        <h2>Corrections</h2>
        <p>If a step does not work the way it is written, or a quantity looks wrong, say so: <a href="mailto:${escapeHtml(CONTACT_EMAIL)}">${escapeHtml(CONTACT_EMAIL)}</a>. Corrections are made to the recipe itself rather than buried in a comment thread.</p>` : '';

  const content = `<div class="prose">
        <p class="lede">Eight American classics, written out in full &mdash; with the technique and the reasoning that most recipes leave out.</p>

        <p>${SITE_NAME} is deliberately small. Eight dishes across four courses and nothing else: pancakes and biscuits for the morning, smash burgers and fried chicken for dinner, ribs and baked macaroni for the middle of the table, apple pie and cheesecake for afterwards. Each one is written out completely, the way a cook would explain it to someone standing next to them.</p>

        <h2>How these recipes are written</h2>
        <p>Every recipe follows one rule: a step has to tell you what to look for, not only how long to wait. Timings depend on your pan, your oven, your altitude and the water in your butter. Cues do not.</p>
        <ul>
          <li><strong>Doneness is a cue, not a clock.</strong> Pancakes are ready to turn when the edges go matte and the bubbles stay open. Ribs are done when the rack bends to a deep arch and the surface cracks across the top. A cheesecake comes out of the oven while the middle still wobbles as a single piece.</li>
          <li><strong>The reason is part of the step.</strong> You press a biscuit cutter straight down because twisting seals the layers shut. The cheese goes into the sauce off the heat because above about 170&deg;F the proteins tighten and the sauce breaks.</li>
          <li><strong>Ingredients are listed the way you will use them.</strong> Butter frozen solid, buttermilk cold and well shaken, apples peeled and sliced a quarter inch thick. The preparation is part of the measurement.</li>
          <li><strong>Nothing vague.</strong> No &ldquo;cook until done&rdquo;, and no &ldquo;season to taste&rdquo; standing in for an amount.</li>
        </ul>

        <h2>What the difficulty ratings mean</h2>
        <ul>
          <li><strong>Easy.</strong> One main technique, no special equipment, and forgiving of small mistakes &mdash; pancakes, smash burgers, baked macaroni.</li>
          <li><strong>Medium.</strong> One moment that needs your full attention: a roux that must not brown, butter that has to stay cold, a rack of ribs that has to be tested by hand instead of by the clock.</li>
          <li><strong>Hard.</strong> A thermometer is not optional and there is a real way to fail &mdash; oil that drifts out of range, a cheesecake that cracks, a pie with a raw bottom crust.</li>
        </ul>

        <h2>Using the site</h2>
        <ul>
          <li><strong>Servings.</strong> The stepper on each recipe rescales every ingredient amount. It deliberately does not touch the timings or the pan size &mdash; double a cake and you need a bigger tin and longer in the oven, and no recipe can work that out for you.</li>
          <li><strong>Keeping your place.</strong> Tick a step to strike it through. The ticks clear when you close the page; nothing is saved and nothing is sent anywhere.</li>
          <li><strong>Printing.</strong> Recipes print as ingredients and method. The navigation, the related recipes and the photograph are dropped to save ink, and the photo credit is kept.</li>
        </ul>

        <h2>About the photographs</h2>
        <p>The photographs are openly licensed pictures of each dish taken by other cooks and photographers. They are not studio shots of these particular recipes, and they are here to show you what the finished dish looks like rather than to prove anything. Every one permits commercial use, is stored on this site rather than linked from someone else&rsquo;s server, and credits its photographer and license below.</p>
        <ul class="credits-list">
          ${list}
        </ul>${corrections}
      </div>`;

  write('about.html', fill(templates.page, {
    BASE: base,
    OG_TYPE: 'website',
    PAGE_TITLE: `About — ${SITE_NAME}`,
    META_DESCRIPTION: 'How these eight American recipes are written — doneness by cue rather than by timer — what the difficulty ratings mean, and full credit for every photograph.',
    OG_TITLE: `About — ${SITE_NAME}`,
    OG_IMAGE: ogImage(null, base),
    HEADER: header(base, 'about'),
    FOOTER: footer(base),
    HEADING: 'About',
    CONTENT: content
  }));
}

function build404() {
  const base = '';
  const content = `<div class="prose">
        <p class="lede">We could not find that page. The link may be out of date, or the recipe may be filed under a different name.</p>
        <p><a class="btn" href="${base}recipes.html">See every recipe</a></p>
      </div>
      <div class="section">
        <div class="section__head"><h2>Try one of these instead</h2></div>
        <div class="grid">
          ${FEATURED.map((r) => card(r, base, false)).join('\n          ')}
        </div>
      </div>`;

  write('404.html', fill(templates.page, {
    BASE: base,
    OG_TYPE: 'website',
    PAGE_TITLE: `Not found — ${SITE_NAME}`,
    META_DESCRIPTION: 'That page could not be found. Browse the full recipe index instead.',
    OG_TITLE: `Not found — ${SITE_NAME}`,
    OG_IMAGE: ogImage(null, base),
    HEADER: header(base, ''),
    FOOTER: footer(base),
    HEADING: 'Not found',
    CONTENT: content
  }));
}

/* ---------- run ---------- */

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));

buildHome();
buildList();
buildAbout();
build404();
for (const category of CATEGORIES) buildCategory(category);
for (const recipe of recipes) buildRecipe(recipe);

const pages = 4 + CATEGORIES.length + recipes.length;
console.log(`built ${pages} pages into dist/ (${recipes.length} recipes, ${CATEGORIES.length} categories)`);

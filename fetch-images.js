const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const RECIPES_DIR = path.join(ROOT, 'recipes');
const IMAGES_DIR = path.join(ROOT, 'assets', 'images');
const CREDITS_FILE = path.join(IMAGES_DIR, 'credits.json');
const API = 'https://api.openverse.org/v1/images/';
const UA = 'BluePlateSpecial/1.0 (static recipe site build script)';

const TARGETS = {
  'buttermilk-pancakes': {
    query: 'pancakes maple syrup breakfast stack',
    require: ['pancake'],
    boost: ['syrup', 'stack', 'butter', 'blueberry', 'griddle'],
    block: ['loco moco', 'rice', 'potato pancake', 'latke', 'okonomiyaki', 'crepe', 'dutch baby']
  },
  'biscuits-and-sausage-gravy': {
    query: 'biscuits and sausage gravy breakfast',
    require: ['biscuit'],
    boost: ['gravy', 'sausage', 'buttermilk', 'breakfast'],
    block: ['dog', 'cookie', 'tin', 'digestive']
  },
  'smash-burgers': {
    query: 'cheeseburger',
    require: ['burger'],
    boost: ['cheeseburger', 'smash', 'griddle', 'homemade', 'double'],
    block: ['burger king', 'mcdonald', 'wendy', 'in-n-out', 'five guys', 'whopper', 'fast food', 'wrapper', 'drive', 'veggie', 'vegan', 'impossible', 'beyond', 'turkey', 'chicken', 'fish', 'sign', 'restaurant']
  },
  'buttermilk-fried-chicken': {
    query: 'southern fried chicken crispy',
    require: ['fried chicken'],
    boost: ['crispy', 'buttermilk', 'southern', 'drumstick', 'platter', 'basket', 'waffle'],
    block: ['kfc', 'popeyes', 'chick-fil-a', 'sandwich', 'burger', 'nugget', 'sign', 'restaurant', 'karaage', 'schnitzel', 'rice', 'nasi', 'hainanese', 'cucumber', 'curry', 'korean', 'japanese', 'thai', 'chinese', 'noodle']
  },
  'baby-back-ribs': {
    query: 'barbecue pork ribs rack smoked',
    require: ['rib'],
    boost: ['barbecue', 'bbq', 'pork', 'rack', 'smoked', 'glazed'],
    block: ['beef rib', 'short rib', 'prime rib', 'rib eye', 'ribeye', 'sign', 'restaurant']
  },
  'mac-and-cheese': {
    query: 'baked macaroni and cheese casserole',
    require: ['macaroni', 'mac and cheese', 'mac & cheese'],
    boost: ['baked', 'cheese', 'casserole', 'creamy', 'breadcrumb'],
    block: ['salad', 'box', 'packet', 'kraft', 'raw', 'dry']
  },
  'apple-pie': {
    query: 'apple pie homemade lattice crust',
    require: ['apple pie'],
    boost: ['lattice', 'crust', 'homemade', 'slice', 'baked'],
    block: ['mcdonald', 'hostess', 'turnover', 'crumble', 'apple tree', 'cider']
  },
  'new-york-cheesecake': {
    query: 'cheesecake',
    require: ['cheesecake'],
    boost: ['new york', 'plain', 'slice', 'baked', 'creamy'],
    block: ['vegan', 'pumpkin', 'chocolate', 'raspberry', 'strawberry', 'oreo', 'no-bake', 'matcha', 'lemon']
  }
};

function readRecipes() {
  return fs.readdirSync(RECIPES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(RECIPES_DIR, f), 'utf8');
      const slug = (raw.match(/^slug:\s*(.+)$/m) || [])[1];
      const title = (raw.match(/^title:\s*(.+)$/m) || [])[1];
      return { slug: (slug || path.basename(f, '.md')).trim(), title: (title || '').trim() };
    });
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

function writePlaceholder(recipe) {
  const words = recipe.title.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > 16) {
      lines.push(current.trim());
      current = word;
    } else {
      current += ' ' + word;
    }
  }
  if (current.trim()) lines.push(current.trim());

  const tspans = lines
    .map((line, i) => `<tspan x="600" dy="${i === 0 ? 0 : 78}">${escapeXml(line)}</tspan>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800" role="img" aria-label="${escapeXml(recipe.title)}">
<rect width="1200" height="800" fill="#f6ece0"/>
<rect x="24" y="24" width="1152" height="752" fill="none" stroke="#9c2a13" stroke-width="6"/>
<circle cx="600" cy="300" r="120" fill="none" stroke="#b8801c" stroke-width="10"/>
<circle cx="600" cy="300" r="86" fill="none" stroke="#14584f" stroke-width="6"/>
<text x="600" y="${520 - (lines.length - 1) * 39}" text-anchor="middle" font-family="Georgia, serif" font-size="66" font-weight="700" fill="#23190f">${tspans}</text>
<text x="600" y="${650 + (lines.length - 1) * 39}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" letter-spacing="8" fill="#6e6154">BLUE PLATE SPECIAL</text>
</svg>`;

  const file = `${recipe.slug}.svg`;
  fs.writeFileSync(path.join(IMAGES_DIR, file), svg);
  return {
    file,
    title: recipe.title,
    creator: 'Blue Plate Special',
    license: 'Locally generated placeholder',
    licenseUrl: '',
    source: '',
    placeholder: true
  };
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`search returned ${res.status}`);
  return res.json();
}

async function download(url, destination) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000)
  });
  if (res.status !== 200) throw new Error(`image returned ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`unexpected content-type ${type}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 2048) throw new Error('image suspiciously small');
  fs.writeFileSync(destination, buffer);
}

function describe(hit) {
  const tags = (hit.tags || []).map((t) => (typeof t === 'string' ? t : t.name || '')).join(' ');
  return `${hit.title || ''} ${tags} ${hit.source || ''} ${hit.creator || ''}`.toLowerCase();
}

function score(hit, target) {
  const text = describe(hit);
  if (target.block.some((word) => text.includes(word))) return -1;
  if (!target.require.some((word) => text.includes(word))) return -1;

  let points = 100;
  for (const word of target.boost) if (text.includes(word)) points += 12;

  const width = Number(hit.width) || 0;
  const height = Number(hit.height) || 0;
  if (width && height) {
    const ratio = width / height;
    if (ratio < 0.6 || ratio > 2.2) return -1;
    if (ratio >= 1.2 && ratio <= 1.7) points += 30;
    else if (ratio > 1) points += 15;
    if (width >= 1600) points += 18;
    else if (width >= 1000) points += 10;
    else if (width < 640) points -= 30;
  }
  return points;
}

async function fetchOne(recipe) {
  const target = TARGETS[recipe.slug] || {
    query: recipe.slug.replace(/-/g, ' '),
    require: [recipe.slug.replace(/-/g, ' ')],
    boost: [],
    block: []
  };
  const url = `${API}?q=${encodeURIComponent(target.query)}&license_type=commercial&extension=jpg&page_size=20`;
  const data = await getJson(url);
  const results = (data && data.results) || [];
  if (!results.length) throw new Error('no results');

  const ranked = results
    .map((hit) => ({ hit, points: score(hit, target) }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points);
  if (!ranked.length) throw new Error(`no result matched "${target.require.join('/')}"`);

  let lastError = new Error('no downloadable result');
  for (const { hit } of ranked.slice(0, 8)) {
    const src = hit.url || hit.thumbnail;
    if (!src) continue;
    try {
      await download(src, path.join(IMAGES_DIR, `${recipe.slug}.jpg`));
      return {
        file: `${recipe.slug}.jpg`,
        title: hit.title || recipe.title,
        creator: hit.creator || 'Unknown',
        license: `${String(hit.license || 'cc').toUpperCase()}${hit.license_version ? ' ' + hit.license_version : ''}`,
        licenseUrl: hit.license_url || '',
        source: hit.foreign_landing_url || hit.detail_url || '',
        placeholder: false
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const only = process.argv.slice(2);
  const all = readRecipes();
  const recipes = only.length ? all.filter((r) => only.includes(r.slug)) : all;
  const credits = only.length && fs.existsSync(CREDITS_FILE)
    ? JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf8'))
    : {};

  for (const recipe of recipes) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    try {
      credits[recipe.slug] = await fetchOne(recipe);
      console.log(`ok       ${recipe.slug} -> ${credits[recipe.slug].file}`);
    } catch (error) {
      credits[recipe.slug] = writePlaceholder(recipe);
      console.log(`fallback ${recipe.slug} (${error.message}) -> ${credits[recipe.slug].file}`);
    }
  }

  fs.writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 2) + '\n');
  console.log(`\nwrote ${path.relative(ROOT, CREDITS_FILE)} (${Object.keys(credits).length} entries)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

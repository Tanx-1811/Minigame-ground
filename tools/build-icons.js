// Sinh public/js/icon-set.js - bo icon RIENG cua du an.
//
// Vi sao can: goi thang lucide tu CDN la keo ve 356KB chua 1799 icon, trong khi
// du an chi dung vai chuc cai. Moi lan chuyen trang admin la trinh duyet phai
// tai va phan tich lai tung do - day la phan nang nhat con lai sau khi da tach
// trang. File tu sinh o day chi chua dung nhung icon co mat trong ma nguon,
// nho hon khoang 20 lan va khong phu thuoc mang ben ngoai.
//
// Chay lai moi khi them icon moi:  npm run build:icons
// (script se bao neu co ten icon khong ton tai trong thu vien)

const fs = require('fs');
const path = require('path');
const https = require('https');

const LUCIDE_VERSION = '0.511.0';
const CDN = `https://cdn.jsdelivr.net/npm/lucide@${LUCIDE_VERSION}/dist/umd/lucide.min.js`;

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(PUBLIC, 'js', 'icon-set.js');

// Moi cach viet ten icon trong ma nguon deu phai duoc quet, neu khong icon se
// khong duoc dong goi va hien ra o trong tren trang.
const PATTERNS = [
  /data-lucide="([a-z0-9-]+)"/g,
  /data-lucide="\$\{[^}]*\?\s*'([a-z0-9-]+)'\s*:\s*'([a-z0-9-]+)'/g,
  /A\.icon\(\s*'([a-z0-9-]+)'/g,
  /A\.icon\([^)]*\?\s*'([a-z0-9-]+)'\s*:\s*'([a-z0-9-]+)'/g,
  /\bicon:\s*'([a-z0-9-]+)'/g,
  /Icons\.html\(\s*'([a-z0-9-]+)'/g,
];

// Ten icon duoc dung qua bien (bang tra cuu trong JS) - liet ke tay o day
const EXTRA = [
  'circle-check', 'circle-alert', 'triangle-alert', 'info', // toast
  'mars', 'venus', 'circle-help', // genderIcon()
  'sun', 'moon', 'eye', 'eye-off', 'shield-check', 'shield-off', // admin-common
  'lock', 'lock-open', 'rotate-cw', 'x', 'circle',
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(html|js)$/.test(entry.name) && entry.name !== 'icon-set.js') out.push(full);
  }
  return out;
}

function collectNames() {
  const names = new Set(EXTRA);
  for (const file of walk(PUBLIC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const re of PATTERNS) {
      for (const m of text.matchAll(re)) {
        if (m[1]) names.add(m[1]);
        if (m[2]) names.add(m[2]);
      }
    }
  }
  return [...names].sort();
}

function pascal(name) {
  return name.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return download(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} khi tai ${url}`));
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(body));
      })
      .on('error', reject);
  });
}

(async () => {
  console.log(`Tai thu vien lucide ${LUCIDE_VERSION}...`);
  const bundle = await download(CDN);

  // Chay bundle UMD trong mot pham vi gia de lay ra bang icon.
  // Bundle la UMD: uu tien gan vao module.exports neu co, khong thi gan vao `this`.
  const fakeWindow = {};
  const fakeModule = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', 'self', 'globalThis', 'exports', 'module', bundle).call(
    fakeWindow,
    fakeWindow,
    fakeWindow,
    fakeWindow,
    fakeModule.exports,
    fakeModule
  );

  const lucide = [fakeModule.exports, fakeWindow.lucide, fakeWindow].find((o) => o && o.icons);
  if (!lucide) throw new Error('Khong doc duoc bang icon tu bundle lucide');

  const names = collectNames();
  const missing = [];
  const picked = {};

  for (const name of names) {
    const node = lucide.icons[pascal(name)];
    if (!node) {
      missing.push(name);
      continue;
    }
    picked[pascal(name)] = node;
  }

  if (missing.length) {
    console.error('\nKHONG CO TRONG THU VIEN (kiem tra lai ten):');
    missing.forEach((n) => console.error('  - ' + n));
    process.exitCode = 1;
  }

  const header = `// FILE TU SINH - dung sua tay.
// Sinh boi tools/build-icons.js tu lucide ${LUCIDE_VERSION}.
// Chi chua ${Object.keys(picked).length} icon thuc su duoc dung trong du an.
// Them icon moi vao ma nguon roi chay lai:  npm run build:icons
`;
  const body = `window.lucide = window.lucide || {};\nwindow.lucide.icons = ${JSON.stringify(picked)};\n`;

  fs.writeFileSync(OUT, header + body, 'utf8');

  const kb = (n) => (n / 1024).toFixed(1) + 'KB';
  console.log(`\nDa ghi ${path.relative(ROOT, OUT)}`);
  console.log(`  ${Object.keys(picked).length} icon  |  ${kb(fs.statSync(OUT).size)}  (bundle day du: ${kb(bundle.length)})`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

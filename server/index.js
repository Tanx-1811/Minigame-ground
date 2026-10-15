require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const { Server } = require('socket.io');

const apiRouter = require('./routes/api');
const quizRouter = require('./routes/quiz');
const roomsRouter = require('./routes/rooms');
const adminRouter = require('./routes/admin');

// "Van tay" cua toan bo file tinh trong public/. Doi moi khi code frontend thay doi.
// Dung de nhac nguoi dung tai lai trang: giua su kien ma sua bug, nguoi dang mo tab
// cu van chay code cu - de nhat la bam nut khong an gi hoac giao dien vo.
function computeBuildId() {
  const root = path.join(__dirname, '..', 'public');
  const hash = crypto.createHash('sha1');

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(html|js|css)$/.test(entry.name)) {
        const stat = fs.statSync(full);
        hash.update(`${entry.name}:${stat.size}:${stat.mtimeMs}`);
      }
    }
  };

  try {
    walk(root);
  } catch (err) {
    return String(Date.now());
  }
  return hash.digest('hex').slice(0, 12);
}

// Phai doc lai tu dia, KHONG duoc tinh mot lan luc khoi dong: sua CSS/JS trong
// luc server dang chay ma van tay khong doi thi duong dan ?v= giu nguyen, ma
// duong dan do dang duoc cache "immutable" mot nam - trinh duyet se bam vao ban
// CSS cu mai mai. Trieu chung dung la "giao dien admin bi vo" du file da sua.
// Doc lai toi da 1 lan/giay de khong stat ca thu muc public cho moi request.
let buildIdCache = { value: null, at: 0 };

function getBuildId() {
  const now = Date.now();
  if (buildIdCache.value && now - buildIdCache.at < 1000) return buildIdCache.value;
  buildIdCache = { value: computeBuildId(), at: now };
  return buildIdCache.value;
}

// Phien ban rieng cua TUNG file: sua mot file thi chi duong dan cua file do doi,
// nhung file khac van nam yen trong cache cua trinh duyet.
function assetVersion(urlPath) {
  const full = path.join(__dirname, '..', 'public', urlPath.replace(/^\/+/, ''));
  try {
    const stat = fs.statSync(full);
    return crypto.createHash('sha1').update(`${stat.size}:${stat.mtimeMs}`).digest('hex').slice(0, 12);
  } catch (err) {
    // Khong doc duoc thi quay ve van tay chung, van con hon de duong dan tran
    return getBuildId();
  }
}

const BUILD_ID = getBuildId();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(compression());
app.use(cors());
app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Phuc vu HTML: chen ?v=<phien ban cua rieng file do> vao moi duong dan /js/... va /css/...
//
// Nho vay trinh duyet duoc phep cache cac file do VINH VIEN (duong dan co phien
// ban nen khong bao gio cu), ma sua code xong van chac chan nhan ban moi vi
// phien ban cua file do doi -> duong dan doi. Truoc day moi file deu phai hoi lai may chu
// mot lan (no-cache); voi admin tach thanh nhieu trang thi moi lan bam sang
// trang khac la mot loat request kiem tra lai - cham thay ro.
const htmlCache = new Map();

function renderHtml(filePath) {
  const stat = fs.statSync(filePath);
  const cached = htmlCache.get(filePath);

  // Cache phai tinh ca cac file HTML nay tham chieu: sua rieng CSS thi HTML
  // khong doi mtime, nhung chuoi ?v= ben trong bat buoc phai doi theo.
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    const key = cached.assets.map(assetVersion).join('|');
    if (key === cached.assetKey) return cached.html;
  }

  const assets = [];
  const html = fs.readFileSync(filePath, 'utf8').replace(
    /(src|href)="(\/(?:js|css)\/[^"?]+)"/g,
    (match, attr, assetPath) => {
      assets.push(assetPath);
      return `${attr}="${assetPath}?v=${assetVersion(assetPath)}"`;
    }
  );

  htmlCache.set(filePath, { mtimeMs: stat.mtimeMs, assets, assetKey: assets.map(assetVersion).join('|'), html });
  return html;
}

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  let rel = decodeURIComponent(req.path);
  if (rel.endsWith('/')) rel += 'index.html';
  if (!rel.endsWith('.html')) return next();

  const filePath = path.join(PUBLIC_DIR, rel);
  // Chan di ra ngoai thu muc public qua duong dan kieu ../
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) return next();

  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(renderHtml(filePath));
});

app.use(
  express.static(PUBLIC_DIR, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      // Co ?v= trong duong dan -> noi dung gan voi dung phien ban do, cache thoai mai.
      if (res.req && res.req.query && res.req.query.v) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      // Khong co phien ban (vd mo thang file) thi van bat revalidate cho an toan,
      // tranh client chay code cu lech voi html moi.
      if (/\.(html|js|css)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

app.use((req, res, next) => {
  req.io = io;
  req.buildId = getBuildId();
  next();
});

// Client doi chieu gia tri nay voi ban no dang chay de biet co can tai lai khong
app.get('/api/version', (req, res) => res.json({ build: getBuildId() }));

app.use('/api', apiRouter);
app.use('/api', quizRouter);
app.use('/api', roomsRouter);
app.use('/api', adminRouter);

function broadcastOnlineCount() {
  io.emit('online:count', io.engine.clientsCount);
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.emit('app:version', { build: getBuildId() });
  broadcastOnlineCount();

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    broadcastOnlineCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}  (build ${BUILD_ID})`);
});

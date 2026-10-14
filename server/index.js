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

const BUILD_ID = computeBuildId();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(compression());
app.use(cors());
app.use(express.json());
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      // html/js/css thay doi thuong xuyen (sua cau hoi quiz, fix bug...) ke ca trong luc
      // su kien dang dien ra - bat buoc trinh duyet revalidate (ETag) thay vi dung cache mu
      // 1 ngay, tranh client chay code cu lech voi html moi va bi loi runtime nhu getElementById null.
      if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

app.use((req, res, next) => {
  req.io = io;
  req.buildId = BUILD_ID;
  next();
});

// Client doi chieu gia tri nay voi ban no dang chay de biet co can tai lai khong
app.get('/api/version', (req, res) => res.json({ build: BUILD_ID }));

app.use('/api', apiRouter);
app.use('/api', quizRouter);
app.use('/api', roomsRouter);
app.use('/api', adminRouter);

function broadcastOnlineCount() {
  io.emit('online:count', io.engine.clientsCount);
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.emit('app:version', { build: BUILD_ID });
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

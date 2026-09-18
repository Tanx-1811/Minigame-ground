require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const { Server } = require('socket.io');

const apiRouter = require('./routes/api');
const quizRouter = require('./routes/quiz');

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
      // index.html co the doi noi dung (vd sau deploy), khong cache lau
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use('/api', apiRouter);
app.use('/api', quizRouter);

function broadcastOnlineCount() {
  io.emit('online:count', io.engine.clientsCount);
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  broadcastOnlineCount();

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    broadcastOnlineCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

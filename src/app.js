const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const setupSocketEvents = require('./socket/socket');

// Khởi tạo Express app
const app = express();
const server = http.createServer(app);

// Cấu hình CORS
app.use(cors());
app.use(express.json());

// Cấu hình Socket.IO với CORS
const io = new Server(server, {
  cors: {
    origin: '*', // Cho phép tất cả các nguồn (trong môi trường production nên hạn chế hơn)
    methods: ['GET', 'POST'],
  },
});

// Thiết lập Socket.IO events
const { logs } = setupSocketEvents(io);

// Lưu instance io vào app để sử dụng trong các route
app.set('io', io);

// Routes API
app.use('/api', apiRoutes);

// Route cơ bản
app.get('/', (req, res) => {
  res.send('FastShip HU Socket.IO Server đang hoạt động!\n\n' + logs.join('\n'));
});

// Khởi động server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT}`);
});

module.exports = app; 
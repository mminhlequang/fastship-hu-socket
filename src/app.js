const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const apiRoutes = require('./routes/api');
const setupSocketEvents = require('./socket/socket');

// Khởi tạo Express app
const app = express();
const server = http.createServer(app);

// Cấu hình CORS
app.use(cors());
app.use(express.json());

// Đảm bảo thư mục logs tồn tại
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Cấu hình Socket.IO với CORS
const io = new Server(server, {
  cors: {
    origin: '*', // Cho phép tất cả các nguồn (trong môi trường production nên hạn chế hơn)
    methods: ['GET', 'POST'],
  },
});

// Thiết lập Socket.IO events
setupSocketEvents(io);

// Lưu instance io vào app để sử dụng trong các route
app.set('io', io);

// Routes API
app.use('/api', apiRoutes);

// Route cơ bản
app.get('/', (req, res) => {
  res.send('FastShip HU Socket.IO Server đang hoạt động!');
});

app.get('/logs/clear', (req, res) => {
  fs.writeFileSync(path.join(logsDir, 'socket.log'), '');
  res.send('Logs đã được xóa!');
});

app.get('/logs', (req, res) => {
  const logs = fs.readFileSync(path.join(logsDir, 'socket.log'), 'utf8');
  const logLines = logs.split('\n');
  const htmlLogs = logLines
    .map(line => `<div>${line}</div>`)
    .join('');
  res.send(`<html><body style="font-family: monospace;">${htmlLogs}</body></html>`);
}); 


// Route kiểm tra sức khỏe
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Khởi động server
const PORT = process.env.PORT || 3000;
const serverInstance = server.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT}`);
  console.log(`Môi trường: ${process.env.NODE_ENV}`);
});

// Xử lý graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`Nhận tín hiệu ${signal}, đóng server...`);

  // Ghi log sự kiện shutdown
  const logMessage = `[${new Date().toISOString()}] Server shutdown triggered by ${signal}`;
  fs.appendFileSync(path.join(logsDir, 'server.log'), logMessage + '\n');

  // Đóng server HTTP
  serverInstance.close(() => {
    console.log('HTTP server đã đóng');

    // Đóng kết nối Socket.IO
    io.close(() => {
      console.log('Socket.IO server đã đóng');
      process.exit(0);
    });
  });

  // Đặt timeout để đảm bảo đóng sau 10 giây nếu có vấn đề
  setTimeout(() => {
    console.error('Không thể đóng kết nối một cách bình thường, buộc đóng!');
    process.exit(1);
  }, 10000);
};

// Đăng ký các sự kiện để xử lý graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Xử lý lỗi không bắt được
process.on('uncaughtException', (error) => {
  console.error('Lỗi không bắt được:', error);
  fs.appendFileSync(
    path.join(logsDir, 'errors.log'),
    `[${new Date().toISOString()}] Uncaught Exception: ${error.stack}\n`
  );
  // Không thoát ngay lập tức để cho phép ghi log
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Lỗi Promise không xử lý:', reason);
  fs.appendFileSync(
    path.join(logsDir, 'errors.log'),
    `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n`
  );
});

module.exports = app; 
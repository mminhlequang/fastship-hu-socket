require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Cấu hình CORS
app.use(cors());

// Cấu hình Socket.IO với CORS
const io = new Server(server, {
  cors: {
    origin: '*', // Cho phép tất cả các nguồn (trong môi trường production nên hạn chế hơn)
    methods: ['GET', 'POST'],
  },
});

// Routes cơ bản
app.get('/', (req, res) => {
  res.send('FastShip HU Socket.IO Server đang hoạt động!');
});

// Xử lý kết nối Socket.IO
io.on('connection', (socket) => {
  console.log(`Người dùng đã kết nối: ${socket.id}`);

  // Xử lý sự kiện từ client
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
  });

  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room: ${roomId}`);
  });

  socket.on('send_message', (data) => {
    console.log('Tin nhắn nhận được:', data);
    // Gửi tin nhắn đến tất cả người dùng trong phòng ngoại trừ người gửi
    socket.to(data.room).emit('receive_message', data);
  });

  // Xử lý ngắt kết nối
  socket.on('disconnect', () => {
    console.log(`Người dùng đã ngắt kết nối: ${socket.id}`);
  });
});

// Khởi động server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT}`);
}); 
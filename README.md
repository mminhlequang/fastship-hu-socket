# FastShip HU Socket Server

Máy chủ Socket.IO cho dự án FastShip HU.

## Cài đặt

### Yêu cầu
- Node.js (v16+)
- Docker và Docker Compose (tùy chọn)

### Cài đặt phụ thuộc
```bash
npm install
```

## Chạy ứng dụng

### Chạy trực tiếp
```bash
# Chế độ phát triển (với nodemon)
npm run dev

# Chế độ sản xuất
npm start
```

### Chạy với Docker
```bash
# Xây dựng và khởi động container
docker-compose up -d

# Xem logs
docker-compose logs -f

# Dừng container
docker-compose down
```

## API Socket.IO

### Sự kiện từ Client tới Server
- `join_room`: Tham gia vào một phòng
  ```javascript
  socket.emit('join_room', roomId);
  ```

- `leave_room`: Rời khỏi phòng
  ```javascript
  socket.emit('leave_room', roomId);
  ```

- `send_message`: Gửi tin nhắn trong phòng
  ```javascript
  socket.emit('send_message', {
    room: roomId,
    message: 'Nội dung tin nhắn',
    sender: 'user_id',
    timestamp: Date.now(),
  });
  ```

### Sự kiện từ Server tới Client
- `receive_message`: Nhận tin nhắn từ người khác trong phòng
  ```javascript
  socket.on('receive_message', (data) => {
    console.log(data);
  });
  ``` 
# Tài liệu ứng dụng FastShip HU Socket Server

## 1. Tổng quan về hệ thống

FastShip HU Socket Server là một máy chủ thời gian thực được xây dựng trên nền tảng Node.js và Socket.IO, phục vụ cho ứng dụng giao hàng FastShip. Hệ thống này cung cấp khả năng theo dõi vị trí của tài xế theo thời gian thực, quản lý trạng thái online/offline của tài xế và phân phối đơn hàng theo thuật toán ưu tiên thông minh.

### Mục tiêu chính:
- Theo dõi vị trí tài xế theo thời gian thực
- Quản lý trạng thái online/offline của tài xế
- Phân phối đơn hàng dựa trên các tiêu chí: đánh giá, vị trí tài xế và số dư ví
- Tự động chuyển đơn hàng sang tài xế khác khi hết thời gian chờ

## 2. Kiến trúc và các thành phần chính

### Cấu trúc thư mục:
```
/
├── src/
│   ├── models/          # Mô hình dữ liệu
│   ├── services/        # Các dịch vụ xử lý logic
│   ├── controllers/     # Điều khiển xử lý yêu cầu
│   ├── routes/          # Định tuyến API
│   ├── socket/          # Xử lý Socket.IO
│   ├── utils/           # Tiện ích
│   └── app.js           # Khởi tạo ứng dụng
├── index.js             # Điểm khởi đầu ứng dụng
└── package.json         # Cấu hình dự án
```

### Các thành phần chính:
1. **Models** - Mô hình dữ liệu
   - `Driver.js`: Lưu trữ thông tin tài xế
   - `Order.js`: Lưu trữ thông tin đơn hàng

2. **Services** - Dịch vụ xử lý logic
   - `DriverService.js`: Quản lý tài xế, tính khoảng cách, tìm kiếm tài xế phù hợp
   - `OrderService.js`: Quản lý đơn hàng, phân phối đơn hàng

3. **Controllers** - Điều khiển
   - `DriverController.js`: Xử lý logic liên quan đến tài xế
   - `OrderController.js`: Xử lý logic liên quan đến đơn hàng

4. **Socket** - Xử lý kết nối thời gian thực
   - `socket.js`: Thiết lập các sự kiện Socket.IO

5. **API Routes** - Định tuyến API
   - `api.js`: Định nghĩa các endpoint RESTful API

## 3. Cách thức hoạt động

### Quy trình tài xế:
1. Tài xế kết nối tới máy chủ bằng Socket.IO
2. Tài xế gửi thông tin đăng ký (uuid, phone, name, firebaseId, rate, walletInfo)
3. Tài xế cập nhật vị trí định kỳ
4. Khi nhận được thông báo đơn hàng, tài xế có 30 giây để chấp nhận hoặc từ chối

### Quy trình đơn hàng:
1. Đơn hàng được tạo thông qua API
2. Hệ thống tìm tài xế phù hợp dựa trên các tiêu chí:
   - Đánh giá (rate) cao
   - Vị trí gần địa điểm giao hàng
   - Số dư ví đủ để nhận đơn
3. Hệ thống thông báo đơn hàng lần lượt cho từng tài xế:
   - Mỗi tài xế có 30 giây để phản hồi
   - Nếu hết thời gian hoặc từ chối, chuyển sang tài xế tiếp theo
4. Khi tài xế chấp nhận đơn, đơn hàng được gán cho tài xế đó và không gửi thông báo cho các tài xế khác

## 4. API Socket.IO

### Sự kiện từ Client đến Server:

#### Đăng ký tài xế
```javascript
socket.emit('register_driver', {
  uuid: 'id-tai-xe-123',
  phone: '0987654321',
  name: 'Nguyễn Văn A',
  firebaseId: 'firebase-id-123',
  rate: 4.8,
  walletInfo: { balance: 100000 }
});
```

#### Cập nhật vị trí
```javascript
socket.emit('update_location', {
  lat: 21.028511,
  lng: 105.804817
});
```

#### Chấp nhận đơn hàng
```javascript
socket.emit('accept_order', {
  orderId: 'order-123'
});
```

#### Từ chối đơn hàng
```javascript
socket.emit('reject_order', {
  orderId: 'order-123'
});
```

#### Hoàn thành đơn hàng
```javascript
socket.emit('complete_order', {
  orderId: 'order-123'
});
```

### Sự kiện từ Server đến Client:

#### Kết nối thành công
```javascript
socket.on('connection_success', (data) => {
  console.log(data.message);
  console.log(data.driverId);
});
```

#### Nhận đơn hàng mới
```javascript
socket.on('new_order', (data) => {
  console.log(data.orderId);
  console.log(data.pickupLocation);
  console.log(data.deliveryLocation);
  console.log(data.price);
  console.log(data.timeoutSeconds);
});
```

#### Xác nhận đã nhận đơn hàng
```javascript
socket.on('order_accepted', (data) => {
  console.log(data.orderId);
  console.log(data.status);
});
```

#### Xác nhận đã hoàn thành đơn hàng
```javascript
socket.on('order_completed', (data) => {
  console.log(data.orderId);
  console.log(data.status);
});
```

#### Thông báo lỗi
```javascript
socket.on('error', (data) => {
  console.error(data.message);
});
```

## 5. API RESTful

### Tạo đơn hàng mới
- **URL**: `/api/orders`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "orderId": "order-123",
    "pickupLocation": {
      "lat": 21.028511,
      "lng": 105.804817
    },
    "deliveryLocation": {
      "lat": 21.038131,
      "lng": 105.782557
    },
    "price": 50000,
    "requirementAmount": 10000
  }
  ```
- **Phản hồi thành công (200)**:
  ```json
  {
    "success": true,
    "message": "Đơn hàng đã được tạo và đang thông báo cho tài xế",
    "order": {
      "orderId": "order-123",
      "status": "pending",
      "...": "..."
    }
  }
  ```

### Hủy đơn hàng
- **URL**: `/api/orders/:orderId`
- **Method**: `DELETE`
- **Phản hồi thành công (200)**:
  ```json
  {
    "success": true,
    "message": "Đơn hàng đã được hủy",
    "order": {
      "orderId": "order-123",
      "status": "cancelled",
      "...": "..."
    }
  }
  ```

### Lấy danh sách tài xế online
- **URL**: `/api/drivers/online`
- **Method**: `GET`
- **Phản hồi thành công (200)**:
  ```json
  {
    "success": true,
    "count": 2,
    "drivers": [
      {
        "uuid": "id-tai-xe-123",
        "name": "Nguyễn Văn A",
        "phone": "0987654321",
        "rate": 4.8,
        "location": {
          "lat": 21.028511,
          "lng": 105.804817
        },
        "lastActive": "2023-05-15T10:30:00Z"
      },
      "..."
    ]
  }
  ```

### Lấy thông tin tài xế theo UUID
- **URL**: `/api/drivers/:uuid`
- **Method**: `GET`
- **Phản hồi thành công (200)**:
  ```json
  {
    "success": true,
    "driver": {
      "uuid": "id-tai-xe-123",
      "name": "Nguyễn Văn A",
      "phone": "0987654321",
      "rate": 4.8,
      "isOnline": true,
      "isBusy": false,
      "location": {
        "lat": 21.028511,
        "lng": 105.804817
      },
      "lastActive": "2023-05-15T10:30:00Z"
    }
  }
  ```

## 6. Xử lý gián đoạn ứng dụng

Hệ thống FastShip HU Socket Server đã được thiết kế để xử lý các trường hợp gián đoạn ứng dụng như VPS restart, sự cố mạng, quá tải hệ thống hoặc lỗi ứng dụng. Phần này mô tả các cơ chế đã được triển khai để đảm bảo tính ổn định và khả năng phục hồi của hệ thống.

### 6.1. Các trường hợp gián đoạn và cách xử lý

#### 6.1.1. VPS restart đột ngột
- **Vấn đề**: Mất tất cả kết nối socket hiện tại, trạng thái của tài xế và đơn hàng có thể bị mất.
- **Giải pháp đã triển khai**:
  - Docker với chính sách `restart: unless-stopped` để tự động khởi động lại container khi VPS khởi động.
  - Thiết lập file logging để lưu lại thông tin quan trọng trước khi gián đoạn.
  - Xử lý graceful shutdown để đảm bảo đóng ứng dụng một cách an toàn khi có tín hiệu từ hệ thống.

#### 6.1.2. Sự cố mạng tạm thời
- **Vấn đề**: Mất kết nối socket tạm thời, thông tin vị trí tài xế không được cập nhật.
- **Giải pháp đã triển khai**:
  - Xử lý ngắt kết nối với thông tin chi tiết về lý do và thời gian kết nối.
  - Ghi log đầy đủ để theo dõi và phân tích sự cố.
  - Cơ chế kết nối lại ở phía client.

#### 6.1.3. Quá tải hệ thống
- **Vấn đề**: Server không đáp ứng hoặc phản hồi chậm khi có nhiều kết nối.
- **Giải pháp đã triển khai**:
  - Giới hạn tài nguyên container (CPU: 0.5, Memory: 512MB) để tránh quá tải VPS.
  - Theo dõi số lượng kết nối đang hoạt động thông qua logs.

#### 6.1.4. Lỗi ứng dụng (crash)
- **Vấn đề**: Lỗi không xử lý làm crash ứng dụng Node.js.
- **Giải pháp đã triển khai**:
  - Xử lý toàn diện cho các lỗi không lường trước (uncaughtException, unhandledRejection).
  - Ghi log chi tiết về lỗi để dễ dàng điều tra và khắc phục.
  - Docker sẽ tự động khởi động lại container khi ứng dụng bị crash.

### 6.2. Cơ chế Graceful Shutdown

Hệ thống đã triển khai cơ chế graceful shutdown để đảm bảo đóng ứng dụng một cách an toàn khi nhận được tín hiệu SIGTERM hoặc SIGINT:

1. Đóng server HTTP
2. Đóng kết nối Socket.IO
3. Ghi log sự kiện shutdown
4. Thoát quy trình một cách an toàn

Cơ chế này giúp:
- Tránh mất dữ liệu đang xử lý
- Thông báo cho client về việc server sắp đóng
- Đảm bảo tất cả tài nguyên được giải phóng đúng cách

### 6.3. Giải pháp Docker

Docker được sử dụng để cung cấp môi trường cách ly và nhất quán cho ứng dụng. Cấu hình Docker bao gồm:

#### 6.3.1. Docker Compose
```yaml
version: '3.8'

services:
  socket-server:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - NODE_ENV=production
    volumes:
      - ./:/app
      - ./logs:/app/logs
      - /app/node_modules
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

#### 6.3.2. Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN mkdir -p logs

RUN apk add --no-cache wget

EXPOSE 3000

CMD ["node", "index.js"]
```

### 6.4. Hướng dẫn khắc phục sự cố

#### 6.4.1. Kiểm tra logs
- Logs được lưu trong thư mục `logs/`:
  - `server.log`: Log khởi động và shutdown server
  - `socket.log`: Log các sự kiện socket
  - `errors.log`: Log các lỗi không xử lý được

#### 6.4.2. Kiểm tra trạng thái container
```bash
# Kiểm tra trạng thái container
docker-compose ps

# Xem logs container
docker-compose logs -f socket-server

# Kiểm tra sức khỏe container
docker inspect --format "{{json .State.Health }}" fastship-hu-socket_socket-server_1
```

#### 6.4.3. Khởi động lại dịch vụ
```bash
# Khởi động lại dịch vụ
docker-compose restart socket-server
```

### 6.5. Khuyến nghị cho client

Để đảm bảo kết nối ổn định, client nên triển khai:

1. **Cơ chế tự động kết nối lại**:
```javascript
const socket = io('https://socket.fastship.hu', {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
});
```

2. **Xử lý sự kiện ngắt kết nối**:
```javascript
socket.on('disconnect', (reason) => {
  console.log('Mất kết nối:', reason);
  
  // Nếu server ngắt kết nối, thử kết nối lại thủ công
  if (reason === 'io server disconnect') {
    socket.connect();
  }
});
```

3. **Lưu trữ cục bộ và đồng bộ hóa**:
```javascript
// Khi mất kết nối, lưu dữ liệu vào localStorage
socket.on('disconnect', () => {
  if (pendingLocationUpdates.length > 0) {
    localStorage.setItem('pendingLocationUpdates', JSON.stringify(pendingLocationUpdates));
  }
});

// Khi kết nối lại, gửi dữ liệu đã lưu
socket.on('connect', () => {
  const pendingUpdates = localStorage.getItem('pendingLocationUpdates');
  if (pendingUpdates) {
    const updates = JSON.parse(pendingUpdates);
    updates.forEach(update => socket.emit('update_location', update));
    localStorage.removeItem('pendingLocationUpdates');
  }
});
```

4. **Kiểm tra kết nối định kỳ**:
```javascript
// Kiểm tra kết nối mỗi 30 giây
setInterval(() => {
  if (socket.connected) {
    const start = Date.now();
    socket.emit('ping_server', null, () => {
      const latency = Date.now() - start;
      console.log(`Độ trễ hiện tại: ${latency}ms`);
    });
  }
}, 30000);
```

### 6.6. Lưu ý về khả năng mở rộng

Trong kiến trúc hiện tại, chúng ta đã loại bỏ Redis và PM2, điều này có nghĩa là:

1. **Mất trạng thái khi restart**: Khi server restart, tất cả dữ liệu trong bộ nhớ sẽ bị mất. Để giảm thiểu vấn đề này, bạn nên:
   - Thêm một cơ sở dữ liệu bền vững (MongoDB, PostgreSQL) để lưu trữ trạng thái quan trọng
   - Cài đặt cơ chế đồng bộ dữ liệu theo chu kỳ

2. **Giới hạn mở rộng**: Ứng dụng sẽ chỉ chạy trên một instance duy nhất. Nếu cần mở rộng:
   - Cài đặt một cơ sở dữ liệu bên ngoài
   - Sử dụng load balancer với sticky sessions

3. **Phục hồi sau lỗi**: Docker sẽ tự động khởi động lại container khi có lỗi, nhưng:
   - Cần có cơ chế phục hồi trạng thái hoặc tái tạo từ dữ liệu lưu trữ bền vững
   - Client cần có khả năng tự động kết nối lại và xử lý trường hợp mất kết nối

Nếu lưu lượng truy cập hoặc yêu cầu khả năng mở rộng tăng cao trong tương lai, bạn có thể cân nhắc:
1. Tái triển khai Redis để hỗ trợ nhiều instance và lưu trữ trạng thái
2. Sử dụng PM2 hoặc orchestration tool khác (Kubernetes) để quản lý quy trình và mở rộng

## 7. Kết luận

FastShip HU Socket Server cung cấp một giải pháp hiệu quả để quản lý tài xế và đơn hàng theo thời gian thực. Với Socket.IO, hệ thống có thể gửi và nhận dữ liệu hai chiều giữa server và các ứng dụng client (bao gồm ứng dụng Flutter) với độ trễ thấp.

Hệ thống đã được thiết kế với các tính năng quan trọng sau:
- Theo dõi tài xế theo thời gian thực
- Phân phối đơn hàng thông minh
- Quản lý trạng thái tài xế
- Quản lý thời gian chờ phản hồi

Để triển khai hệ thống trong môi trường production, cần lưu ý:
- Giới hạn CORS chỉ cho phép các nguồn đáng tin cậy
- Sử dụng cơ sở dữ liệu thực (như MongoDB, PostgreSQL) thay vì lưu trữ trong bộ nhớ
- Thêm xác thực JWT cho các kết nối Socket.IO
- Thêm load balancing và clustering để tăng khả năng mở rộng

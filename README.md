# FastShip HU Socket Server

## Giới thiệu

Hệ thống Socket.IO server quản lý việc tiếp nhận đơn hàng, tìm tài xế và cập nhật trạng thái đơn hàng theo thời gian thực. Hệ thống được thiết kế để hoạt động với các ứng dụng giao hàng, dịch vụ vận chuyển và các dịch vụ cần theo dõi thời gian thực.

## Cài đặt

1. Clone repository về máy:
```bash
git clone https://github.com/username/fastship-hu-socket.git
cd fastship-hu-socket
```

2. Cài đặt các thư viện phụ thuộc:
```bash
npm install
```

3. Cấu hình biến môi trường:
- Tạo file `.env` (hoặc sử dụng file có sẵn)
- Cấu hình các thông số cần thiết:
```
PORT=3000
ADMIN_KEY=admin_secret_key
```

4. Khởi động server:
```bash
npm start
```

Hoặc chạy trong chế độ phát triển:
```bash
npm run dev
```

## Cấu trúc hệ thống

```
├── src/
│   ├── models/
│   │   ├── Driver.js        # Model quản lý tài xế
│   │   └── Order.js         # Model quản lý đơn hàng
│   ├── services/
│   │   ├── DriverService.js # Service xử lý logic tài xế
│   │   └── OrderService.js  # Service xử lý logic đơn hàng
│   ├── controllers/
│   │   ├── DriverController.js # Controller xử lý API và sự kiện tài xế
│   │   └── OrderController.js  # Controller xử lý API và sự kiện đơn hàng
│   ├── routes/
│   │   └── api.js           # Định nghĩa các API route
│   ├── socket/
│   │   └── socket.js        # Xử lý sự kiện socket
│   ├── utils/
│   └── app.js               # Cấu hình ứng dụng Express
├── public/                  # Tài nguyên tĩnh và ví dụ
├── logs/                    # Thư mục lưu log
├── index.js                 # Điểm khởi động ứng dụng
└── package.json             # Cấu hình dự án
```

## Các API endpoint

### API Tài xế

- `GET /api/drivers/online` - Lấy danh sách tài xế đang hoạt động
- `GET /api/drivers/:uuid` - Lấy thông tin của một tài xế theo UUID

### API Đơn hàng

- `GET /api/orders` - Lấy danh sách đơn hàng (có thể lọc theo status, customerId, driverId)
- `GET /api/orders/:orderId` - Lấy thông tin đơn hàng theo ID
- `POST /api/orders` - Tạo đơn hàng mới
- `PUT /api/orders/:orderId/status` - Cập nhật trạng thái đơn hàng
- `DELETE /api/orders/:orderId` - Hủy đơn hàng

## Các sự kiện Socket.IO

### Sự kiện Xác thực

- `authenticate_driver` - Xác thực tài xế
- `authenticate_customer` - Xác thực khách hàng
- `authenticate_admin` - Xác thực admin

### Sự kiện Tài xế

- `update_location` - Cập nhật vị trí tài xế
- `driver_update_status` - Cập nhật trạng thái tài xế (online/offline)

### Sự kiện Đơn hàng

- `create_order` - Tạo đơn hàng mới
- `find_driver` - Tìm tài xế cho đơn hàng
- `driver_order_response` - Phản hồi của tài xế khi được gán đơn hàng
- `update_order_status` - Cập nhật trạng thái đơn hàng
- `cancel_order` - Hủy đơn hàng
- `get_order_info` - Lấy thông tin đơn hàng
- `get_orders_list` - Lấy danh sách đơn hàng

## Luồng xử lý đơn hàng

1. **Tạo đơn hàng**:
   - Khách hàng gửi yêu cầu `create_order` với thông tin đơn hàng
   - Hệ thống tạo đơn với trạng thái `pending`

2. **Tìm tài xế**:
   - Hệ thống tìm tài xế phù hợp qua sự kiện `find_driver`
   - Khi tìm thấy, gán đơn hàng và cập nhật trạng thái thành `assigned`

3. **Phản hồi từ tài xế**:
   - Tài xế nhận thông báo đơn hàng mới
   - Tài xế phản hồi qua `driver_order_response` (accepted/rejected)
   - Nếu chấp nhận, đơn hàng chuyển sang trạng thái `accepted`
   - Nếu từ chối, hệ thống tìm tài xế khác

4. **Cập nhật trạng thái đơn hàng**:
   - Tài xế cập nhật trạng thái qua `update_order_status`
   - Các trạng thái tiếp theo: `picked` (đã lấy hàng) -> `in_progress` (đang giao) -> `completed` (hoàn thành)
   - Đơn hàng có thể bị hủy ở bất kỳ trạng thái nào bằng sự kiện `cancel_order`

## Ví dụ

Xem các ví dụ sử dụng hệ thống tại:
- `public/examples/order_flow.html`

## License

[MIT](LICENSE) 
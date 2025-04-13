# Thư mục Public - FastShip HU Socket

Thư mục này được dùng để lưu trữ các file tĩnh có thể truy cập trực tiếp qua URL.

## Cách sử dụng

1. Đặt các file tĩnh (như hình ảnh, CSS, JavaScript, PDF, v.v.) vào thư mục này
2. Truy cập trực tiếp qua URL: `http://your-domain/tên-file`

## Ví dụ

- File `public/logo.png` → Truy cập qua URL: `http://your-domain/logo.png`
- File `public/documents/report.pdf` → Truy cập qua URL: `http://your-domain/documents/report.pdf`
- File `public/examples/driver_example.html` → Truy cập qua URL: `http://your-domain/examples/driver_example.html`
- File `public/examples/customer_example.html` → Truy cập qua URL: `http://your-domain/examples/customer_example.html`

## Ví dụ Driver

Chúng tôi đã tạo một trang ví dụ để kiểm tra hoạt động của driver:
- Đăng nhập bằng số điện thoại và mật khẩu (mặc định: +84979797979 / 123456)
- Kết nối Socket với máy chủ
- Tự động cập nhật vị trí ngẫu nhiên tại Budapest, Hungary
- Nhận và phản hồi đơn hàng mới
- Cập nhật trạng thái đơn hàng đang hoạt động

Để sử dụng:
1. Truy cập `http://your-domain/examples/driver_example.html`
2. Đăng nhập với thông tin được cung cấp
3. Kết nối socket và kiểm tra các chức năng

## Ví dụ Customer

Chúng tôi đã tạo một trang ví dụ cho khách hàng:
- Đăng nhập bằng số điện thoại và mật khẩu (mặc định: +84979797979 / 123456)
- Kết nối Socket với máy chủ
- Tạo đơn hàng mới (đặt món, nhập thông tin giao hàng)
- Theo dõi tiến trình đơn hàng qua biểu đồ trực quan
- Theo dõi thông tin tài xế và vị trí giao hàng
- Hủy đơn hàng nếu cần

Để sử dụng:
1. Truy cập `http://your-domain/examples/customer_example.html`
2. Đăng nhập với thông tin được cung cấp
3. Kết nối socket và tạo đơn hàng mới

## Lưu ý

- Không lưu trữ dữ liệu nhạy cảm trong thư mục này vì bất kỳ ai cũng có thể truy cập
- Tối ưu hóa kích thước file trước khi tải lên (đặc biệt là hình ảnh)
- Có thể tạo các thư mục con để tổ chức file tốt hơn
 
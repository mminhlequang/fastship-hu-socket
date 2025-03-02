const driverController = require('../controllers/DriverController');
const orderController = require('../controllers/OrderController');
const fs = require('fs');
const path = require('path');

/**
 * Thiết lập các sự kiện Socket.IO
 * @param {Object} io - Socket.IO server instance
 */
const setupSocketEvents = (io) => {
  // Lưu logs
  const logs = [];
  const logEvent = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    logs.push(logMessage);
    console.log(logMessage);

    // Ghi log vào file
    try {
      const logsDir = path.join(__dirname, '../../logs');
      fs.appendFileSync(path.join(logsDir, 'socket.log'), logMessage + '\n');
    } catch (error) {
      console.error('Lỗi khi ghi log:', error);
    }

    // Giới hạn số lượng logs trong bộ nhớ
    if (logs.length > 1000) {
      logs.shift();
    }
  };

  // Theo dõi số lượng kết nối
  let connectionCount = 0;

  // Cấu hình ping interval
  io.engine.pingTimeout = 10000; // 10 giây
  io.engine.pingInterval = 5000; // 5 giây

  // Xử lý kết nối mới
  io.on('connection', (socket) => {
    connectionCount++;
    logEvent(`Đã kết nối Socket: ${socket.id} (Tổng số kết nối: ${connectionCount})`);

    // Lưu thời gian kết nối
    socket.connectionTime = new Date();

    // Đăng ký tài xế
    socket.on('register_driver', async (data) => {
      try {
        logEvent(`Đăng ký tài xế: ${socket.id} - ${data.uuid}`);
        await driverController.handleDriverConnect(socket, data);

        // Lưu thông tin tài xế vào socket để dễ dàng truy cập khi disconnect
        socket.driverData = data;

        // Thông báo kết nối thành công cho client
        socket.emit('connection_success', {
          message: 'Kết nối thành công',
          driverId: data.uuid,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logEvent(`Lỗi khi đăng ký tài xế ${data.uuid}: ${error.message}`);
        socket.emit('error', { message: 'Lỗi khi đăng ký: ' + error.message });
      }
    });

    // Cập nhật vị trí tài xế
    socket.on('update_location', async (data) => {
      try {
        await driverController.handleUpdateLocation(socket, data);
        // Cập nhật thời gian hoạt động cuối cùng
        socket.lastActive = new Date();
      } catch (error) {
        logEvent(`Lỗi khi cập nhật vị trí tài xế ${socket.id}: ${error.message}`);
        socket.emit('error', { message: 'Lỗi khi cập nhật vị trí: ' + error.message });
      }
    });

    // Chấp nhận đơn hàng
    socket.on('accept_order', async (data) => {
      try {
        logEvent(`Tài xế ${socket.id} chấp nhận đơn hàng ${data.orderId}`);
        await orderController.handleAcceptOrder(socket, data);
      } catch (error) {
        logEvent(`Lỗi khi chấp nhận đơn hàng ${data.orderId}: ${error.message}`);
        socket.emit('error', { message: 'Lỗi khi chấp nhận đơn hàng: ' + error.message });
      }
    });

    // Từ chối đơn hàng (tự động chuyển sang tài xế tiếp theo)
    socket.on('reject_order', async (data) => {
      try {
        logEvent(`Tài xế ${socket.id} từ chối đơn hàng ${data.orderId}`);
        const order = await orderController.getOrder(data.orderId);
        if (order && order.status === 'pending') {
          await orderController.notifyNextDriver(io, order);
        }
      } catch (error) {
        logEvent(`Lỗi khi từ chối đơn hàng ${data.orderId}: ${error.message}`);
        socket.emit('error', { message: 'Lỗi khi từ chối đơn hàng: ' + error.message });
      }
    });

    // Hoàn thành đơn hàng
    socket.on('complete_order', async (data) => {
      try {
        logEvent(`Tài xế ${socket.id} hoàn thành đơn hàng ${data.orderId}`);
        await orderController.handleCompleteOrder(socket, data);
      } catch (error) {
        logEvent(`Lỗi khi hoàn thành đơn hàng ${data.orderId}: ${error.message}`);
        socket.emit('error', { message: 'Lỗi khi hoàn thành đơn hàng: ' + error.message });
      }
    });

    // Kiểm tra kết nối
    socket.on('ping_server', () => {
      socket.emit('pong_server', { timestamp: new Date().toISOString() });
    });

    // Xử lý lỗi
    socket.on('error', (error) => {
      logEvent(`Lỗi socket ${socket.id}: ${error.message}`);
    });

    // Xử lý ngắt kết nối
    socket.on('disconnect', async (reason) => {
      connectionCount--;
      try {
        // Tính thời gian kết nối
        const connectionDuration = socket.connectionTime
          ? Math.round((new Date() - socket.connectionTime) / 1000)
          : 'N/A';

        // Xử lý ngắt kết nối tài xế
        const driver = await driverController.handleDriverDisconnect(socket.id);

        if (driver) {
          logEvent(`Tài xế ${driver.uuid} đã ngắt kết nối (${socket.id}). Lý do: ${reason}. Thời gian kết nối: ${connectionDuration}s`);

          // Lưu trạng thái tài xế vào cơ sở dữ liệu (nếu có)
          try {
            // Giả sử có driverService
            // await driverService.updateDriverStatus(driver.uuid, 'offline');
          } catch (dbError) {
            logEvent(`Lỗi khi cập nhật trạng thái tài xế ${driver.uuid}: ${dbError.message}`);
          }
        } else {
          logEvent(`Socket ${socket.id} đã ngắt kết nối. Lý do: ${reason}. Thời gian kết nối: ${connectionDuration}s`);
        }
      } catch (error) {
        logEvent(`Lỗi khi xử lý ngắt kết nối socket ${socket.id}: ${error.message}`);
      }
    });
  });

  // Kiểm tra kết nối định kỳ
  setInterval(() => {
    logEvent(`Thống kê: ${connectionCount} kết nối đang hoạt động`);
  }, 60000); // Mỗi phút

  return { logs };
};

module.exports = setupSocketEvents; 
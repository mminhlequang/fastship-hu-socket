const driverController = require('../controllers/DriverController');
const orderController = require('../controllers/OrderController');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

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

    // Xác thực tài xế bằng accessToken
    socket.on('authenticate_driver', async (data) => {
      try {
        if (!data.token) {
          throw new Error('Không có token xác thực');
        }

        logEvent(`Xác thực tài xế: ${socket.id} - token: ${data.token.substring(0, 10)}...`);

        // Lưu token vào socket để sử dụng sau này
        socket.accessToken = data.token;

        // Lấy thông tin tài xế từ API
        try {
          const profileResponse = await axios.get('https://zennail23.com/api/v1/profile', {
            headers: {
              'Authorization': `Bearer ${data.token}`,
              'X-CSRF-TOKEN': '',
              'accept': '*/*'
            }
          });

          const walletResponse = await axios.get('https://zennail23.com/api/v1/transaction/get_my_wallet?currency=eur', {
            headers: {
              'Authorization': `Bearer ${data.token}`,
              'X-CSRF-TOKEN': '',
              'accept': '*/*'
            }
          });

          // Lưu thông tin driver vào socket
          socket.driverData = {
            profile: profileResponse.data,
            wallet: walletResponse.data,
            uuid: profileResponse.data.id || profileResponse.data.uuid
          };

          // Đăng ký tài xế với hệ thống
          await driverController.handleDriverConnect(socket, socket.driverData);

          // Thông báo kết nối thành công cho client
          socket.emit('authentication_success', {
            message: 'Xác thực thành công',
            driverId: socket.driverData.uuid,
            profile: profileResponse.data,
            wallet: walletResponse.data,
            timestamp: new Date().toISOString()
          });

          logEvent(`Xác thực thành công cho tài xế: ${socket.driverData.uuid}`);
        } catch (apiError) {
          logEvent(`Lỗi khi gọi API: ${apiError.message}`);
          socket.emit('authentication_error', {
            message: 'Lỗi khi xác thực với API: ' + apiError.message
          });
          throw apiError;
        }
      } catch (error) {
        logEvent(`Lỗi khi xác thực tài xế: ${error.message}`);
        socket.emit('authentication_error', {
          message: 'Lỗi khi xác thực: ' + error.message
        });
      }
    });

    // Đăng ký tài xế (giữ lại để tương thích ngược)
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
        const location = await driverController.handleUpdateLocation(socket, data);
        // Cập nhật thời gian hoạt động cuối cùng
        socket.lastActive = new Date();

        // Phản hồi cho client biết vị trí đã được cập nhật
        socket.emit('location_updated', {
          status: 'success',
          location,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logEvent(`Lỗi khi cập nhật vị trí tài xế ${socket.id}: ${error.message}`);
        socket.emit('error', { message: 'Lỗi khi cập nhật vị trí: ' + error.message });
      }
    });

    // Cập nhật trạng thái tài xế (online/offline)
    socket.on('driver_status_update', async (data) => {
      try {
        const status = data.status === 'online' ? 'online' : 'offline';
        logEvent(`Tài xế ${socket.id} cập nhật trạng thái: ${status}`);

        if (socket.driverData) {
          // Cập nhật trạng thái trong driverController
          await driverController.handleDriverStatusUpdate(socket, {
            uuid: socket.driverData.uuid,
            status: status
          });

          // Cập nhật thời gian hoạt động cuối cùng
          socket.lastActive = new Date();

          // Phản hồi cho client
          socket.emit('driver_status_updated', {
            status: status,
            timestamp: new Date().toISOString()
          });
        } else {
          throw new Error('Tài xế chưa đăng ký');
        }
      } catch (error) {
        logEvent(`Lỗi khi cập nhật trạng thái tài xế ${socket.id}: ${error.message}`);
        socket.emit('error', { message: 'Lỗi khi cập nhật trạng thái: ' + error.message });
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
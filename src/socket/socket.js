const driverController = require('../controllers/DriverController');
const orderController = require('../controllers/OrderController');
const orderService = require('../services/OrderService');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const SocketResponse = require('../utils/SocketResponse');
const { MessageCodes, AppConfig } = require('../utils/Enums');

/**
 * Thiết lập các sự kiện Socket.IO
 * @param {Object} io - Socket.IO server instance
 */
const setupSocketEvents = (io) => {
  // Xử lý ghi log
  const logEvent = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);

    // Ghi log vào file
    try {
      const logsDir = path.join(__dirname, '../../logs');
      fs.appendFileSync(path.join(logsDir, 'socket.log'), logMessage + '\n');
    } catch (error) {
      console.error('Lỗi khi ghi log:', error);
    }
  };

  // Theo dõi số lượng kết nối
  let connectionCount = 0;

  // Cấu hình ping interval
  io.engine.pingTimeout = 10000; // 10 giây
  io.engine.pingInterval = 5000; // 5 giây

  // Middleware xác thực handshake
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const userType = socket.handshake.auth.userType; // 'driver' hoặc 'customer'

      if (!token) {
        throw new Error('Không có token xác thực');
      }

      if (!userType || !['driver', 'customer', 'store'].includes(userType)) {
        throw new Error('Loại người dùng không hợp lệ');
      }

      logEvent(`Xác thực ${userType}: ${socket.id} - token: ${token.substring(0, 10)}...`);

      // Lưu token vào socket để sử dụng sau này
      socket.accessToken = token;
      socket.userType = userType;

      // Lấy thông tin người dùng từ API
      const profileResponse = await axios.get(`${AppConfig.HOST_API}/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'accept': '*/*'
        }
      });

      if (profileResponse.data.status !== true) {
        throw new Error('Token không hợp lệ');
      }

      // Lưu thông tin người dùng vào socket
      if (userType === 'driver') {
        const walletResponse = await axios.get(`${AppConfig.HOST_API}/transaction/get_my_wallet?currency=eur`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'accept': '*/*'
          }
        });

        if (walletResponse.data.status !== true) {
          throw new Error('Không thể lấy thông tin ví');
        }

        socket.driverData = {
          profile: profileResponse.data.data,
          wallet: walletResponse.data.data,
          id: profileResponse.data.data.id
        };

        // Đăng ký tài xế với hệ thống
        await driverController.handleDriverConnect(socket);
      } else {
        socket.customerData = {
          customerId: profileResponse.data.data.id,
          profile: profileResponse.data.data
        };
      }

      next();
    } catch (error) {
      logEvent(`Lỗi xác thực handshake: ${error.message}`);
      next(new Error('Xác thực thất bại: ' + error.message));
    }
  });

  // Xử lý kết nối mới
  io.on('connection', async (socket) => {
    connectionCount++;
    logEvent(`Đã kết nối Socket: ${socket.id} (Tổng số kết nối: ${connectionCount})`);

    // Lưu thời gian kết nối
    socket.connectionTime = new Date();

    // Thông báo kết nối thành công cho client
    if (socket.userType === 'driver') {
      SocketResponse.emitSuccess(socket, 'authentication_success', {
        driverId: socket.driverData.id,
        profile: socket.driverData.profile,
        wallet: socket.driverData.wallet
      });

      logEvent(`Xác thực thành công cho tài xế: ${JSON.stringify(socket.driverData)}`);

      // Kiểm tra và gửi thông tin đơn hàng hiện tại nếu có
      if (socket.driverData && socket.driverData.id) {
        const activeOrder = await orderService.getActiveOrderByDriverUid(socket.driverData.id);
        if (activeOrder) {
          logEvent(`Tài xế ${socket.driverData.id} reconnect với đơn hàng đang hoạt động: ${activeOrder.id}`);

          const orderRoom = `order_${activeOrder.id}`;
          socket.join(orderRoom);
          socket.driverData.activeOrderId = activeOrder.id;
          logEvent(`Tài xế ${socket.id} đã tham gia room đơn hàng ${orderRoom}`);

          SocketResponse.emitSuccess(socket, 'current_order_info', {
            order: activeOrder.getOrderData(),
            process_status: activeOrder.process_status,
            timestamp: new Date().toISOString()
          });
        }
      }
    } else {
      SocketResponse.emitSuccess(socket, 'authentication_success', {
        customerId: socket.customerData.customerId,
        profile: socket.customerData.profile,
      });

      logEvent(`Xác thực thành công cho khách hàng: ${JSON.stringify(socket.customerData)}`);
    }

    // Cập nhật vị trí tài xế
    socket.on('driver_update_location', async (data) => {
      try {
        const location = await driverController.handleUpdateLocation(socket, data);
        // Cập nhật thời gian hoạt động cuối cùng
        socket.lastActive = new Date();

        // Phản hồi cho client biết vị trí đã được cập nhật
        SocketResponse.emitSuccess(socket, 'location_updated', {
          location
        });

        // Broadcast vị trí tài xế đến room đơn hàng nếu tài xế đang thực hiện đơn
        if (socket.driverData && socket.driverData.activeOrderId) {
          const orderRoom = `order_${socket.driverData.activeOrderId}`;
          io.to(orderRoom).emit('driver_location_update', {
            orderId: socket.driverData.activeOrderId,
            driverId: socket.driverData.id,
            location: location,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        logEvent(`Lỗi khi cập nhật vị trí tài xế ${socket.id}: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.LOCATION_INVALID, {
          message: 'Lỗi khi cập nhật vị trí: ' + error.message
        });
      }
    });

    // Cập nhật trạng thái tài xế (online/offline)
    socket.on('driver_update_status', async (data) => {
      try {
        const status = data.status === 'online' ? 'online' : 'offline';
        logEvent(`Tài xế ${socket.id} cập nhật trạng thái: ${status}`);

        if (socket.driverData) {
          // Cập nhật trạng thái trong driverController
          await driverController.handleDriverStatusUpdate(socket, {
            id: socket.driverData.id,
            status: status
          });

          // Cập nhật thời gian hoạt động cuối cùng
          socket.lastActive = new Date();
        } else {
          throw new Error('Tài xế chưa đăng ký');
        }
      } catch (error) {
        logEvent(`Lỗi khi cập nhật trạng thái tài xế ${socket.id}: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.DRIVER_UPDATE_FAILED, {
          message: 'Lỗi khi cập nhật trạng thái: ' + error.message
        });
      }
    });

    // === BẮT ĐẦU CÁC SỰ KIỆN QUẢN LÝ ĐƠN HÀNG ===

    // Tạo đơn hàng mới
    socket.on('create_order', async (data) => {
      logEvent(`Yêu cầu tạo đơn hàng mới từ ${socket.id}: OrderId: ${data.id}`);

      // Khách hàng join vào room đơn hàng
      const orderRoom = `order_${data.id}`;
      socket.join(orderRoom);
      logEvent(`Khách hàng ${socket.id} đã tham gia room đơn hàng ${orderRoom}`);

      orderController.handleCreateOrder(socket, data, io);
    });

    // Phản hồi tài xế về đơn hàng
    socket.on('driver_new_order_response', async (data) => {
      try {
        logEvent(`Phản hồi đơn hàng ${data.orderId} từ tài xế ${socket.id}: ${data.status}`);

        // Tài xế join vào room đơn hàng khi nhận đơn
        if (data.status === 'accepted') {
          const orderRoom = `order_${data.orderId}`;
          socket.join(orderRoom);
          socket.driverData.activeOrderId = data.orderId;
          logEvent(`Tài xế ${socket.id} đã tham gia room đơn hàng ${orderRoom}`);
        }

        await orderController.handleDriverResponse(socket, data, io);
      } catch (error) {
        logEvent(`Lỗi khi xử lý phản hồi tài xế: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.INVALID_PARAMS, {
          message: 'Lỗi khi xử lý phản hồi: ' + error.message
        });
      }
    });

    // Cập nhật trạng thái đơn hàng
    socket.on('update_order_status', async (data) => {
      try {
        logEvent(`Cập nhật trạng thái đơn hàng ${data.orderId} thành ${data.processStatus} từ ${socket.id}`);
        await orderController.updateOrderStatus(socket, data, io);
      } catch (error) {
        logEvent(`Lỗi khi cập nhật trạng thái đơn hàng: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_UPDATE_FAILED, {
          message: 'Lỗi khi cập nhật trạng thái đơn hàng: ' + error.message
        });
      }
    });

    // Hoàn thành đơn hàng
    socket.on('complete_order', async (data) => {
      try {
        logEvent(`Yêu cầu hoàn thành đơn hàng ${data.orderId} từ ${socket.id}`);
        orderController.completeOrder(socket, data, io);
      } catch (error) {
        logEvent(`Lỗi khi hoàn thành đơn hàng: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_COMPLETE_FAILED, {
          message: 'Lỗi khi hoàn thành đơn hàng: ' + error.message
        });
      }
    });

    // Hủy đơn hàng
    socket.on('cancel_order', async (data) => {
      try {
        logEvent(`Yêu cầu hủy đơn hàng ${data.orderId} từ ${socket.id}`);
        await orderController.cancelOrder(socket, data, io);
      } catch (error) {
        logEvent(`Lỗi khi hủy đơn hàng: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_CANCEL_FAILED, {
          message: 'Lỗi khi hủy đơn hàng: ' + error.message
        });
      }
    });

    // === KẾT THÚC CÁC SỰ KIỆN QUẢN LÝ ĐƠN HÀNG ===

    socket.on('joinRoom', (roomName) => {
      socket.join(roomName);
      console.log(`Client ${socket.id} đã tham gia phòng ${roomName}`);
    });

    socket.on('leaveRoom', (roomName) => {
      socket.leave(roomName);
      console.log(`Client ${socket.id} đã rời khỏi phòng ${roomName}`);
    });

    // Kiểm tra kết nối
    socket.on('ping_server', () => {
      SocketResponse.emitSuccess(socket, 'pong_server', {
        timestamp: new Date().toISOString()
      });
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
          logEvent(`Tài xế ${driver.id} đã ngắt kết nối (${socket.id}). Lý do: ${reason}. Thời gian kết nối: ${connectionDuration}s`);

          // Lưu trạng thái tài xế vào cơ sở dữ liệu (nếu có)
          try {
            // Giả sử có driverService
            // await driverService.updateDriverStatus(driver.id, 'offline');
          } catch (dbError) {
            logEvent(`Lỗi khi cập nhật trạng thái tài xế ${driver.id}: ${dbError.message}`);
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
};

module.exports = setupSocketEvents; 
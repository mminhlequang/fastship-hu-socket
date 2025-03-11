const driverController = require('../controllers/DriverController');
const orderController = require('../controllers/OrderController');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const SocketResponse = require('../utils/SocketResponse');
const MessageCodes = require('../utils/MessageCodes');

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

          if (profileResponse.data.status != true && walletResponse.data.status != true) {
            throw new Error('Không có token xác thực');
          }

          // Lưu thông tin driver vào socket
          socket.driverData = {
            profile: profileResponse.data.data,
            wallet: walletResponse.data.data,
            uid: profileResponse.data.data.uid
          };

          // Đăng ký tài xế với hệ thống
          await driverController.handleDriverConnect(socket);

          // Thông báo kết nối thành công cho client
          SocketResponse.emitSuccess(socket, 'authentication_success', {
            driverId: socket.driverData.uid,
            profile: profileResponse.data,
            wallet: walletResponse.data
          });

          logEvent(`Xác thực thành công cho tài xế: ${JSON.stringify(socket.driverData)}`);
        } catch (apiError) {
          logEvent(`Lỗi khi gọi API: ${apiError.message}`);
          SocketResponse.emitError(socket, 'authentication_error', MessageCodes.AUTH_FAILED, {
            message: 'Lỗi khi xác thực với API: ' + apiError.message
          });
          throw apiError;
        }
      } catch (error) {
        logEvent(`Lỗi khi xác thực tài xế: ${error.message}`);
        SocketResponse.emitError(socket, 'authentication_error', MessageCodes.AUTH_FAILED, {
          message: 'Lỗi khi xác thực: ' + error.message
        });
      }
    });

    // Xác thực khách hàng
    socket.on('authenticate_customer', async (data) => {
      try {
        if (!data.customerId) {
          SocketResponse.emitError(socket, 'authentication_error', MessageCodes.CUSTOMER_ID_MISSING, {
            message: 'Không có customerId'
          });
          return;
        }

        logEvent(`Xác thực khách hàng: ${socket.id} - customerId: ${data.customerId}`);

        // Lưu thông tin khách hàng vào socket
        socket.customerData = {
          customerId: data.customerId,
          // Có thể thêm thông tin khác nếu cần
        };

        // Thêm socket vào room của khách hàng
        socket.join(`customer_${data.customerId}`);

        // Thông báo kết nối thành công cho client
        SocketResponse.emitSuccess(socket, 'authentication_success', {
          customerId: data.customerId
        });

        logEvent(`Xác thực thành công cho khách hàng: ${data.customerId}`);
      } catch (error) {
        logEvent(`Lỗi khi xác thực khách hàng: ${error.message}`);
        SocketResponse.emitError(socket, 'authentication_error', MessageCodes.AUTH_FAILED, {
          message: 'Lỗi khi xác thực: ' + error.message
        });
      }
    });

    // Xác thực admin
    socket.on('authenticate_admin', async (data) => {
      try {
        if (!data.adminKey || data.adminKey !== process.env.ADMIN_KEY) {
          SocketResponse.emitError(socket, 'authentication_error', MessageCodes.ADMIN_KEY_INVALID, {
            message: 'Mã xác thực không hợp lệ'
          });
          return;
        }

        logEvent(`Xác thực admin: ${socket.id}`);

        // Lưu thông tin admin vào socket
        socket.adminData = {
          isAdmin: true
        };

        // Thông báo kết nối thành công cho client
        SocketResponse.emitSuccess(socket, 'authentication_success', {
          message: 'Xác thực admin thành công'
        });

        logEvent(`Xác thực thành công cho admin`);
      } catch (error) {
        logEvent(`Lỗi khi xác thực admin: ${error.message}`);
        SocketResponse.emitError(socket, 'authentication_error', MessageCodes.AUTH_FAILED, {
          message: 'Lỗi khi xác thực: ' + error.message
        });
      }
    });

    // Cập nhật vị trí tài xế
    socket.on('update_location', async (data) => {
      try {
        const location = await driverController.handleUpdateLocation(socket, data);
        // Cập nhật thời gian hoạt động cuối cùng
        socket.lastActive = new Date();

        // Phản hồi cho client biết vị trí đã được cập nhật
        SocketResponse.emitSuccess(socket, 'location_updated', {
          location
        });
      } catch (error) {
        logEvent(`Lỗi khi cập nhật vị trí tài xế ${socket.id}: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.LOCATION_INVALID, {
          message: 'Lỗi khi cập nhật vị trí: ' + error.message
        });
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
            uid: socket.driverData.uid,
            status: status
          });

          // Cập nhật thời gian hoạt động cuối cùng
          socket.lastActive = new Date();

          // Phản hồi cho client
          SocketResponse.emitSuccess(socket, 'driver_status_updated', {
            status: status,
            timestamp: new Date().toISOString()
          });
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
      try {
        logEvent(`Yêu cầu tạo đơn hàng mới từ ${socket.id}: ${JSON.stringify(data)}`);
        await orderController.handleCreateOrder(socket, data, io);
      } catch (error) {
        logEvent(`Lỗi khi tạo đơn hàng: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_CREATION_FAILED, {
          message: 'Lỗi khi tạo đơn hàng: ' + error.message
        });
      }
    });

    // Tìm tài xế cho đơn hàng
    socket.on('find_driver', async (data) => {
      try {
        logEvent(`Yêu cầu tìm tài xế cho đơn hàng ${data.orderId} từ ${socket.id}`);
        await orderController.findDriverForOrder(socket, data, io);
      } catch (error) {
        logEvent(`Lỗi khi tìm tài xế: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.NO_AVAILABLE_DRIVER, {
          message: 'Lỗi khi tìm tài xế: ' + error.message
        });
      }
    });

    // Phản hồi tài xế về đơn hàng
    socket.on('driver_order_response', async (data) => {
      try {
        logEvent(`Phản hồi đơn hàng ${data.orderId} từ tài xế ${socket.id}: ${data.status}`);
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
        logEvent(`Cập nhật trạng thái đơn hàng ${data.orderId} thành ${data.status} từ ${socket.id}`);
        await orderController.updateOrderStatus(socket, data, io);
      } catch (error) {
        logEvent(`Lỗi khi cập nhật trạng thái đơn hàng: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_UPDATE_FAILED, {
          message: 'Lỗi khi cập nhật trạng thái đơn hàng: ' + error.message
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

    // Lấy thông tin đơn hàng
    socket.on('get_order_info', async (data) => {
      try {
        await orderController.getOrderInfo(socket, data);
      } catch (error) {
        logEvent(`Lỗi khi lấy thông tin đơn hàng: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_NOT_FOUND, {
          message: 'Lỗi khi lấy thông tin đơn hàng: ' + error.message
        });
      }
    });

    // Lấy danh sách đơn hàng
    socket.on('get_orders_list', async (data) => {
      try {
        await orderController.getOrdersList(socket, data);
      } catch (error) {
        logEvent(`Lỗi khi lấy danh sách đơn hàng: ${error.message}`);
        SocketResponse.emitError(socket, 'error', MessageCodes.SERVER_ERROR, {
          message: 'Lỗi khi lấy danh sách đơn hàng: ' + error.message
        });
      }
    });

    // === KẾT THÚC CÁC SỰ KIỆN QUẢN LÝ ĐƠN HÀNG ===

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
          logEvent(`Tài xế ${driver.uid} đã ngắt kết nối (${socket.id}). Lý do: ${reason}. Thời gian kết nối: ${connectionDuration}s`);

          // Lưu trạng thái tài xế vào cơ sở dữ liệu (nếu có)
          try {
            // Giả sử có driverService
            // await driverService.updateDriverStatus(driver.uid, 'offline');
          } catch (dbError) {
            logEvent(`Lỗi khi cập nhật trạng thái tài xế ${driver.uid}: ${dbError.message}`);
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
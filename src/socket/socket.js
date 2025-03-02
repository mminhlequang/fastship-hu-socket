const driverController = require('../controllers/DriverController');
const orderController = require('../controllers/OrderController');

/**
 * Thiết lập các sự kiện Socket.IO
 * @param {Object} io - Socket.IO server instance
 */
const setupSocketEvents = (io) => {
  // Lưu logs
  const logs = [];
  const logEvent = (message) => {
    logs.push(message);
    console.log(message);

    // Giới hạn số lượng logs
    if (logs.length > 1000) {
      logs.shift();
    }
  };

  // Xử lý kết nối mới
  io.on('connection', (socket) => {
    logEvent(`Đã kết nối Socket: ${socket.id}`);

    // Đăng ký tài xế
    socket.on('register_driver', (data) => {
      logEvent(`Đăng ký tài xế: ${socket.id} - ${data.uuid}`);
      driverController.handleDriverConnect(socket, data);
    });

    // Cập nhật vị trí tài xế
    socket.on('update_location', (data) => {
      driverController.handleUpdateLocation(socket, data);
    });

    // Chấp nhận đơn hàng
    socket.on('accept_order', (data) => {
      logEvent(`Tài xế ${socket.id} chấp nhận đơn hàng ${data.orderId}`);
      orderController.handleAcceptOrder(socket, data);
    });

    // Từ chối đơn hàng (tự động chuyển sang tài xế tiếp theo)
    socket.on('reject_order', (data) => {
      logEvent(`Tài xế ${socket.id} từ chối đơn hàng ${data.orderId}`);
      const order = orderController.getOrder(data.orderId);
      if (order && order.status === 'pending') {
        orderController.notifyNextDriver(io, order);
      }
    });

    // Hoàn thành đơn hàng
    socket.on('complete_order', (data) => {
      logEvent(`Tài xế ${socket.id} hoàn thành đơn hàng ${data.orderId}`);
      orderController.handleCompleteOrder(socket, data);
    });

    // Xử lý ngắt kết nối
    socket.on('disconnect', () => {
      const driver = driverController.handleDriverDisconnect(socket.id);
      if (driver) {
        logEvent(`Tài xế ${driver.uuid} đã ngắt kết nối (${socket.id})`);
      } else {
        logEvent(`Socket ${socket.id} đã ngắt kết nối`);
      }
    });
  });

  return { logs };
};

module.exports = setupSocketEvents; 
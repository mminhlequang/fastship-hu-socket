const orderService = require('../services/OrderService');
const driverService = require('../services/DriverService');

class OrderController {
  /**
   * Tạo đơn hàng mới và thông báo cho tài xế
   * @param {Object} io - Socket.IO server instance
   * @param {Object} orderData - Thông tin đơn hàng
   */
  createOrder (io, orderData) {
    try {
      const {
        orderId,
        pickupLocation,
        deliveryLocation,
        price,
        requirementAmount
      } = orderData;

      if (!orderId || !pickupLocation || !deliveryLocation) {
        return {
          success: false,
          message: 'Thiếu thông tin đơn hàng'
        };
      }

      // Tạo đơn hàng mới
      const order = orderService.createOrder(
        orderId,
        pickupLocation,
        deliveryLocation,
        price,
        requirementAmount
      );

      // Tìm danh sách tài xế phù hợp
      const drivers = orderService.findDriversForOrder(orderId);

      if (!drivers || drivers.length === 0) {
        return {
          success: false,
          message: 'Không tìm thấy tài xế phù hợp'
        };
      }

      // Bắt đầu gửi thông báo cho tài xế theo thứ tự ưu tiên
      this.notifyNextDriver(io, order);

      return {
        success: true,
        message: 'Đơn hàng đã được tạo và đang thông báo cho tài xế',
        order
      };
    } catch (error) {
      console.error('Lỗi khi tạo đơn hàng:', error);
      return {
        success: false,
        message: 'Lỗi server'
      };
    }
  }

  /**
   * Thông báo cho tài xế tiếp theo trong danh sách ưu tiên
   * @param {Object} io - Socket.IO server instance
   * @param {Object} order - Đơn hàng
   */
  notifyNextDriver (io, order) {
    try {
      // Kiểm tra xem đơn hàng có tồn tại và chưa được nhận không
      if (!order || order.status !== 'pending') {
        return null;
      }

      // Lấy tài xế tiếp theo trong danh sách ưu tiên
      const driver = order.getNextDriver();

      // Nếu không còn tài xế nào trong danh sách
      if (!driver) {
        console.log(`Không còn tài xế nào khả dụng cho đơn hàng ${order.orderId}`);
        return null;
      }

      console.log(`Thông báo đơn hàng ${order.orderId} đến tài xế ${driver.uuid}`);

      // Kiểm tra xem tài xế còn online không
      if (!driver.isOnline || driver.isBusy) {
        // Nếu tài xế offline hoặc bận, thông báo cho tài xế tiếp theo
        return this.notifyNextDriver(io, order);
      }

      // Gửi thông báo đơn hàng đến tài xế
      io.to(driver.socketId).emit('new_order', {
        orderId: order.orderId,
        pickupLocation: order.pickupLocation,
        deliveryLocation: order.deliveryLocation,
        price: order.price,
        timeoutSeconds: 30 // Thời gian chờ phản hồi
      });

      // Thiết lập timeout để chuyển sang tài xế tiếp theo nếu không có phản hồi
      orderService.pendingNotifications[order.orderId] = setTimeout(() => {
        console.log(`Tài xế ${driver.uuid} không phản hồi đơn hàng ${order.orderId}`);
        this.notifyNextDriver(io, order);
      }, 30000); // 30 giây

      return driver;
    } catch (error) {
      console.error('Lỗi khi thông báo cho tài xế:', error);
      return null;
    }
  }

  /**
   * Xử lý khi tài xế chấp nhận đơn hàng
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu chấp nhận đơn hàng
   */
  handleAcceptOrder (socket, data) {
    try {
      const { orderId } = data;

      if (!orderId) {
        socket.emit('error', { message: 'Thiếu ID đơn hàng' });
        return null;
      }

      // Lấy thông tin tài xế từ socket ID
      const driver = driverService.getDriverBySocketId(socket.id);

      if (!driver) {
        socket.emit('error', { message: 'Tài xế không tồn tại hoặc chưa đăng nhập' });
        return null;
      }

      // Lấy thông tin đơn hàng
      const order = orderService.getOrder(orderId);

      if (!order) {
        socket.emit('error', { message: 'Đơn hàng không tồn tại' });
        return null;
      }

      if (order.status !== 'pending') {
        socket.emit('error', { message: 'Đơn hàng đã được nhận hoặc hoàn thành' });
        return null;
      }

      // Chấp nhận đơn hàng
      const updatedOrder = orderService.acceptOrder(orderId, driver.uuid);

      if (!updatedOrder) {
        socket.emit('error', { message: 'Không thể chấp nhận đơn hàng' });
        return null;
      }

      // Thông báo cho tài xế về việc đã nhận đơn hàng thành công
      socket.emit('order_accepted', {
        orderId: updatedOrder.orderId,
        status: updatedOrder.status
      });

      console.log(`Tài xế ${driver.uuid} đã nhận đơn hàng ${orderId}`);

      return updatedOrder;
    } catch (error) {
      console.error('Lỗi khi chấp nhận đơn hàng:', error);
      socket.emit('error', { message: 'Lỗi server' });
      return null;
    }
  }

  /**
   * Xử lý khi tài xế hoàn thành đơn hàng
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu hoàn thành đơn hàng
   */
  handleCompleteOrder (socket, data) {
    try {
      const { orderId } = data;

      if (!orderId) {
        socket.emit('error', { message: 'Thiếu ID đơn hàng' });
        return null;
      }

      // Lấy thông tin tài xế từ socket ID
      const driver = driverService.getDriverBySocketId(socket.id);

      if (!driver) {
        socket.emit('error', { message: 'Tài xế không tồn tại hoặc chưa đăng nhập' });
        return null;
      }

      // Lấy thông tin đơn hàng
      const order = orderService.getOrder(orderId);

      if (!order) {
        socket.emit('error', { message: 'Đơn hàng không tồn tại' });
        return null;
      }

      if (order.status !== 'accepted') {
        socket.emit('error', { message: 'Đơn hàng chưa được nhận hoặc đã hoàn thành' });
        return null;
      }

      if (order.driverId !== driver.uuid) {
        socket.emit('error', { message: 'Bạn không phải là tài xế của đơn hàng này' });
        return null;
      }

      // Hoàn thành đơn hàng
      const updatedOrder = orderService.completeOrder(orderId);

      if (!updatedOrder) {
        socket.emit('error', { message: 'Không thể hoàn thành đơn hàng' });
        return null;
      }

      // Thông báo cho tài xế về việc đã hoàn thành đơn hàng
      socket.emit('order_completed', {
        orderId: updatedOrder.orderId,
        status: updatedOrder.status
      });

      console.log(`Tài xế ${driver.uuid} đã hoàn thành đơn hàng ${orderId}`);

      return updatedOrder;
    } catch (error) {
      console.error('Lỗi khi hoàn thành đơn hàng:', error);
      socket.emit('error', { message: 'Lỗi server' });
      return null;
    }
  }

  /**
   * Hủy đơn hàng
   * @param {string} orderId - ID đơn hàng
   */
  cancelOrder (orderId) {
    try {
      const order = orderService.cancelOrder(orderId);

      if (!order) {
        return {
          success: false,
          message: 'Không thể hủy đơn hàng'
        };
      }

      return {
        success: true,
        message: 'Đơn hàng đã được hủy',
        order
      };
    } catch (error) {
      console.error('Lỗi khi hủy đơn hàng:', error);
      return {
        success: false,
        message: 'Lỗi server'
      };
    }
  }
}

module.exports = new OrderController(); 
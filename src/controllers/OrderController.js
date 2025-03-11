const orderService = require('../services/OrderService');
const driverService = require('../services/DriverService');
const fs = require('fs');
const path = require('path');
const SocketResponse = require('../utils/SocketResponse');
const MessageCodes = require('../utils/MessageCodes');

class OrderController {
  /**
   * Xử lý sự kiện tạo đơn hàng mới
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu đơn hàng
   */
  async handleCreateOrder (socket, data, io) {
    try {
      // Kiểm tra dữ liệu đầu vào
      if (!data.customerId) {
        SocketResponse.emitError(socket, 'error', MessageCodes.CUSTOMER_ID_MISSING, {
          message: 'customerId là bắt buộc'
        });
        return null;
      }

      // Tạo đơn hàng mới
      const order = orderService.createOrder({
        customerId: data.customerId,
        orderDetails: data.orderDetails || {}
      });

      // Phản hồi cho người tạo đơn
      SocketResponse.emitSuccess(socket, 'order_created', {
        orderId: order.orderId,
        order: order.getOrderData()
      });

      // Tự động tìm tài xế nếu có yêu cầu
      if (data.findDriver === true) {
        this.findDriverForOrder(socket, { orderId: order.orderId }, io);
      }

      return order;
    } catch (error) {
      console.error('Lỗi khi tạo đơn hàng:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_CREATION_FAILED, {
        message: 'Lỗi khi tạo đơn hàng: ' + error.message
      });
      return null;
    }
  }

  /**
   * Tìm tài xế cho đơn hàng
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu yêu cầu
   * @param {Object} io - Socket.IO server instance
   */
  async findDriverForOrder (socket, data, io) {
    try {
      const { orderId } = data;

      if (!orderId) {
        SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_ID_MISSING, {
          message: 'orderId là bắt buộc'
        });
        return null;
      }

      // Lấy thông tin đơn hàng
      const order = orderService.getOrderById(orderId);
      if (!order) {
        SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_NOT_FOUND, {
          message: `Đơn hàng không tồn tại: ${orderId}`
        });
        return null;
      }

      // Tìm tài xế phù hợp
      const result = orderService.findDriverForOrder(orderId);

      if (!result) {
        // Không tìm thấy tài xế
        SocketResponse.emitError(socket, 'find_driver_result', MessageCodes.NO_AVAILABLE_DRIVER, {
          orderId,
          message: 'Không tìm được tài xế phù hợp'
        });
        return null;
      }

      const { driver, distance } = result;

      // Gán đơn hàng cho tài xế
      const updatedOrder = orderService.assignOrderToDriver(orderId, driver.driverData.uid);

      // Phản hồi cho người tạo đơn
      SocketResponse.emitSuccess(socket, 'find_driver_result', {
        orderId,
        driverId: driver.driverData.uid,
        driverInfo: {
          profile: driver.driverData.profile,
          location: driver.location,
          distance: distance ? `${distance.toFixed(2)} km` : 'Không xác định'
        }
      });

      // Thông báo cho tài xế về đơn hàng mới
      if (driver.socketId) {
        SocketResponse.emitSuccess(io.to(driver.socketId), 'new_order_assigned', {
          orderId,
          order: updatedOrder.getOrderData(),
          customer: {
            customerId: updatedOrder.customerId,
            // Có thể thêm thông tin khách hàng nếu cần
          }
        });
      }

      return updatedOrder;
    } catch (error) {
      console.error('Lỗi khi tìm tài xế cho đơn hàng:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_DRIVER_ASSIGNMENT_FAILED, {
        message: 'Lỗi khi tìm tài xế: ' + error.message
      });
      return null;
    }
  }

  /**
   * Xử lý phản hồi của tài xế khi được gán đơn hàng
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu phản hồi
   * @param {Object} io - Socket.IO server instance
   */
  async handleDriverResponse (socket, data, io) {
    try {
      const { orderId, status, reason } = data;

      if (!orderId) {
        throw new Error('orderId là bắt buộc');
      }

      if (!status || !['accepted', 'rejected'].includes(status)) {
        throw new Error('Trạng thái không hợp lệ, phải là "accepted" hoặc "rejected"');
      }

      // Kiểm tra socket có phải của tài xế không
      if (!socket.driverData) {
        throw new Error('Không có quyền thực hiện thao tác này');
      }

      // Lấy thông tin đơn hàng
      const order = orderService.getOrderById(orderId);
      if (!order) {
        throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
      }

      // Kiểm tra đơn hàng có được gán cho tài xế này không
      if (order.assignedDriver !== socket.driverData.uid) {
        throw new Error('Đơn hàng không được gán cho tài xế này');
      }

      if (status === 'accepted') {
        // Tài xế chấp nhận đơn
        const updatedOrder = orderService.updateOrderStatus(orderId, 'accepted');

        // Thông báo cho tài xế
        socket.emit('order_response_confirmed', {
          status: 'success',
          orderId,
          orderStatus: 'accepted',
          timestamp: new Date().toISOString()
        });

        // Thông báo cho khách hàng
        io.to(`customer_${order.customerId}`).emit('order_status_updated', {
          orderId,
          status: 'accepted',
          driverId: socket.driverData.uid,
          driverInfo: {
            profile: socket.driverData.profile,
            location: driverService.getDriverByUuid(socket.driverData.uid)?.location
          },
          timestamp: new Date().toISOString()
        });

        return updatedOrder;
      } else {
        // Tài xế từ chối đơn
        orderService.updateOrderStatus(orderId, 'pending', {
          rejectedBy: socket.driverData.uid,
          rejectionReason: reason || 'Không có lý do'
        });

        // Cập nhật trạng thái tài xế
        const driver = driverService.getDriverByUuid(socket.driverData.uid);
        if (driver) {
          driver.setBusyStatus(false);
        }

        // Xóa đơn hàng khỏi danh sách đơn hàng của tài xế
        if (orderService.driverOrders[socket.driverData.uid]) {
          const index = orderService.driverOrders[socket.driverData.uid].indexOf(orderId);
          if (index >= 0) {
            orderService.driverOrders[socket.driverData.uid].splice(index, 1);
          }
        }

        // Thông báo cho tài xế
        socket.emit('order_response_confirmed', {
          status: 'success',
          orderId,
          orderStatus: 'rejected',
          timestamp: new Date().toISOString()
        });

        // Thông báo cho khách hàng
        io.to(`customer_${order.customerId}`).emit('driver_rejected_order', {
          orderId,
          driverId: socket.driverData.uid,
          reason: reason || 'Không có lý do',
          timestamp: new Date().toISOString()
        });

        // Tự động tìm tài xế khác
        setTimeout(() => {
          this.findDriverForOrder({
            emit: (event, data) => {
              // Gửi thông báo đến khách hàng
              io.to(`customer_${order.customerId}`).emit(event, data);
            }
          }, { orderId }, io);
        }, 1000);

        return null;
      }
    } catch (error) {
      console.error('Lỗi khi xử lý phản hồi của tài xế:', error);
      socket.emit('error', { message: 'Lỗi khi xử lý phản hồi: ' + error.message });
      return null;
    }
  }

  /**
   * Cập nhật trạng thái đơn hàng
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu cập nhật
   * @param {Object} io - Socket.IO server instance
   */
  async updateOrderStatus (socket, data, io) {
    try {
      const { orderId, status, details } = data;

      if (!orderId) {
        throw new Error('orderId là bắt buộc');
      }

      if (!status) {
        throw new Error('status là bắt buộc');
      }

      // Lấy thông tin đơn hàng
      const order = orderService.getOrderById(orderId);
      if (!order) {
        throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
      }

      // Kiểm tra người có quyền cập nhật không
      let isAuthorized = false;
      let updaterType = '';

      if (socket.driverData && order.assignedDriver === socket.driverData.uid) {
        isAuthorized = true;
        updaterType = 'driver';
      } else if (socket.customerData && order.customerId === socket.customerData.customerId) {
        isAuthorized = true;
        updaterType = 'customer';
      } else if (socket.adminData) {
        isAuthorized = true;
        updaterType = 'admin';
      }

      if (!isAuthorized) {
        throw new Error('Không có quyền cập nhật đơn hàng này');
      }

      // Cập nhật trạng thái
      const updatedStatus = orderService.updateOrderStatus(orderId, status, details || {});

      // Phản hồi cho người cập nhật
      socket.emit('order_status_updated_confirmation', {
        status: 'success',
        orderId,
        orderStatus: status,
        timestamp: new Date().toISOString()
      });

      // Thông báo cho các bên liên quan
      // 1. Thông báo cho khách hàng
      io.to(`customer_${order.customerId}`).emit('order_status_updated', {
        orderId,
        status,
        updatedBy: updaterType,
        details: details || {},
        timestamp: new Date().toISOString()
      });

      // 2. Thông báo cho tài xế nếu có
      if (order.assignedDriver) {
        const driver = driverService.getDriverByUuid(order.assignedDriver);
        if (driver && driver.socketId) {
          io.to(driver.socketId).emit('order_status_updated', {
            orderId,
            status,
            updatedBy: updaterType,
            details: details || {},
            timestamp: new Date().toISOString()
          });
        }
      }

      return updatedStatus;
    } catch (error) {
      console.error('Lỗi khi cập nhật trạng thái đơn hàng:', error);
      socket.emit('error', { message: 'Lỗi khi cập nhật trạng thái: ' + error.message });
      return null;
    }
  }

  /**
   * Hủy đơn hàng
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu hủy đơn
   * @param {Object} io - Socket.IO server instance
   */
  async cancelOrder (socket, data, io) {
    try {
      const { orderId, reason } = data;

      if (!orderId) {
        throw new Error('orderId là bắt buộc');
      }

      // Lấy thông tin đơn hàng
      const order = orderService.getOrderById(orderId);
      if (!order) {
        throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
      }

      // Kiểm tra người có quyền hủy không
      let isAuthorized = false;
      let cancelerType = '';

      if (socket.driverData && order.assignedDriver === socket.driverData.uid) {
        isAuthorized = true;
        cancelerType = 'driver';
      } else if (socket.customerData && order.customerId === socket.customerData.customerId) {
        isAuthorized = true;
        cancelerType = 'customer';
      } else if (socket.adminData) {
        isAuthorized = true;
        cancelerType = 'admin';
      }

      if (!isAuthorized) {
        throw new Error('Không có quyền hủy đơn hàng này');
      }

      // Hủy đơn hàng
      const updatedOrder = orderService.updateOrderStatus(orderId, 'cancelled', {
        cancelledBy: cancelerType,
        cancelReason: reason || 'Không có lý do'
      });

      // Phản hồi cho người hủy
      socket.emit('order_cancelled_confirmation', {
        status: 'success',
        orderId,
        timestamp: new Date().toISOString()
      });

      // Thông báo cho các bên liên quan
      // 1. Thông báo cho khách hàng
      io.to(`customer_${order.customerId}`).emit('order_cancelled', {
        orderId,
        cancelledBy: cancelerType,
        reason: reason || 'Không có lý do',
        timestamp: new Date().toISOString()
      });

      // 2. Thông báo cho tài xế nếu có
      if (order.assignedDriver) {
        const driver = driverService.getDriverByUuid(order.assignedDriver);
        if (driver && driver.socketId) {
          io.to(driver.socketId).emit('order_cancelled', {
            orderId,
            cancelledBy: cancelerType,
            reason: reason || 'Không có lý do',
            timestamp: new Date().toISOString()
          });
        }
      }

      return updatedOrder;
    } catch (error) {
      console.error('Lỗi khi hủy đơn hàng:', error);
      socket.emit('error', { message: 'Lỗi khi hủy đơn hàng: ' + error.message });
      return null;
    }
  }

  /**
   * Lấy thông tin đơn hàng
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu yêu cầu
   */
  async getOrderInfo (socket, data) {
    try {
      const { orderId } = data;

      if (!orderId) {
        throw new Error('orderId là bắt buộc');
      }

      // Lấy thông tin đơn hàng
      const order = orderService.getOrderById(orderId);
      if (!order) {
        throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
      }

      // Phản hồi thông tin đơn hàng
      socket.emit('order_info', {
        status: 'success',
        order: order.getOrderData(),
        timestamp: new Date().toISOString()
      });

      return order;
    } catch (error) {
      console.error('Lỗi khi lấy thông tin đơn hàng:', error);
      socket.emit('error', { message: 'Lỗi khi lấy thông tin đơn hàng: ' + error.message });
      return null;
    }
  }

  /**
   * Lấy danh sách đơn hàng theo điều kiện
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu yêu cầu
   */
  async getOrdersList (socket, data) {
    try {
      let orders = [];

      // Lấy đơn hàng của khách hàng
      if (data.customerId) {
        orders = orderService.getOrdersByCustomerId(data.customerId);
      }
      // Lấy đơn hàng của tài xế
      else if (data.driverId) {
        orders = orderService.getOrdersByDriverId(data.driverId);
      }
      // Lấy đơn hàng theo trạng thái
      else if (data.status) {
        orders = orderService.getOrdersByStatus(data.status);
      }
      // Lấy tất cả đơn hàng (chỉ admin mới được phép)
      else if (socket.adminData) {
        orders = orderService.getAllOrders();
      } else {
        throw new Error('Không có quyền xem danh sách đơn hàng');
      }

      // Lọc theo các tiêu chí khác nếu cần
      if (data.filters) {
        // Có thể thêm logic lọc theo thời gian, khu vực, v.v.
      }

      // Phản hồi danh sách đơn hàng
      socket.emit('orders_list', {
        status: 'success',
        count: orders.length,
        orders: orders.map(order => order.getOrderData()),
        timestamp: new Date().toISOString()
      });

      return orders;
    } catch (error) {
      console.error('Lỗi khi lấy danh sách đơn hàng:', error);
      socket.emit('error', { message: 'Lỗi khi lấy danh sách đơn hàng: ' + error.message });
      return null;
    }
  }
}

module.exports = new OrderController(); 
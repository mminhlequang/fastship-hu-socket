const orderService = require('../services/OrderService');
const driverService = require('../services/DriverService');
const fs = require('fs');
const path = require('path');
const SocketResponse = require('../utils/SocketResponse');
const { MessageCodes, AppOrderProcessStatus, FindDriverStatus } = require('../utils/MessageCodes');

class OrderController {
  /**
   * Xử lý sự kiện tạo đơn hàng mới
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu đơn hàng
   */
  async handleCreateOrder (socket, data, io) {
    try {
      // Kiểm tra dữ liệu đầu vào
      // if (!data.customerId) {
      //   SocketResponse.emitError(socket, 'error', MessageCodes.CUSTOMER_ID_MISSING, {
      //     message: 'customerId là bắt buộc'
      //   });
      //   return null;
      // }

      // Lấy token từ socket
      data.accessToken = socket.accessToken;

      // Tạo đơn hàng mới
      const order = orderService.createOrder(data);

      // Phản hồi cho người tạo đơn
      SocketResponse.emitSuccess(socket, 'create_order_result', {
        id: order.id,
        process_status: AppOrderProcessStatus.FIND_DRIVER,
        find_driver_status: FindDriverStatus.FINDING,
      });

      // Tự động tìm tài xế
      this.findDriverForOrder(socket, order, io);

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
   * @param {Object} order - Đơn hàng
   * @param {Object} io - Socket.IO server instance
   */
  async findDriverForOrder (socket, order, io) {
    try {

      // Tìm danh sách tài xế phù hợp
      const result = orderService.findDriverForOrder(order);

      if (!result || !result.driversList || result.driversList.length === 0) {
        // Không tìm thấy tài xế
        // Phản hồi cho người tạo đơn
        SocketResponse.emitSuccess(socket, 'create_order_result', {
          id: order.id,
          process_status: AppOrderProcessStatus.CANCELLED,
          find_driver_status: FindDriverStatus.NO_DRIVER,
        });
        orderService.updateOrderStatus(order.id, AppOrderProcessStatus.CANCELLED, {
          cancelledBy: 'customer',
          cancelReason: 'Không tìm thấy tài xế'
        });
        return null;
      }

      // Lưu danh sách tài xế vào order
      order.driversList = result.driversList;
      order.nextDriverIndex = 0;

      // Thông báo cho người dùng rằng đang tìm tài xế
      // Phản hồi cho người tạo đơn
      SocketResponse.emitSuccess(socket, 'create_order_result', {
        id: order.id,
        process_status: AppOrderProcessStatus.FIND_DRIVER,
        find_driver_status: FindDriverStatus.AVAILABLE_DRIVERS,
        drivers: result.driversList
      });

      // Bắt đầu gửi thông báo cho tài xế đầu tiên
      this.sendOrderToNextDriver(order.id, io);

      return order;
    } catch (error) {
      console.error('Lỗi khi tìm tài xế cho đơn hàng:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_DRIVER_ASSIGNMENT_FAILED, {
        message: 'Lỗi khi tìm tài xế: ' + error.message
      });
      return null;
    }
  }

  /**
   * Gửi thông báo đơn hàng cho tài xế tiếp theo trong danh sách
   * @param {String} orderId - ID đơn hàng
   * @param {Object} io - Socket.IO server instance
   */
  async sendOrderToNextDriver (orderId, io) {
    try {
      const order = orderService.getOrderById(orderId);
      if (!order) {
        console.error(`Không tìm thấy đơn hàng ${orderId}`);
        return null;
      }

      // Kiểm tra xem đơn hàng đã được gán cho tài xế nào chưa
      if ((order.process_status != null && order.process_status !== AppOrderProcessStatus.PENDING) || order.assignedDriverId) {
        console.log(`Đơn hàng ${orderId} không cần tìm tài xế tiếp: status=${order.process_status}, assignedDriverId=${order.assignedDriverId}`);
        return null;
      }

      // Nếu không có driversList, quá trình tìm tài xế chưa bắt đầu hoặc đã kết thúc
      if (!order.driversList || order.nextDriverIndex >= order.driversList.length) {
        console.log(`Hết danh sách tài xế cho đơn hàng ${orderId}`);
        // Thông báo cho khách hàng rằng không tìm thấy tài xế
        SocketResponse.emitSuccessToRoom(io, `customer_${order.customer.id}`, 'create_order_result', {
          orderId,
          process_status: AppOrderProcessStatus.FIND_DRIVER,
          find_driver_status: FindDriverStatus.NO_DRIVER,
        });
        return null;
      }

      // Lấy tài xế tiếp theo từ danh sách
      const currentDriverInfo = order.driversList[order.nextDriverIndex];
      const driver = currentDriverInfo.driver;

      // Kiểm tra xem tài xế đã từ chối đơn hàng này chưa hoặc đã nhận thông báo chưa
      if (orderService.hasDriverRejected(orderId, driver.driverData.id) ||
        orderService.hasDriverBeenNotified(orderId, driver.driverData.id)) {
        // Bỏ qua tài xế này và chuyển sang tài xế tiếp theo
        order.nextDriverIndex++;
        return this.sendOrderToNextDriver(orderId, io);
      }

      // Đánh dấu tài xế đã nhận thông báo
      orderService.markDriverNotified(orderId, driver.driverData.id);

      // Kiểm tra xem tài xế có online không và có socket không
      if (!driver.isOnline || !driver.socketId) {
        // Tài xế không online, chuyển sang tài xế tiếp theo
        order.nextDriverIndex++;
        return this.sendOrderToNextDriver(orderId, io);
      }

      // Gửi thông báo cho tài xế
      SocketResponse.emitSuccessToRoom(io, driver.socketId, 'driver_new_order_request', {
        order: order.getOrderData(),
        responseTimeout: 300, // Thời gian chờ phản hồi (giây)
        timestamp: new Date().toISOString()
      });

      // Thiết lập timeout để chuyển sang tài xế tiếp theo nếu không có phản hồi
      setTimeout(() => {
        // Kiểm tra lại xem đơn hàng có còn pending và chưa được gán không
        const currentOrder = orderService.getOrderById(orderId);
        if (currentOrder && (currentOrder.process_status == null || currentOrder.process_status !== AppOrderProcessStatus.PENDING) && !currentOrder.assignedDriverId) {
          // Nếu tài xế hiện tại chưa phản hồi, chuyển sang tài xế tiếp theo
          if (!orderService.hasDriverRejected(orderId, driver.driverData.id)) {
            // Đánh dấu là tài xế đã từ chối (timeout)
            orderService.markDriverRejected(orderId, driver.driverData.id, 'Không phản hồi trong thời gian cho phép');

            // Thông báo cho tài xế rằng đã hết thời gian
            if (driver.socketId) {
              SocketResponse.emitToRoom(io, driver.socketId, 'order_request_timeout', true, MessageCodes.REQUEST_TIMEOUT, {
                orderId,
                message: 'Hết thời gian phản hồi cho đơn hàng này'
              });
            }
          }

          // Cập nhật chỉ số và gửi cho tài xế tiếp theo
          currentOrder.nextDriverIndex++;
          this.sendOrderToNextDriver(orderId, io);
        }
      }, 30000); // 30 giây

      return driver;
    } catch (error) {
      console.error(`Lỗi khi gửi thông báo đơn hàng ${orderId} cho tài xế tiếp theo:`, error);
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

      // Kiểm tra tài xế có trong danh sách được thông báo không
      if (!orderService.hasDriverBeenNotified(orderId, socket.driverData.id)) {
        throw new Error('Tài xế không có trong danh sách được thông báo về đơn hàng này');
      }

      if (status === 'accepted') {
        // Tài xế chấp nhận đơn
        try {
          // Gán đơn hàng cho tài xế
          const updatedOrder = orderService.assignOrderToDriver(orderId, socket.driverData.id);

          // Cập nhật trạng thái đơn hàng
          orderService.updateOrderStatus(orderId, AppOrderProcessStatus.DRIVER_ACCEPTED, socket.driverData.id);

          // Thông báo cho tài xế
          SocketResponse.emitSuccess(socket, 'driver_new_order_response_confirmed', {
            status: 'success',
            orderId,
            orderStatus: 'accepted',
            timestamp: new Date().toISOString()
          });

          // Thông báo cho khách hàng
          SocketResponse.emitSuccessToRoom(io, `customer_${order.customer.id}`, 'create_order_result', {
            orderId,
            process_status: AppOrderProcessStatus.DRIVER_ACCEPTED,
            find_driver_status: FindDriverStatus.FOUND,
            driverInfo: {
              profile: socket.driverData.profile,
              location: driverService.getDriverById(socket.driverData.id)?.location
            },
            timestamp: new Date().toISOString()
          });

          return updatedOrder;
        } catch (error) {
          // Có thể đơn hàng đã được gán cho tài xế khác
          console.error('Lỗi khi gán đơn hàng:', error);
          SocketResponse.emitError(socket, 'order_response_rejected', MessageCodes.ORDER_ASSIGNMENT_FAILED, {
            status: 'error',
            orderId,
            message: error.message,
            timestamp: new Date().toISOString()
          });
          return null;
        }
      } else {
        // Tài xế từ chối đơn
        // Đánh dấu tài xế đã từ chối
        orderService.markDriverRejected(orderId, socket.driverData.id, reason || 'Không có lý do');

        // Thông báo cho tài xế
        SocketResponse.emitSuccess(socket, 'driver_new_order_response_confirmed', {
          status: 'success',
          orderId,
          orderStatus: 'rejected',
          timestamp: new Date().toISOString()
        });

        // Thông báo cho khách hàng
        SocketResponse.emitSuccessToRoom(io, `customer_${order.customer.id}`, 'driver_rejected_order', {
          orderId,
          driverId: socket.driverData.id,
          reason: reason || 'Không có lý do',
          timestamp: new Date().toISOString()
        });

        // Tự động chuyển sang tài xế tiếp theo
        if ((order.process_status == null || order.process_status !== AppOrderProcessStatus.PENDING) && !order.assignedDriverId) {
          // Tăng chỉ số và gửi cho tài xế tiếp theo
          order.nextDriverIndex++;
          setTimeout(() => {
            this.sendOrderToNextDriver(orderId, io);
          }, 1000);
        }

        return null;
      }
    } catch (error) {
      console.error('Lỗi khi xử lý phản hồi của tài xế:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_RESPONSE_PROCESSING_FAILED, {
        message: 'Lỗi khi xử lý phản hồi: ' + error.message
      });
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
      const { orderId, processStatus, details } = data;

      if (!orderId) {
        throw new Error('orderId là bắt buộc');
      }

      if (!processStatus) {
        throw new Error('status là bắt buộc');
      }

      // Lấy thông tin đơn hàng
      const order = orderService.getOrderById(orderId);
      if (!order) {
        throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
      }

      // Cập nhật trạng thái
      const updatedStatus = orderService.updateOrderStatus(orderId, processStatus, details || {});

      // Phản hồi cho người cập nhật
      SocketResponse.emitSuccess(socket, 'order_status_updated_confirmation', {
        status: 'success',
        orderId,
        processStatus: processStatus,
        timestamp: new Date().toISOString()
      });

      // Thông báo cho các bên liên quan
      // 1. Thông báo cho khách hàng
      SocketResponse.emitSuccessToRoom(io, `customer_${order.customer.id}`, 'order_status_updated', {
        orderId,
        processStatus: processStatus,
        details: details || {},
        timestamp: new Date().toISOString()
      });

      // 2. Thông báo cho tài xế nếu có
      if (order.assignedDriverId) {
        const driver = driverService.getDriverById(order.assignedDriverId);
        if (driver && driver.socketId) {
          SocketResponse.emitSuccessToRoom(io, driver.socketId, 'order_status_updated', {
            orderId,
            processStatus: processStatus,
            details: details || {},
            timestamp: new Date().toISOString()
          });
        }
      }

      return updatedStatus;
    } catch (error) {
      console.error('Lỗi khi cập nhật trạng thái đơn hàng:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_STATUS_UPDATE_FAILED, {
        message: 'Lỗi khi cập nhật trạng thái: ' + error.message
      });
      return null;
    }
  }

  /**
   * Hủy đơn hàng
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu hủy đơn
   * @param {Object} io - Socket.IO server instance
   */
  async completeOrder (socket, data, io) {
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


      orderService.callApiCompleteOrder(orderId, socket.accessToken);
      // Hoàn thành đơn hàng
      const updatedOrder = orderService.updateOrderStatus(orderId, AppOrderProcessStatus.COMPLETED);

      // Phản hồi cho người hủy
      SocketResponse.emitSuccess(socket, 'order_completed_confirmation', {
        status: 'success',
        orderId,
        timestamp: new Date().toISOString()
      });

      // Thông báo cho các bên liên quan
      // 1. Thông báo cho khách hàng
      SocketResponse.emitSuccessToRoom(io, `customer_${order.customer.id}`, 'order_completed', {
        orderId,
        timestamp: new Date().toISOString()
      });

      return updatedOrder;
    } catch (error) {
      console.error('Lỗi khi hoàn thành đơn hàng:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_COMPLETE_FAILED, {
        message: 'Lỗi khi hoàn thành đơn hàng: ' + error.message
      });
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

      orderService.callApiCancelOrder(orderId, reason || 'Không có lý do', socket.accessToken);
      // Hủy đơn hàng
      const updatedOrder = orderService.updateOrderStatus(orderId, AppOrderProcessStatus.CANCELLED, {
        cancelReason: reason || 'Không có lý do'
      });

      // Phản hồi cho người hủy
      SocketResponse.emitSuccess(socket, 'order_cancelled_confirmation', {
        status: 'success',
        orderId,
        timestamp: new Date().toISOString()
      });

      // Thông báo cho các bên liên quan
      // 1. Thông báo cho khách hàng
      SocketResponse.emitSuccessToRoom(io, `customer_${order.customer.id}`, 'order_cancelled', {
        orderId,
        reason: reason || 'Không có lý do',
        timestamp: new Date().toISOString()
      });

      // 2. Thông báo cho tài xế nếu có
      if (order.assignedDriverId) {
        const driver = driverService.getDriverById(order.assignedDriverId);
        if (driver && driver.socketId) {
          SocketResponse.emitSuccessToRoom(io, driver.socketId, 'order_cancelled', {
            orderId,
            reason: reason || 'Không có lý do',
            timestamp: new Date().toISOString()
          });
        }
      }

      return updatedOrder;
    } catch (error) {
      console.error('Lỗi khi hủy đơn hàng:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_CANCELLATION_FAILED, {
        message: 'Lỗi khi hủy đơn hàng: ' + error.message
      });
      return null;
    }
  }
}

module.exports = new OrderController(); 
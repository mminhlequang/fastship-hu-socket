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
      if ((order.process_status != null && order.process_status !== AppOrderProcessStatus.PENDING) || order.assignedDriver) {
        console.log(`Đơn hàng ${orderId} không cần tìm tài xế tiếp: status=${order.process_status}, assignedDriver=${order.assignedDriver}`);
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
      if (orderService.hasDriverRejected(orderId, driver.driverData.uid) ||
        orderService.hasDriverBeenNotified(orderId, driver.driverData.uid)) {
        // Bỏ qua tài xế này và chuyển sang tài xế tiếp theo
        order.nextDriverIndex++;
        return this.sendOrderToNextDriver(orderId, io);
      }

      // Đánh dấu tài xế đã nhận thông báo
      orderService.markDriverNotified(orderId, driver.driverData.uid);

      // Kiểm tra xem tài xế có online không và có socket không
      if (!driver.isOnline || !driver.socketId) {
        // Tài xế không online, chuyển sang tài xế tiếp theo
        order.nextDriverIndex++;
        return this.sendOrderToNextDriver(orderId, io);
      }

      // Gửi thông báo cho tài xế
      SocketResponse.emitSuccessToRoom(io, driver.socketId, 'new_order_request', {
        orderId,
        order: order.getOrderData(),
        customer: {
          customerId: order.customer.id,
          // Có thể thêm thông tin khách hàng nếu cần
        },
        distance: currentDriverInfo.distance ? `${currentDriverInfo.distance.toFixed(2)} km` : 'Không xác định',
        responseTimeout: 30, // Thời gian chờ phản hồi (giây)
        timestamp: new Date().toISOString()
      });

      // Thiết lập timeout để chuyển sang tài xế tiếp theo nếu không có phản hồi
      setTimeout(() => {
        // Kiểm tra lại xem đơn hàng có còn pending và chưa được gán không
        const currentOrder = orderService.getOrderById(orderId);
        if (currentOrder && (currentOrder.process_status == null || currentOrder.process_status !== AppOrderProcessStatus.PENDING) && !currentOrder.assignedDriver) {
          // Nếu tài xế hiện tại chưa phản hồi, chuyển sang tài xế tiếp theo
          if (!orderService.hasDriverRejected(orderId, driver.driverData.uid)) {
            // Đánh dấu là tài xế đã từ chối (timeout)
            orderService.markDriverRejected(orderId, driver.driverData.uid, 'Không phản hồi trong thời gian cho phép');

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
      if (!orderService.hasDriverBeenNotified(orderId, socket.driverData.uid)) {
        throw new Error('Tài xế không có trong danh sách được thông báo về đơn hàng này');
      }

      if (status === 'accepted') {
        // Tài xế chấp nhận đơn
        try {
          // Gán đơn hàng cho tài xế
          const updatedOrder = orderService.assignOrderToDriver(orderId, socket.driverData.uid);

          // Cập nhật trạng thái đơn hàng
          orderService.updateOrderStatus(orderId, AppOrderProcessStatus.DRIVER_ACCEPTED);

          // Thông báo cho tài xế
          SocketResponse.emitSuccess(socket, 'order_response_confirmed', {
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
              location: driverService.getDriverByUuid(socket.driverData.uid)?.location
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
        orderService.markDriverRejected(orderId, socket.driverData.uid, reason || 'Không có lý do');

        // Thông báo cho tài xế
        SocketResponse.emitSuccess(socket, 'order_response_confirmed', {
          status: 'success',
          orderId,
          orderStatus: 'rejected',
          timestamp: new Date().toISOString()
        });

        // Thông báo cho khách hàng
        SocketResponse.emitSuccessToRoom(io, `customer_${order.customer.id}`, 'driver_rejected_order', {
          orderId,
          driverId: socket.driverData.uid,
          reason: reason || 'Không có lý do',
          timestamp: new Date().toISOString()
        });

        // Tự động chuyển sang tài xế tiếp theo
        if ((order.process_status == null || order.process_status !== AppOrderProcessStatus.PENDING) && !order.assignedDriver) {
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
      } else if (socket.customerData && order.customer.id === socket.customerData.customerId) {
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
      SocketResponse.emitSuccess(socket, 'order_status_updated_confirmation', {
        status: 'success',
        orderId,
        orderStatus: status,
        timestamp: new Date().toISOString()
      });

      // Thông báo cho các bên liên quan
      // 1. Thông báo cho khách hàng
      SocketResponse.emitSuccessToRoom(io, `customer_${order.customer.id}`, 'order_status_updated', {
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
          SocketResponse.emitSuccessToRoom(io, driver.socketId, 'order_status_updated', {
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
      } else if (socket.customerData && order.customer.id === socket.customerData.customerId) {
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
      SocketResponse.emitSuccess(socket, 'order_cancelled_confirmation', {
        status: 'success',
        orderId,
        timestamp: new Date().toISOString()
      });

      // Thông báo cho các bên liên quan
      // 1. Thông báo cho khách hàng
      SocketResponse.emitSuccessToRoom(io, `customer_${order.customer.id}`, 'order_cancelled', {
        orderId,
        cancelledBy: cancelerType,
        reason: reason || 'Không có lý do',
        timestamp: new Date().toISOString()
      });

      // 2. Thông báo cho tài xế nếu có
      if (order.assignedDriver) {
        const driver = driverService.getDriverByUuid(order.assignedDriver);
        if (driver && driver.socketId) {
          SocketResponse.emitSuccessToRoom(io, driver.socketId, 'order_cancelled', {
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
      SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_CANCELLATION_FAILED, {
        message: 'Lỗi khi hủy đơn hàng: ' + error.message
      });
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
      SocketResponse.emitSuccess(socket, 'order_info', {
        status: 'success',
        order: order.getOrderData(),
        timestamp: new Date().toISOString()
      });

      return order;
    } catch (error) {
      console.error('Lỗi khi lấy thông tin đơn hàng:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_INFO_FETCH_FAILED, {
        message: 'Lỗi khi lấy thông tin đơn hàng: ' + error.message
      });
      return null;
    }
  } 


}

module.exports = new OrderController(); 
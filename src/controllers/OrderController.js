const orderService = require('../services/OrderService');
const driverService = require('../services/DriverService');
const fs = require('fs');
const path = require('path');
const SocketResponse = require('../utils/SocketResponse');
const { MessageCodes, AppOrderProcessStatus, FindDriverStatus, AppOrderDeliveryType } = require('../utils/Enums');

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
      const order = await orderService.createOrder(data);

      if (data.delivery_type == AppOrderDeliveryType.PICKUP) {
        // Phản hồi cho người tạo đơn
        SocketResponse.emitSuccess(socket, 'create_order_result', {
          id: order.id,
          process_status: AppOrderProcessStatus.STORE_ACCEPTED,
        });
      } else {
        // Phản hồi cho người tạo đơn
        SocketResponse.emitSuccess(socket, 'create_order_result', {
          id: order.id,
          process_status: AppOrderProcessStatus.FIND_DRIVER,
          find_driver_status: FindDriverStatus.FINDING,
        });

        // Tự động tìm tài xế
        this.findDriverForOrder(socket, order, io);
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
   * @param {Object} order - Đơn hàng
   * @param {Object} io - Socket.IO server instance
   */
  async findDriverForOrder (socket, order, io) {
    try {
      console.log(`[OrderController] Bắt đầu tìm tài xế cho đơn hàng ${order.id}`);

      // Tìm danh sách tài xế phù hợp
      const result = await orderService.findDriverForOrder(order);
      console.log(`[OrderController] Kết quả tìm tài xế:`, result ? `Tìm thấy ${result.driversList?.length || 0} tài xế` : 'Không tìm thấy tài xế nào');

      if (!result || !result.driversList || result.driversList.length === 0) {
        // Không tìm thấy tài xế
        console.log(`[OrderController] Không tìm thấy tài xế cho đơn hàng ${order.id}`);

        // Phản hồi cho người tạo đơn
        SocketResponse.emitSuccess(socket, 'create_order_result', {
          id: order.id,
          process_status: AppOrderProcessStatus.CANCELLED,
          find_driver_status: FindDriverStatus.NO_DRIVER,
        });

        await orderService.cancelOrder(order.id, FindDriverStatus.NO_DRIVER);
        return null;
      }

      // Lưu danh sách tài xế vào order
      order.driversList = result.driversList;
      order.nextDriverIndex = 0;

      console.log(`[OrderController] Danh sách tài xế cho đơn hàng ${order.id}:`,
        order.driversList.map(d => ({
          id: d.driver.id || d.driver.driverData?.id,
          isOnline: d.driver.isOnline,
          isBusy: d.driver.isBusy,
          hasSocketId: !!d.driver.socketId,
          distance: d.distance
        }))
      );

      // Thông báo cho người dùng rằng đang tìm tài xế
      // Phản hồi cho người tạo đơn
      SocketResponse.emitSuccess(socket, 'create_order_result', {
        id: order.id,
        process_status: AppOrderProcessStatus.FIND_DRIVER,
        find_driver_status: FindDriverStatus.AVAILABLE_DRIVERS,
        drivers: result.driversList
      });

      // Bắt đầu gửi thông báo cho tài xế  
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
      console.log(`[OrderController] Gửi thông báo đơn hàng ${orderId} cho tài xế tiếp theo`);

      const order = await orderService.getOrderById(orderId);
      if (!order) {
        console.error(`[OrderController] Không tìm thấy đơn hàng ${orderId}`);
        return null;
      }

      // Kiểm tra xem đơn hàng đã được gán cho tài xế nào chưa
      if ((order.process_status != null && order.process_status !== AppOrderProcessStatus.PENDING) || order.assignedDriverId) {
        console.log(`[OrderController] Đơn hàng ${orderId} không cần tìm tài xế tiếp: status=${order.process_status}, assignedDriverId=${order.assignedDriverId}`);
        return null;
      }

      // Nếu không có driversList, quá trình tìm tài xế chưa bắt đầu hoặc đã kết thúc
      if (!order.driversList || order.nextDriverIndex >= order.driversList.length) {
        console.log(`[OrderController] Hết danh sách tài xế cho đơn hàng ${orderId}. nextDriverIndex=${order.nextDriverIndex}, driversList.length=${order.driversList?.length}`);
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
      console.log(`[OrderController] Tài xế tiếp theo cho đơn hàng ${orderId}:`, {
        driverIndex: order.nextDriverIndex,
        driverId: driver.driverData?.id,
        isOnline: driver.isOnline,
        socketId: driver.socketId,
        distance: currentDriverInfo.distance
      });

      // Kiểm tra xem tài xế đã từ chối đơn hàng này chưa hoặc đã nhận thông báo chưa
      const hasRejected = await orderService.hasDriverRejected(orderId, driver.driverData.id);
      const hasBeenNotified = await orderService.hasDriverBeenNotified(orderId, driver.driverData.id);

      console.log(`[OrderController] Kiểm tra tài xế ${driver.driverData.id} cho đơn hàng ${orderId}:`, {
        hasRejected,
        hasBeenNotified
      });

      if (hasRejected || hasBeenNotified) {
        // Bỏ qua tài xế này và chuyển sang tài xế tiếp theo
        console.log(`[OrderController] Bỏ qua tài xế ${driver.driverData.id} vì đã từ chối hoặc đã nhận thông báo`);
        order.nextDriverIndex++;
        return this.sendOrderToNextDriver(orderId, io);
      }

      // Đánh dấu tài xế đã nhận thông báo
      await orderService.markDriverNotified(orderId, driver.driverData.id);
      console.log(`[OrderController] Đã đánh dấu tài xế ${driver.driverData.id} đã nhận thông báo cho đơn hàng ${orderId}`);

      // Kiểm tra xem tài xế có online không và có socket không
      if (!driver.isOnline || !driver.socketId) {
        // Tài xế không online, chuyển sang tài xế tiếp theo
        console.log(`[OrderController] Tài xế ${driver.driverData.id} không online hoặc không có socketId, chuyển sang tài xế tiếp theo`);
        order.nextDriverIndex++;
        return this.sendOrderToNextDriver(orderId, io);
      }

      // Gửi thông báo cho tài xế
      console.log(`[OrderController] Gửi thông báo đơn hàng ${orderId} đến tài xế ${driver.driverData.id} với socketId ${driver.socketId}`);
      SocketResponse.emitSuccessToRoom(io, driver.socketId, 'driver_new_order_request', {
        order: order.getOrderData(),
        responseTimeout: 30, // Thời gian chờ phản hồi (giây)
        timestamp: new Date().toISOString()
      });

      // Thiết lập timeout để chuyển sang tài xế tiếp theo nếu không có phản hồi
      setTimeout(async () => {
        console.log(`[OrderController] Timeout kiểm tra phản hồi của tài xế ${driver.driverData.id} cho đơn hàng ${orderId}`);

        // Kiểm tra lại xem đơn hàng có còn pending và chưa được gán không
        const currentOrder = await orderService.getOrderById(orderId);

        console.log(`[OrderController] Kiểm tra trạng thái đơn hàng ${orderId}: process_status=${currentOrder?.process_status}, assignedDriverId=${currentOrder?.assignedDriverId}`);

        if (currentOrder && (currentOrder.process_status == null || currentOrder.process_status !== AppOrderProcessStatus.PENDING) && !currentOrder.assignedDriverId) {
          // Nếu tài xế hiện tại chưa phản hồi, chuyển sang tài xế tiếp theo
          const hasRejectedAfterTimeout = await orderService.hasDriverRejected(orderId, driver.driverData.id);
          console.log(`[OrderController] Timeout check: tài xế ${driver.driverData.id} đã từ chối đơn hàng ${orderId}: ${hasRejectedAfterTimeout}`);

          if (!hasRejectedAfterTimeout) {
            // Đánh dấu là tài xế đã từ chối (timeout)
            await orderService.markDriverRejected(orderId, driver.driverData.id, 'Không phản hồi trong thời gian cho phép');
            console.log(`[OrderController] Đánh dấu tài xế ${driver.driverData.id} đã từ chối (timeout) đơn hàng ${orderId}`);

            // Thông báo cho tài xế rằng đã hết thời gian
            if (driver.socketId) {
              console.log(`[OrderController] Gửi thông báo timeout cho tài xế ${driver.driverData.id}`);
              SocketResponse.emitToRoom(io, driver.socketId, 'order_request_timeout', true, MessageCodes.REQUEST_TIMEOUT, {
                orderId,
                message: 'Hết thời gian phản hồi cho đơn hàng này'
              });
            }
          }

          // Cập nhật chỉ số và gửi cho tài xế tiếp theo
          currentOrder.nextDriverIndex++;
          console.log(`[OrderController] Cập nhật nextDriverIndex thành ${currentOrder.nextDriverIndex} và chuyển sang tài xế tiếp theo cho đơn hàng ${orderId}`);
          this.sendOrderToNextDriver(orderId, io);
        } else {
          console.log(`[OrderController] Không cần chuyển tài xế tiếp theo vì đơn hàng ${orderId} đã được xử lý. process_status=${currentOrder?.process_status}, assignedDriverId=${currentOrder?.assignedDriverId}`);
        }
      }, 30000); // 30 giây

      return driver;
    } catch (error) {
      console.error(`[OrderController] Lỗi khi gửi thông báo đơn hàng ${orderId} cho tài xế tiếp theo:`, error);
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
      const order = await orderService.getOrderById(orderId);
      if (!order) {
        throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
      }

      // Kiểm tra tài xế có trong danh sách được thông báo không
      if (!await orderService.hasDriverBeenNotified(orderId, socket.driverData.id)) {
        throw new Error('Tài xế không có trong danh sách được thông báo về đơn hàng này');
      }

      if (status === 'accepted') {
        // Tài xế chấp nhận đơn
        try {
          // Gán đơn hàng cho tài xế
          const updatedOrder = await orderService.assignOrderToDriver(orderId, socket.driverData.id);

          // Cập nhật trạng thái đơn hàng
          await orderService.updateOrderStatus(orderId, AppOrderProcessStatus.DRIVER_ACCEPTED, null, socket.driverData.id);

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
        await orderService.markDriverRejected(orderId, socket.driverData.id, reason || 'Không có lý do');

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
      const { orderId, processStatus, storeStatus } = data;

      if (!orderId) {
        throw new Error('orderId là bắt buộc');
      }

      if (!processStatus && !storeStatus) {
        throw new Error('processStatus hoặc storeStatus là bắt buộc');
      }

      // Lấy thông tin đơn hàng
      const order = await orderService.getOrderById(orderId);
      if (!order) {
        throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
      }

      // Cập nhật trạng thái
      const updatedStatus = await orderService.updateOrderStatus(orderId, processStatus, storeStatus, null, socket.accessToken);

      // Phản hồi cho người cập nhật
      SocketResponse.emitSuccess(socket, 'order_status_updated_confirmation', {
        status: 'success',
        orderId,
        processStatus: processStatus,
        storeStatus: storeStatus,
        timestamp: new Date().toISOString()
      });

      // Thông báo cho các bên liên quan
      // 1. Thông báo cho khách hàng
      SocketResponse.emitSuccessToRoom(io, `customer_${order.customer.id}`, 'order_status_updated', {
        orderId,
        processStatus: processStatus,
        storeStatus: storeStatus,
        timestamp: new Date().toISOString()
      });

      // 2. Thông báo cho tài xế nếu có
      if (order.assignedDriverId) {
        const driver = driverService.getDriverById(order.assignedDriverId);
        if (driver && driver.socketId) {
          SocketResponse.emitSuccessToRoom(io, driver.socketId, 'order_status_updated', {
            orderId,
            processStatus: processStatus,
            storeStatus: storeStatus,
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
      const order = await orderService.getOrderById(orderId, false);

      await orderService.completeOrder(orderId);

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

    } catch (error) {
      console.error('Lỗi khi hoàn thành đơn hàng:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_COMPLETE_FAILED, {
        message: 'Lỗi khi hoàn thành đơn hàng: ' + error.message
      });
    }
    return null;
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

      const order = await orderService.getOrderById(orderId);

      await orderService.cancelOrder(orderId, reason || 'Không có lý do');

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

    } catch (error) {
      console.error('Lỗi khi hủy đơn hàng:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.ORDER_CANCELLATION_FAILED, {
        message: 'Lỗi khi hủy đơn hàng: ' + error.message
      });
    }
    return null;
  }
}

module.exports = new OrderController(); 
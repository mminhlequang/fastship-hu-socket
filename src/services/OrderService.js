const Order = require('../models/Order');
const driverService = require('./DriverService');

class OrderService {
  constructor () {
    this.orders = {}; // Lưu trữ các đơn hàng theo ID
    this.pendingNotifications = {}; // Lưu trữ các timeout cho việc thông báo đơn hàng
  }

  // Tạo đơn hàng mới
  createOrder (orderId, pickupLocation, deliveryLocation, price, requirementAmount) {
    const order = new Order(orderId, pickupLocation, deliveryLocation, price, requirementAmount);
    this.orders[orderId] = order;
    return order;
  }

  // Lấy đơn hàng theo ID
  getOrder (orderId) {
    return this.orders[orderId] || null;
  }

  // Hủy thông báo cho tài xế
  cancelOrderNotification (orderId) {
    if (this.pendingNotifications[orderId]) {
      clearTimeout(this.pendingNotifications[orderId]);
      delete this.pendingNotifications[orderId];
    }
  }

  // Tìm và sắp xếp tài xế phù hợp cho đơn hàng
  findDriversForOrder (orderId) {
    const order = this.orders[orderId];
    if (!order) return null;

    // Tìm tài xế phù hợp dựa trên vị trí và số dư ví
    const priorityDrivers = driverService.getPriorityDriversForOrder(
      order.deliveryLocation,
      order.requirementAmount
    );

    // Thiết lập danh sách tài xế ưu tiên
    order.setPriorityDrivers(priorityDrivers);

    return priorityDrivers;
  }

  // Chấp nhận đơn hàng
  acceptOrder (orderId, driverId) {
    const order = this.orders[orderId];
    if (!order || order.status !== 'pending') return null;

    // Cập nhật trạng thái và gán tài xế
    order.updateStatus('accepted');
    order.assignDriver(driverId);

    // Cập nhật trạng thái tài xế là bận
    const driver = driverService.getDriverByUuid(driverId);
    if (driver) {
      driver.setBusyStatus(true);
    }

    // Hủy timeout nếu có
    this.cancelOrderNotification(orderId);

    return order;
  }

  // Hoàn thành đơn hàng
  completeOrder (orderId) {
    const order = this.orders[orderId];
    if (!order || order.status !== 'accepted') return null;

    // Cập nhật trạng thái
    order.updateStatus('completed');

    // Cập nhật trạng thái tài xế không còn bận
    if (order.driverId) {
      const driver = driverService.getDriverByUuid(order.driverId);
      if (driver) {
        driver.setBusyStatus(false);
      }
    }

    return order;
  }

  // Hủy đơn hàng
  cancelOrder (orderId) {
    const order = this.orders[orderId];
    if (!order || order.status === 'completed') return null;

    // Cập nhật trạng thái
    order.updateStatus('cancelled');

    // Cập nhật trạng thái tài xế không còn bận nếu đã có tài xế nhận
    if (order.driverId) {
      const driver = driverService.getDriverByUuid(order.driverId);
      if (driver) {
        driver.setBusyStatus(false);
      }
    }

    // Hủy timeout nếu có
    this.cancelOrderNotification(orderId);

    return order;
  }
}

module.exports = new OrderService(); 
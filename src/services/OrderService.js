const Order = require('../models/Order');
const driverService = require('./DriverService');
const { v4: uuidv4 } = require('uuid');

class OrderService {
  constructor () {
    this.orders = {}; // Lưu trữ đơn hàng theo orderId
    this.customerOrders = {}; // Lưu trữ danh sách đơn hàng theo customerId
    this.driverOrders = {}; // Lưu trữ danh sách đơn hàng theo driverId
  }

  // Tạo đơn hàng mới
  createOrder (orderData) {
    // Tạo ID đơn hàng nếu chưa có
    if (!orderData.orderId) {
      orderData.orderId = uuidv4();
    }

    // Kiểm tra customerId
    if (!orderData.customerId) {
      throw new Error('customerId là bắt buộc');
    }

    // Tạo đơn hàng mới
    const order = new Order(orderData);

    // Lưu vào danh sách đơn hàng
    this.orders[order.orderId] = order;

    // Lưu vào danh sách đơn hàng của khách hàng
    if (!this.customerOrders[order.customerId]) {
      this.customerOrders[order.customerId] = [];
    }
    this.customerOrders[order.customerId].push(order.orderId);

    console.log(`Đã tạo đơn hàng mới: ${order.orderId} cho khách hàng ${order.customerId}`);

    return order;
  }

  // Lấy đơn hàng theo ID
  getOrderById (orderId) {
    return this.orders[orderId] || null;
  }

  // Lấy danh sách đơn hàng của khách hàng
  getOrdersByCustomerId (customerId) {
    const orderIds = this.customerOrders[customerId] || [];
    return orderIds.map(id => this.orders[id]).filter(Boolean);
  }

  // Lấy danh sách đơn hàng của tài xế
  getOrdersByDriverId (driverId) {
    const orderIds = this.driverOrders[driverId] || [];
    return orderIds.map(id => this.orders[id]).filter(Boolean);
  }

  // Tìm tài xế phù hợp cho đơn hàng
  findDriverForOrder (orderId) {
    const order = this.getOrderById(orderId);

    if (!order) {
      throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
    }

    if (order.status !== 'pending') {
      throw new Error(`Đơn hàng không ở trạng thái chờ: ${orderId}`);
    }

    // Lấy danh sách tài xế đang hoạt động
    const availableDrivers = driverService.getOnlineDrivers(false);

    if (availableDrivers.length === 0) {
      console.log(`Không có tài xế khả dụng cho đơn hàng: ${orderId}`);
      return null;
    }

    // Nếu có tọa độ trong orderDetails, sắp xếp tài xế theo khoảng cách
    if (order.orderDetails.pickupLocation) {
      const { lat, lng } = order.orderDetails.pickupLocation;

      // Tính khoảng cách cho mỗi tài xế
      const driversWithDistance = availableDrivers
        .filter(driver => driver.location)
        .map(driver => {
          const distance = driverService.calculateDistance(
            lat, lng,
            driver.location.lat, driver.location.lng
          );
          return { driver, distance };
        })
        .sort((a, b) => a.distance - b.distance);

      // Trả về mảng đã sắp xếp theo khoảng cách
      if (driversWithDistance.length > 0) {
        return {
          driversList: driversWithDistance,
          nextDriverIndex: 0
        };
      }
    }

    // Nếu không có tọa độ hoặc không tìm được tài xế gần nhất, trả về danh sách ngẫu nhiên
    const randomizedDrivers = [...availableDrivers].map(driver => ({
      driver,
      distance: null
    }));

    return {
      driversList: randomizedDrivers,
      nextDriverIndex: 0
    };
  }

  // Lấy tài xế tiếp theo từ danh sách đã sắp xếp
  getNextDriverForOrder (orderId, driversList, currentIndex) {
    if (!driversList || !Array.isArray(driversList) || driversList.length === 0) {
      return null;
    }

    if (currentIndex >= driversList.length) {
      return null; // Hết danh sách tài xế
    }

    return driversList[currentIndex];
  }

  // Đánh dấu tài xế đã được gửi thông báo chờ phản hồi
  markDriverNotified (orderId, driverId) {
    const order = this.getOrderById(orderId);
    if (!order) return false;

    // Lưu lại danh sách tài xế đã được thông báo
    if (!order.notifiedDrivers) {
      order.notifiedDrivers = [];
    }

    if (!order.notifiedDrivers.includes(driverId)) {
      order.notifiedDrivers.push(driverId);
    }

    return true;
  }

  // Đánh dấu tài xế đã từ chối đơn hàng
  markDriverRejected (orderId, driverId, reason = 'Không có lý do') {
    const order = this.getOrderById(orderId);
    if (!order) return false;

    // Lưu lại danh sách tài xế đã từ chối
    if (!order.rejectedDrivers) {
      order.rejectedDrivers = [];
    }

    if (!order.rejectedDrivers.find(d => d.driverId === driverId)) {
      order.rejectedDrivers.push({
        driverId,
        reason,
        timestamp: new Date().toISOString()
      });
    }

    return true;
  }

  // Kiểm tra xem tài xế đã được thông báo chưa
  hasDriverBeenNotified (orderId, driverId) {
    const order = this.getOrderById(orderId);
    if (!order || !order.notifiedDrivers) return false;

    return order.notifiedDrivers.includes(driverId);
  }

  // Kiểm tra xem tài xế đã từ chối chưa
  hasDriverRejected (orderId, driverId) {
    const order = this.getOrderById(orderId);
    if (!order || !order.rejectedDrivers) return false;

    return order.rejectedDrivers.some(d => d.driverId === driverId);
  }

  // Gán đơn hàng cho tài xế
  assignOrderToDriver (orderId, driverId) {
    const order = this.getOrderById(orderId);

    if (!order) {
      throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
    }

    // Kiểm tra tài xế
    const driver = driverService.getDriverByUuid(driverId);
    if (!driver) {
      throw new Error(`Tài xế không tồn tại: ${driverId}`);
    }

    if (!driver.isOnline) {
      throw new Error(`Tài xế không online: ${driverId}`);
    }

    if (driver.isBusy) {
      throw new Error(`Tài xế đang bận: ${driverId}`);
    }

    // Cập nhật trạng thái đơn hàng
    order.assignDriver(driverId);

    // Cập nhật trạng thái tài xế
    driver.setBusyStatus(true);

    // Lưu vào danh sách đơn hàng của tài xế
    if (!this.driverOrders[driverId]) {
      this.driverOrders[driverId] = [];
    }
    this.driverOrders[driverId].push(orderId);

    console.log(`Đã gán đơn hàng ${orderId} cho tài xế ${driverId}`);

    return order;
  }

  // Cập nhật trạng thái đơn hàng
  updateOrderStatus (orderId, newStatus, data = {}) {
    const order = this.getOrderById(orderId);

    if (!order) {
      throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
    }

    // Xử lý các trường hợp đặc biệt
    if (newStatus === 'completed') {
      // Khi hoàn thành đơn, cập nhật trạng thái tài xế
      if (order.assignedDriver) {
        const driver = driverService.getDriverByUuid(order.assignedDriver);
        if (driver) {
          driver.setBusyStatus(false);
        }
      }
    } else if (newStatus === 'cancelled') {
      // Khi hủy đơn, cập nhật trạng thái tài xế
      if (order.assignedDriver) {
        const driver = driverService.getDriverByUuid(order.assignedDriver);
        if (driver) {
          driver.setBusyStatus(false);
        }
      }
    }

    // Cập nhật trạng thái đơn hàng
    return order.updateStatus(newStatus, data);
  }

  // Lấy tất cả đơn hàng theo trạng thái
  getOrdersByStatus (status) {
    return Object.values(this.orders).filter(order => order.status === status);
  }

  // Lấy tất cả đơn hàng
  getAllOrders () {
    return Object.values(this.orders);
  }
}

module.exports = new OrderService(); 
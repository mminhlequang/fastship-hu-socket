const Order = require('../models/Order');
const { AppOrderProcessStatus } = require('../utils/MessageCodes');
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
    if (!orderData.id) {
      orderData.id = uuidv4();
    }

    // Tạo đơn hàng mới
    const order = new Order(orderData);

    // Lưu vào danh sách đơn hàng
    this.orders[order.id] = order;

    // Lưu vào danh sách đơn hàng của khách hàng
    if (!this.customerOrders[order.customer.id]) {
      this.customerOrders[order.customer.id] = [];
    }
    this.customerOrders[order.customer.id].push(order.id);

    console.log(`Đã tạo đơn hàng mới: ${order.id} cho khách hàng ${order.customer.id}`);

    return order;
  }

  // Lấy đơn hàng theo ID
  getOrderById (id) {
    return this.orders[id] || null;
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
  findDriverForOrder (order) {
    const orderId = order.id;

    // Lấy danh sách tài xế đang hoạt động
    const availableDrivers = driverService.getOnlineDrivers(false);

    if (availableDrivers.length === 0) {
      console.log(`Không có tài xế khả dụng cho đơn hàng: ${orderId}`);
      return null;
    }

    // Nếu có tọa độ trong orderDetails, sắp xếp tài xế theo khoảng cách
    if (order.store.lat && order.store.lng) {
      const { lat, lng } = order.store;

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

    console.log('driver', driver);

    // Cập nhật trạng thái đơn hàng
    order.assignDriver(driver.id);

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
    if (newStatus === AppOrderProcessStatus.COMPLETED) {
      // Khi hoàn thành đơn, cập nhật trạng thái tài xế
      if (order.assignedDriver) {
        const driver = driverService.getDriverByUuid(order.assignedDriver);
        if (driver) {
          driver.setBusyStatus(false);
        }
      }
    } else if (newStatus === AppOrderProcessStatus.CANCELLED) {
      // Khi hủy đơn, cập nhật trạng thái tài xế
      if (order.assignedDriver) {
        const driver = driverService.getDriverByUuid(order.assignedDriver);
        if (driver) {
          driver.setBusyStatus(false);
        }
      }
    }

    this.callApiUpdateOrder(orderId, newStatus, order.driver_id, order.token);
    return order.updateStatus(newStatus, data);
  }

  /**
   * Gọi API chung
   * @param {string} endpoint - Đường dẫn API endpoint
   * @param {Object} data - Dữ liệu gửi đi
   * @param {string} token - Token xác thực
   * @param {string} method - Phương thức HTTP (mặc định là POST)
   * @returns {Promise<Object>} - Kết quả từ API
   */
  async callApi (endpoint, data, token, method = 'POST') {
    try {
      if (!token) {
        throw new Error('Token xác thực là bắt buộc');
      }

      const response = await fetch(`https://zennail23.com/api/v1/${endpoint}`, {
        method: method,
        headers: {
          'accept': '*/*',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': ''
        },
        body: JSON.stringify(data)
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(`Lỗi API: ${responseData.message || 'Không xác định'}`);
      }

      return responseData;
    } catch (error) {
      console.error(`Lỗi khi gọi API ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Gọi API để gán tài xế hoặc cập nhật trạng thái đơn hàng
   * @param {number} orderId - ID của đơn hàng
   * @param {string} processStatus - Trạng thái mới của đơn hàng
   * @param {number|null} driverId - ID của tài xế (nếu có)
   * @param {string} token - Token xác thực của khách hàng
   * @returns {Promise<Object>} - Kết quả từ API
   */
  async callApiUpdateOrder (orderId, processStatus, driverId = null, token) {
    try {
      // Kiểm tra tham số đầu vào
      if (!orderId) {
        throw new Error('ID đơn hàng là bắt buộc');
      }

      if (!processStatus) {
        throw new Error('Trạng thái đơn hàng là bắt buộc');
      }

      // Chuẩn bị dữ liệu gửi đi
      const requestData = {
        id: orderId,
        process_status: processStatus
      };

      // Thêm driver_id nếu có
      if (driverId) {
        requestData.driver_id = driverId;
      }

      const responseData = await this.callApi('order/update', requestData, token);
      console.log(`Đã cập nhật đơn hàng ${orderId} thành công:`, responseData);
      return responseData;
    } catch (error) {
      console.error('Lỗi khi gọi API cập nhật đơn hàng:', error);
      throw error;
    }
  }


  /**
   * Gọi API để hoàn thành đơn hàng
   * @param {number} orderId - ID của đơn hàng
   * @param {string} token - Token xác thực của khách hàng
   * @returns {Promise<Object>} - Kết quả từ API
   */
  async callApiCompleteOrder (orderId, token) {
    try {
      // Kiểm tra tham số đầu vào
      if (!orderId) {
        throw new Error('ID đơn hàng là bắt buộc');
      }

      // Chuẩn bị dữ liệu gửi đi
      const requestData = {
        id: orderId,
      };

      const responseData = await this.callApi('order/complete', requestData, token);
      console.log(`Đã hoàn thành đơn hàng ${orderId} thành công:`, responseData);
      return responseData;
    } catch (error) {
      console.error('Lỗi khi gọi API hoàn thành đơn hàng:', error);
      throw error;
    }
  }


  /**
   * Gọi API để hủy đơn hàng
   * @param {number} orderId - ID của đơn hàng
   * @param {string} cancel_note - Lý do hủy đơn hàng
   * @param {string} token - Token xác thực của khách hàng
   * @returns {Promise<Object>} - Kết quả từ API
   */
  async callApiCancelOrder (orderId, cancel_note, token) {
    try {
      // Kiểm tra tham số đầu vào
      if (!orderId) {
        throw new Error('ID đơn hàng là bắt buộc');
      }

      // Chuẩn bị dữ liệu gửi đi
      const requestData = {
        id: orderId,
        cancel_note: cancel_note
      };

      const responseData = await this.callApi('order/cancel', requestData, token);
      console.log(`Đã hủy đơn hàng ${orderId} thành công:`, responseData);
      return responseData;
    } catch (error) {
      console.error('Lỗi khi gọi API hủy đơn hàng:', error);
      throw error;
    }
  }

}

module.exports = new OrderService(); 
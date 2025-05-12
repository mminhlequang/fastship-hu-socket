const Order = require('../models/Order');
const { AppOrderProcessStatus, AppConfig } = require('../utils/Enums');
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
  async getOrderById (id, isCache = true) {
    // Nếu không có trong cache, gọi API để lấy thông tin đơn hàng

    if (isCache && this.orders[id]) {
      return this.orders[id];
    }

    try {
      const response = await fetch(`${AppConfig.HOST_API}/order/detail?id=${id}`, {
        method: 'GET',
        headers: {
          'accept': '*/*',
          'X-CSRF-TOKEN': ''
        }
      });

      if (!response.ok) {
        console.error(`Lỗi khi lấy thông tin đơn hàng ${id}: ${response.status}`);
        return null;
      }

      const responseData = await response.json();
      const token = this.orders[id]?.token;

      // Lưu vào cache nếu có dữ liệu trả về
      if (responseData && responseData.data) {
        if (!this.orders) this.orders = {};
        this.orders[id] = new Order(responseData.data);
        this.orders[id].token = token;
        return this.orders[id];
      }

      return null;
    } catch (error) {
      console.error(`Lỗi khi gọi API lấy thông tin đơn hàng ${id}:`, error);
      return null;
    }
  }
  /**
   * Lấy đơn hàng đang hoạt động (chưa hoàn thành/hủy) của tài xế
   * @param {string} driverId - ID của tài xế
   * @returns {Order|null} - Đơn hàng đang hoạt động hoặc null nếu không có
   */
  async getActiveOrderByDriverUid (driverId) {
    console.log(`Tìm đơn hàng đang hoạt động cho tài xế: ${driverId}`);
    const orderIds = this.driverOrders[driverId] || [];
    console.log(`Số lượng đơn hàng của tài xế ${driverId}: ${orderIds.length}`);

    for (const orderId of orderIds) {
      console.log(`Kiểm tra đơn hàng: ${orderId}`);
      const order = await this.getOrderById(orderId);

      if (!order) {
        console.log(`Không tìm thấy đơn hàng: ${orderId}`);
        continue;
      }

      console.log(`Trạng thái đơn hàng ${orderId}: ${order.process_status}`);

      if (
        order &&
        order.process_status !== AppOrderProcessStatus.COMPLETED &&
        order.process_status !== AppOrderProcessStatus.CANCELLED
      ) {
        console.log(`Tìm thấy đơn hàng đang hoạt động: ${orderId}`);
        return order; // Return the first active order found
      }
    }

    console.log(`Không tìm thấy đơn hàng đang hoạt động cho tài xế: ${driverId}`);
    return null; // No active order found
  }

  // Tìm tài xế phù hợp cho đơn hàng
  findDriverForOrder (order) {
    const orderId = order.id;

    // Lấy danh sách tài xế đang hoạt động
    const availableDrivers = driverService.getOnlineDrivers(false);
    console.log(`[OrderService] Tìm tài xế cho đơn hàng ${orderId}. Số lượng tài xế online: ${availableDrivers.length}`);

    if (availableDrivers.length === 0) {
      console.log(`[OrderService] Không có tài xế khả dụng cho đơn hàng: ${orderId}`);
      return null;
    }

    // Log danh sách tài xế online
    console.log(`[OrderService] Danh sách tài xế online:`, availableDrivers.map(driver => ({
      id: driver.id || driver.driverData?.id,
      isOnline: driver.isOnline,
      isBusy: driver.isBusy,
      socketId: driver.socketId
    })));

    // Nếu có tọa độ trong orderDetails, sắp xếp tài xế theo khoảng cách
    if (order.store?.lat && order.store?.lng) {
      const { lat, lng } = order.store;
      console.log(`[OrderService] Tìm tài xế theo khoảng cách cho đơn hàng ${orderId}. Tọa độ cửa hàng: lat=${lat}, lng=${lng}`);

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

      console.log(`[OrderService] Số lượng tài xế có vị trí và có thể tính khoảng cách: ${driversWithDistance.length}`);

      // Trả về mảng đã sắp xếp theo khoảng cách
      if (driversWithDistance.length > 0) {
        console.log(`[OrderService] Tài xế gần nhất cho đơn hàng ${orderId}: driverId=${driversWithDistance[0].driver.id || driversWithDistance[0].driver.driverData?.id}, distance=${driversWithDistance[0].distance}km`);
        return {
          driversList: driversWithDistance,
          nextDriverIndex: 0
        };
      }
    } else {
      console.log(`[OrderService] Không có tọa độ cửa hàng cho đơn hàng ${orderId}. store.lat=${order.store?.lat}, store.lng=${order.store?.lng}`);
    }

    // Nếu không có tọa độ hoặc không tìm được tài xế gần nhất, trả về danh sách ngẫu nhiên
    const randomizedDrivers = [...availableDrivers].map(driver => ({
      driver,
      distance: null
    }));

    console.log(`[OrderService] Trả về danh sách tài xế ngẫu nhiên cho đơn hàng ${orderId}. Số lượng: ${randomizedDrivers.length}`);
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
  async markDriverNotified (orderId, driverId) {
    const order = await this.getOrderById(orderId);
    if (!order) {
      console.log(`[OrderService] markDriverNotified: Không tìm thấy đơn hàng ${orderId}`);
      return false;
    }

    // Lưu lại danh sách tài xế đã được thông báo
    if (!order.notifiedDrivers) {
      order.notifiedDrivers = [];
    }

    if (!order.notifiedDrivers.includes(driverId)) {
      order.notifiedDrivers.push(driverId);
      console.log(`[OrderService] Đã đánh dấu tài xế ${driverId} đã nhận thông báo cho đơn hàng ${orderId}. Danh sách notifiedDrivers: ${order.notifiedDrivers}`);
    } else {
      console.log(`[OrderService] Tài xế ${driverId} đã có trong danh sách notifiedDrivers của đơn hàng ${orderId}`);
    }

    return true;
  }

  // Đánh dấu tài xế đã từ chối đơn hàng
  async markDriverRejected (orderId, driverId, reason = 'Không có lý do') {
    const order = await this.getOrderById(orderId);
    if (!order) {
      console.log(`[OrderService] markDriverRejected: Không tìm thấy đơn hàng ${orderId}`);
      return false;
    }

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
      console.log(`[OrderService] Đã đánh dấu tài xế ${driverId} đã từ chối đơn hàng ${orderId} với lý do: ${reason}. Số lượng tài xế đã từ chối: ${order.rejectedDrivers.length}`);
    } else {
      console.log(`[OrderService] Tài xế ${driverId} đã có trong danh sách rejectedDrivers của đơn hàng ${orderId}`);
    }

    return true;
  }

  // Kiểm tra xem tài xế đã được thông báo chưa
  async hasDriverBeenNotified (orderId, driverId) {
    const order = await this.getOrderById(orderId);
    if (!order || !order.notifiedDrivers) {
      console.log(`[OrderService] hasDriverBeenNotified: Đơn hàng ${orderId} không tồn tại hoặc không có danh sách notifiedDrivers`);
      return false;
    }

    const result = order.notifiedDrivers.includes(driverId);
    console.log(`[OrderService] Tài xế ${driverId} ${result ? "đã" : "chưa"} được thông báo về đơn hàng ${orderId}`);
    return result;
  }

  // Kiểm tra xem tài xế đã từ chối chưa
  async hasDriverRejected (orderId, driverId) {
    const order = await this.getOrderById(orderId);
    if (!order || !order.rejectedDrivers) {
      console.log(`[OrderService] hasDriverRejected: Đơn hàng ${orderId} không tồn tại hoặc không có danh sách rejectedDrivers`);
      return false;
    }

    const result = order.rejectedDrivers.some(d => d.driverId === driverId);
    console.log(`[OrderService] Tài xế ${driverId} ${result ? "đã" : "chưa"} từ chối đơn hàng ${orderId}`);
    return result;
  }

  // Gán đơn hàng cho tài xế
  async assignOrderToDriver (orderId, driverId) {
    const order = await this.getOrderById(orderId);

    if (!order) {
      throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
    }

    // Kiểm tra tài xế
    const driver = driverService.getDriverById(driverId);
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
  async updateOrderStatus (orderId, processStatus, storeStatus = null, driverId = null, token = null) {
    const order = await this.getOrderById(orderId);

    if (!order) {
      throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
    }

    this.callApiUpdateOrder(orderId, processStatus, storeStatus, driverId, token || order.token);
    return order.updateStatus(processStatus, storeStatus, driverId);
  }

  // Cập nhật trạng thái đơn hàng
  async completeOrder (orderId) {
    const order = await this.getOrderById(orderId, false);

    if (!order) {
      throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
    }

    // Khi hoàn thành đơn, cập nhật trạng thái tài xế
    if (order.driver?.id) {
      const driver = driverService.getDriverById(order.driver.id);
      if (driver) {
        driver.setBusyStatus(false);
      }
    }

    this.callApiCompleteOrder(orderId, order.token);
    return order.updateStatus(AppOrderProcessStatus.COMPLETED);
  }

  // Cập nhật trạng thái đơn hàng
  async cancelOrder (orderId, reason) {
    const order = await this.getOrderById(orderId, false);

    if (!order) {
      throw new Error(`Đơn hàng không tồn tại: ${orderId}`);
    }

    // Khi hủy đơn, cập nhật trạng thái tài xế
    if (order.driver?.id) {
      const driver = driverService.getDriverById(order.driver.id);
      if (driver) {
        driver.setBusyStatus(false);
      }

    }

    this.callApiCancelOrder(orderId, reason, order.token);
    return order.updateStatus(AppOrderProcessStatus.CANCELLED);
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

      const response = await fetch(`${AppConfig.HOST_API}/${endpoint}`, {
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
  async callApiUpdateOrder (orderId, processStatus, storeStatus, driverId = null, token) {
    try {
      // Kiểm tra tham số đầu vào
      if (!orderId) {
        throw new Error('ID đơn hàng là bắt buộc');
      }

      if (!processStatus && !storeStatus) {
        throw new Error('Trạng thái đơn hàng là bắt buộc');
      }

      // Chuẩn bị dữ liệu gửi đi
      const requestData = {
        id: orderId,
        process_status: processStatus,
        store_status: storeStatus
      };

      // Thêm driver_id nếu có
      if (driverId) {
        requestData.driver_id = driverId;
      }

      console.log(`Cập nhật đơn hàng ${orderId}:`, requestData);
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
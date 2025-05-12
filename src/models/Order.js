const { AppOrderProcessStatus } = require('../utils/Enums');

/**
 * Model lưu trữ thông tin đơn hàng
 */
class Order {
  constructor (orderData) {
    this.token = orderData.accessToken;

    // Thông tin cơ bản
    this.id = orderData.id;
    this.code = orderData.code;
    this.currency = orderData.currency;
    this.payment_type = orderData.payment_type;
    this.payment_status = orderData.payment_status;
    this.process_status = orderData.process_status;
    this.store_status = orderData.store_status;
    this.delivery_type = orderData.delivery_type;
    this.note = orderData.note;
    this.cancel_note = orderData.cancel_note;

    // Thông tin thanh toán
    this.payment = orderData.payment || null;

    // Thông tin cửa hàng
    this.store = orderData.store || null;

    // Thông tin khách hàng
    this.customer = orderData.customer || null;

    // Thông tin tài xế
    this.driver = orderData.driver || null;

    // Danh sách sản phẩm
    this.items = orderData.items || [];

    // Thông tin phí và khoảng cách
    this.ship_fee = orderData.ship_fee || 0;
    this.tip = orderData.tip || 0;
    this.discount = orderData.discount || 0;
    this.application_fee = orderData.application_fee || 0;
    this.subtotal = orderData.subtotal || 0;
    this.total = orderData.total || 0;
    this.ship_distance = orderData.ship_distance || 0;
    this.ship_estimate_time = orderData.ship_estimate_time;
    this.ship_polyline = orderData.ship_polyline;
    this.ship_here_raw = orderData.ship_here_raw;

    // Thông tin địa chỉ
    this.phone = orderData.phone;
    this.street = orderData.street;
    this.zip = orderData.zip;
    this.city = orderData.city;
    this.state = orderData.state;
    this.country = orderData.country;
    this.country_code = orderData.country_code;
    this.lat = orderData.lat;
    this.lng = orderData.lng;
    this.address = orderData.address;

    // Thông tin voucher
    this.voucher = orderData.voucher;

    // Thông tin thời gian
    this.time_order = orderData.time_order;
    this.time_pickup_estimate = orderData.time_pickup_estimate;
    this.time_pickup = orderData.time_pickup;
    this.time_delivery = orderData.time_delivery;

    // Timestamps
    this.timestamps = {
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  // Cập nhật trạng thái đơn hàng
  updateStatus (processStatus, storeStatus = null, driverId = null) {


    // Lưu trạng thái cũ để kiểm tra logic chuyển đổi
    const oldStatus = this.process_status ?? AppOrderProcessStatus.PENDING;

    // Kiểm tra logic chuyển đổi trạng thái
    // if (!this.isValidStatusTransition(oldStatus, newStatus) && oldStatus != newStatus) {
    //   throw new Error(`Không thể chuyển từ trạng thái ${oldStatus} sang ${newStatus}`);
    // }

    // Cập nhật trạng thái
    this.process_status = processStatus;
    this.store_status = storeStatus;
    this.timestamps.updatedAt = new Date();

    if (driverId) {
      this.assignedDriverId = driverId;
    }

    return {
      process_status: processStatus,
      store_status: storeStatus,
      timestamp: this.timestamps.updatedAt
    };
  }

  // // Kiểm tra tính hợp lệ của việc chuyển đổi trạng thái
  // isValidStatusTransition (fromStatus, toStatus) {
  //   // Định nghĩa các chuyển đổi trạng thái hợp lệ
  //   const validTransitions = {
  //     [AppOrderProcessStatus.PENDING]: [AppOrderProcessStatus.FIND_DRIVER, AppOrderProcessStatus.DRIVER_ACCEPTED, AppOrderProcessStatus.CANCELLED],
  //     [AppOrderProcessStatus.FIND_DRIVER]: [AppOrderProcessStatus.DRIVER_ACCEPTED, AppOrderProcessStatus.CANCELLED],
  //     [AppOrderProcessStatus.DRIVER_ACCEPTED]: [AppOrderProcessStatus.STORE_ACCEPTED, AppOrderProcessStatus.CANCELLED],
  //     [AppOrderProcessStatus.STORE_ACCEPTED]: [AppOrderProcessStatus.DRIVER_ARRIVED_STORE, AppOrderProcessStatus.CANCELLED],
  //     [AppOrderProcessStatus.DRIVER_ARRIVED_STORE]: [AppOrderProcessStatus.DRIVER_PICKED, AppOrderProcessStatus.CANCELLED],
  //     [AppOrderProcessStatus.DRIVER_PICKED]: [AppOrderProcessStatus.DRIVER_ARRIVED_DESTINATION, AppOrderProcessStatus.CANCELLED],
  //     [AppOrderProcessStatus.DRIVER_ARRIVED_DESTINATION]: [AppOrderProcessStatus.COMPLETED, AppOrderProcessStatus.CANCELLED],
  //     [AppOrderProcessStatus.COMPLETED]: [], // Không thể chuyển từ trạng thái completed sang trạng thái khác
  //     [AppOrderProcessStatus.CANCELLED]: [] // Không thể chuyển từ trạng thái cancelled sang trạng thái khác
  //   };

  //   return validTransitions[fromStatus]?.includes(toStatus) || false;
  // }

  // Gán tài xế cho đơn hàng
  assignDriver (driverId) {
    if (this.process_status != null && this.process_status !== AppOrderProcessStatus.PENDING) {
      throw new Error(`Không thể gán tài xế cho đơn hàng có trạng thái ${this.process_status}`);
    }

    this.assignedDriverId = driverId;
    return this.updateStatus(AppOrderProcessStatus.DRIVER_ACCEPTED, { driver: driverId });
  }

  // Hủy đơn hàng
  cancel (reason) {
    if (this.process_status != null && (this.process_status === AppOrderProcessStatus.COMPLETED || this.process_status === AppOrderProcessStatus.CANCELLED)) {
      throw new Error(`Không thể hủy đơn hàng có trạng thái ${this.process_status}`);
    }

    return this.updateStatus(AppOrderProcessStatus.CANCELLED, { cancelReason: reason });
  }

  // Lấy toàn bộ thông tin đơn hàng
  getOrderData () {
    return this;
  }
}

module.exports = Order; 
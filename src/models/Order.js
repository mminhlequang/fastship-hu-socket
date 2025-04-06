const { AppOrderProcessStatus } = require('../utils/MessageCodes');

/**
 * Model lưu trữ thông tin đơn hàng
 */
class Order {
  constructor (orderData) {

    this.token = orderData.accessToken;
    
    // Thông tin cơ bản
    this.id = orderData.id;
    this.code = orderData.code;
    this.total_price = orderData.total_price;
    this.currency = orderData.currency;
    this.payment_type = orderData.payment_type;
    this.payment_status = orderData.payment_status;
    this.process_status = orderData.process_status;
    this.note = orderData.note;

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
    this.fee = orderData.fee || 0;
    this.price_tip = orderData.price_tip || 0;
    this.distance = orderData.distance || 0;

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
    this.voucher_value = orderData.voucher_value || 0;

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
  updateStatus (newStatus, data = {}) {
    // Kiểm tra trạng thái hợp lệ
    const validStatuses = [AppOrderProcessStatus.PENDING, AppOrderProcessStatus.FIND_DRIVER, AppOrderProcessStatus.DRIVER_ACCEPTED, AppOrderProcessStatus.STORE_ACCEPTED, AppOrderProcessStatus.DRIVER_ARRIVED_STORE, AppOrderProcessStatus.DRIVER_PICKED, AppOrderProcessStatus.DRIVER_ARRIVED_DESTINATION, AppOrderProcessStatus.COMPLETED, AppOrderProcessStatus.CANCELLED];

    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Trạng thái không hợp lệ: ${newStatus}`);
    }

    // Lưu trạng thái cũ để kiểm tra logic chuyển đổi
    const oldStatus = this.process_status ?? AppOrderProcessStatus.PENDING;

    // Kiểm tra logic chuyển đổi trạng thái
    // if (!this.isValidStatusTransition(oldStatus, newStatus) && oldStatus != newStatus) {
    //   throw new Error(`Không thể chuyển từ trạng thái ${oldStatus} sang ${newStatus}`);
    // }

    // Cập nhật trạng thái
    this.process_status = newStatus;
    this.timestamps.updatedAt = new Date();

    

    // Cập nhật custom data nếu có
    if (data && Object.keys(data).length > 0) {
      Object.assign(this, data);
    }

    return {
      status: newStatus,
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

    this.driver = driverId;
    this.driver_id = driverId;
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
    return {
      id: this.id,
      code: this.code,
      total_price: this.total_price,
      currency: this.currency,
      payment_type: this.payment_type,
      payment_status: this.payment_status,
      process_status: this.process_status,
      note: this.note,
      payment: this.payment,
      store: this.store,
      customer: this.customer,
      driver: this.driver,
      items: this.items,
      fee: this.fee,
      price_tip: this.price_tip,
      distance: this.distance,
      phone: this.phone,
      street: this.street,
      zip: this.zip,
      city: this.city,
      state: this.state,
      country: this.country,
      country_code: this.country_code,
      lat: this.lat,
      lng: this.lng,
      address: this.address,
      voucher: this.voucher,
      voucher_value: this.voucher_value,
      time_order: this.time_order,
      time_pickup_estimate: this.time_pickup_estimate,
      time_pickup: this.time_pickup,
      time_delivery: this.time_delivery,
      timestamps: this.timestamps
    };
  }
}

module.exports = Order; 
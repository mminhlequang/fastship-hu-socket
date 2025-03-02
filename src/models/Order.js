/**
 * Model lưu trữ thông tin đơn hàng
 */
class Order {
  constructor (orderId, pickupLocation, deliveryLocation, price, requirementAmount) {
    this.orderId = orderId; // ID đơn hàng
    this.pickupLocation = pickupLocation; // Vị trí lấy hàng (lat, lng)
    this.deliveryLocation = deliveryLocation; // Vị trí giao hàng (lat, lng)
    this.price = price; // Giá trị đơn hàng
    this.requirementAmount = requirementAmount || 0; // Số tiền yêu cầu trong ví để nhận đơn
    this.status = 'pending'; // Trạng thái: pending, accepted, completed, cancelled
    this.driverId = null; // ID của tài xế nhận đơn
    this.createdAt = new Date(); // Thời gian tạo đơn
    this.acceptedAt = null; // Thời gian nhận đơn
    this.completedAt = null; // Thời gian hoàn thành
    this.currentDriverIndex = 0; // Chỉ số tài xế hiện tại đang nhận thông báo
    this.priorityDrivers = []; // Danh sách tài xế ưu tiên đã sắp xếp
  }

  // Cập nhật trạng thái đơn hàng
  updateStatus (status) {
    this.status = status;

    if (status === 'accepted') {
      this.acceptedAt = new Date();
    } else if (status === 'completed') {
      this.completedAt = new Date();
    }

    return this.status;
  }

  // Gán tài xế cho đơn hàng
  assignDriver (driverId) {
    this.driverId = driverId;
    return this.driverId;
  }

  // Thiết lập danh sách tài xế ưu tiên
  setPriorityDrivers (drivers) {
    this.priorityDrivers = drivers;
    return this.priorityDrivers;
  }

  // Lấy tài xế tiếp theo trong danh sách ưu tiên
  getNextDriver () {
    if (this.currentDriverIndex < this.priorityDrivers.length) {
      return this.priorityDrivers[this.currentDriverIndex++];
    }
    return null;
  }

  // Kiểm tra xem tất cả tài xế đã được thông báo chưa
  isAllDriversNotified () {
    return this.currentDriverIndex >= this.priorityDrivers.length;
  }
}

module.exports = Order; 
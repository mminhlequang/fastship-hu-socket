/**
 * Model lưu trữ thông tin đơn hàng
 */
class Order {
  constructor (orderData) {
    this.orderId = orderData.orderId; // Mã đơn hàng duy nhất
    this.customerId = orderData.customerId; // Mã khách hàng
    this.orderDetails = orderData.orderDetails || {}; // Custom payload chứa thông tin chi tiết
    this.status = 'pending'; // Trạng thái mặc định: pending
    this.assignedDriver = null; // Tài xế được gán cho đơn hàng
    this.timestamps = {
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Thêm các timestamps cho từng trạng thái
    this.statusHistory = [
      {
        status: 'pending',
        timestamp: new Date()
      }
    ];
  }

  // Cập nhật trạng thái đơn hàng
  updateStatus (newStatus, data = {}) {
    // Kiểm tra trạng thái hợp lệ
    const validStatuses = ['pending', 'assigned', 'accepted', 'picked', 'in_progress', 'cancelled', 'completed'];

    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Trạng thái không hợp lệ: ${newStatus}`);
    }

    // Lưu trạng thái cũ để kiểm tra logic chuyển đổi
    const oldStatus = this.status;

    // Kiểm tra logic chuyển đổi trạng thái
    if (!this.isValidStatusTransition(oldStatus, newStatus)) {
      throw new Error(`Không thể chuyển từ trạng thái ${oldStatus} sang ${newStatus}`);
    }

    // Cập nhật trạng thái
    this.status = newStatus;
    this.timestamps.updatedAt = new Date();

    // Cập nhật custom data nếu có
    if (data && Object.keys(data).length > 0) {
      this.orderDetails = { ...this.orderDetails, ...data };
    }

    // Thêm vào lịch sử trạng thái
    this.statusHistory.push({
      status: newStatus,
      timestamp: new Date(),
      data: data
    });

    return {
      status: newStatus,
      timestamp: this.timestamps.updatedAt
    };
  }

  // Kiểm tra tính hợp lệ của việc chuyển đổi trạng thái
  isValidStatusTransition (fromStatus, toStatus) {
    // Định nghĩa các chuyển đổi trạng thái hợp lệ
    const validTransitions = {
      'pending': ['assigned', 'cancelled'],
      'assigned': ['accepted', 'cancelled'],
      'accepted': ['picked', 'cancelled'],
      'picked': ['in_progress', 'cancelled'],
      'in_progress': ['completed', 'cancelled'],
      'cancelled': [], // Không thể chuyển từ trạng thái cancelled sang trạng thái khác
      'completed': [] // Không thể chuyển từ trạng thái completed sang trạng thái khác
    };

    return validTransitions[fromStatus]?.includes(toStatus) || false;
  }

  // Gán tài xế cho đơn hàng
  assignDriver (driverId) {
    if (this.status !== 'pending') {
      throw new Error(`Không thể gán tài xế cho đơn hàng có trạng thái ${this.status}`);
    }

    this.assignedDriver = driverId;
    return this.updateStatus('assigned', { assignedDriver: driverId });
  }

  // Hủy đơn hàng
  cancel (reason) {
    if (['completed', 'cancelled'].includes(this.status)) {
      throw new Error(`Không thể hủy đơn hàng có trạng thái ${this.status}`);
    }

    return this.updateStatus('cancelled', { cancelReason: reason });
  }

  // Lấy toàn bộ thông tin đơn hàng
  getOrderData () {
    return {
      orderId: this.orderId,
      customerId: this.customerId,
      orderDetails: this.orderDetails,
      status: this.status,
      assignedDriver: this.assignedDriver,
      timestamps: this.timestamps,
      statusHistory: this.statusHistory
    };
  }
}

module.exports = Order; 
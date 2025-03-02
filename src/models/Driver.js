/**
 * Model lưu trữ thông tin tài xế
 */
class Driver {
  constructor (uuid, phone, name, firebaseId, rate, walletInfo) {
    this.uuid = uuid; // ID duy nhất của tài xế
    this.phone = phone; // Số điện thoại
    this.name = name; // Tên tài xế
    this.firebaseId = firebaseId; // ID Firebase
    this.rate = rate || 0; // Đánh giá (mặc định là 0)
    this.walletInfo = walletInfo || { balance: 0 }; // Thông tin ví
    this.isOnline = true; // Trạng thái online
    this.socketId = null; // ID socket hiện tại
    this.location = null; // Vị trí hiện tại (lat, lng)
    this.lastActive = new Date(); // Thời gian hoạt động cuối cùng
    this.isBusy = false; // Đang bận hay không
  }

  // Cập nhật vị trí
  updateLocation (lat, lng) {
    this.location = { lat, lng };
    this.lastActive = new Date();
    return this.location;
  }

  // Cập nhật trạng thái online
  setOnlineStatus (status) {
    this.isOnline = status;
    this.lastActive = new Date();
  }

  // Cập nhật ID socket
  setSocketId (socketId) {
    this.socketId = socketId;
  }

  // Cập nhật trạng thái bận
  setBusyStatus (status) {
    this.isBusy = status;
  }
}

module.exports = Driver; 
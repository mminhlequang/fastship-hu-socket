/**
 * Model lưu trữ thông tin tài xế
 */
class Driver {
  constructor (driverData) {
    this.driverData = driverData; // ID duy nhất của tài xế 
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
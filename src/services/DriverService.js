const Driver = require('../models/Driver');

class DriverService {
  constructor () {
    this.drivers = {}; // Lưu trữ các tài xế theo UUID
    this.socketToDriverMap = {}; // Map từ socket ID đến UUID tài xế
  }

  // Thêm hoặc cập nhật thông tin tài xế
  registerDriver (socket) {
    const driverData = socket.driverData;
    // Nếu tài xế đã tồn tại, cập nhật thông tin
    if (this.drivers[driverData.uid]) {
      const driver = this.drivers[driverData.uid];

      driver.driverData = driverData;

      // Đặt trạng thái online và cập nhật socketId
      driver.setOnlineStatus(true);
      if (socket.id) {
        // Xóa mapping cũ nếu có
        if (driver.socketId && this.socketToDriverMap[driver.socketId]) {
          delete this.socketToDriverMap[driver.socketId];
        }

        // Cập nhật socketId mới
        driver.setSocketId(socket.id);
        this.socketToDriverMap[socket.id] = driverData.uid;
      }

      return driver;
    }

    // Tạo mới tài xế nếu chưa tồn tại
    const driver = new Driver(driverData);
    if (socket.id) {
      driver.setSocketId(socket.id);
      this.socketToDriverMap[socket.id] = driverData.uid;
    }

    this.drivers[driverData.uid] = driver;
    return driver;
  }

  // Cập nhật vị trí tài xế
  updateDriverLocation (uid, lat, lng) {
    const driver = this.drivers[uid];
    if (!driver) return null;

    return driver.updateLocation(lat, lng);
  }

  // Lấy tài xế theo UUID
  getDriverByUuid (uid) {
    return this.drivers[uid] || null;
  }

  // Lấy tài xế theo socket ID
  getDriverBySocketId (socketId) {
    const uid = this.socketToDriverMap[socketId];
    if (!uid) return null;

    return this.drivers[uid];
  }

  // Đặt trạng thái offline cho tài xế
  setDriverOffline (socketId) {
    const uid = this.socketToDriverMap[socketId];
    if (!uid || !this.drivers[uid]) return false;

    this.drivers[uid].setOnlineStatus(false);

    // Xóa mapping socket
    delete this.socketToDriverMap[socketId];

    return true;
  }

  // Đặt trạng thái online cho tài xế theo UUID
  setDriverOnline (uid) {
    if (!uid || !this.drivers[uid]) return false;

    this.drivers[uid].setOnlineStatus(true);
    return true;
  }

  // Lấy danh sách tài xế đang online
  getOnlineDrivers () {
    return Object.values(this.drivers).filter(driver => driver.isOnline);
  }

  // Tính khoảng cách giữa hai tọa độ (công thức Haversine)
  calculateDistance (lat1, lon1, lat2, lon2) {
    const R = 6371; // Bán kính trái đất tính bằng km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Khoảng cách tính bằng km
    return distance;
  }

  deg2rad (deg) {
    return deg * (Math.PI / 180);
  }
}

module.exports = new DriverService(); 
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
    if (this.drivers[driverData.id]) {
      const driver = this.drivers[driverData.id];

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
        this.socketToDriverMap[socket.id] = driverData.id;
      }

      return driver;
    }

    // Tạo mới tài xế nếu chưa tồn tại
    const driver = new Driver(driverData);
    if (socket.id) {
      driver.setSocketId(socket.id);
      this.socketToDriverMap[socket.id] = driverData.id;
    }

    this.drivers[driverData.id] = driver;
    return driver;
  }

  // Cập nhật vị trí tài xế
  updateDriverLocation (id, lat, lng) {
    const driver = this.drivers[id];
    if (!driver) return null;

    return driver.updateLocation(lat, lng);
  }

  // Lấy tài xế theo UUID
  getDriverById (driverId) {
    return this.drivers[driverId] || null;
  }

  // Lấy tài xế theo socket ID
  getDriverBySocketId (socketId) {
    const driverId = this.socketToDriverMap[socketId];
    if (!driverId) return null;

    return this.drivers[driverId];
  }

  // Đặt trạng thái offline cho tài xế
  setDriverOffline (socketId) {
    const driverId = this.socketToDriverMap[socketId];
    if (!driverId || !this.drivers[driverId]) return false;

    this.drivers[driverId].setOnlineStatus(false);

    // Xóa mapping socket
    delete this.socketToDriverMap[socketId];

    return true;
  }

  // Đặt trạng thái online cho tài xế theo UUID
  setDriverOnline (id) {
    if (!id || !this.drivers[id]) return false;

    this.drivers[id].setOnlineStatus(true);
    return true;
  }

  // Lấy danh sách tài xế đang online
  getOnlineDrivers (isBusy = null, lat = null, lng = null) {
    // Lọc các tài xế online và theo trạng thái bận nếu được chỉ định
    let drivers = Object.values(this.drivers).filter(driver => driver.isOnline && (isBusy === null || driver.isBusy === isBusy));

    // Nếu có tọa độ lat, lng
    if (lat !== null && lng !== null) {
      // Lọc tài xế có location không null
      drivers = drivers.filter(driver => driver.location && driver.location.lat && driver.location.lng);

      // Tính khoảng cách và sắp xếp từ gần đến xa
      drivers.forEach(driver => {
        driver.distance = this.calculateDistance(lat, lng, driver.location.lat, driver.location.lng);
      });

      // Sắp xếp theo khoảng cách tăng dần
      drivers.sort((a, b) => a.distance - b.distance);
    }

    return drivers;
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
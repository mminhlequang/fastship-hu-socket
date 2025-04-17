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
    if (!driver) {
      console.log(`[DriverService] Không tìm thấy tài xế ${id} để cập nhật vị trí.`);
      return null;
    }

    console.log(`[DriverService] Cập nhật vị trí của tài xế ${id} thành lat=${lat}, lng=${lng}`);
    return driver.updateLocation(lat, lng);
  }

  // Lấy tài xế theo UUID
  getDriverById (driverId) {
    const driver = this.drivers[driverId] || null;
    console.log(`[DriverService] getDriverById(${driverId}): ${driver ? 'Tìm thấy tài xế' : 'Không tìm thấy tài xế'}`);
    return driver;
  }

  // Lấy tài xế theo socket ID
  getDriverBySocketId (socketId) {
    const driverId = this.socketToDriverMap[socketId];
    if (!driverId) {
      console.log(`[DriverService] Không tìm thấy tài xế với socketId: ${socketId}`);
      return null;
    }

    const driver = this.drivers[driverId];
    console.log(`[DriverService] getDriverBySocketId(${socketId}): Tìm thấy tài xế ${driverId}`);
    return driver;
  }

  // Đặt trạng thái offline cho tài xế
  setDriverOffline (socketId) {
    const driverId = this.socketToDriverMap[socketId];
    if (!driverId || !this.drivers[driverId]) {
      console.log(`[DriverService] Không thể đặt offline cho socketId ${socketId}: không tìm thấy tài xế`);
      return false;
    }

    this.drivers[driverId].setOnlineStatus(false);
    console.log(`[DriverService] Đã đặt tài xế ${driverId} offline (socketId: ${socketId})`);

    // Xóa mapping socket
    delete this.socketToDriverMap[socketId];

    return true;
  }

  // Đặt trạng thái online cho tài xế theo UUID
  setDriverOnline (id) {
    if (!id || !this.drivers[id]) {
      console.log(`[DriverService] Không thể đặt online cho tài xế ${id}: không tìm thấy tài xế`);
      return false;
    }

    this.drivers[id].setOnlineStatus(true);
    console.log(`[DriverService] Đã đặt tài xế ${id} online`);
    return true;
  }

  // Lấy danh sách tài xế đang online
  getOnlineDrivers (isBusy = null, lat = null, lng = null) {
    console.log(`[DriverService] getOnlineDrivers(isBusy=${isBusy}, lat=${lat}, lng=${lng})`);

    // Lọc các tài xế online và theo trạng thái bận nếu được chỉ định
    let drivers = Object.values(this.drivers).filter(driver => driver.isOnline && (isBusy === null || driver.isBusy === isBusy));

    console.log(`[DriverService] Tổng số tài xế đang online${isBusy !== null ? (isBusy ? ' và bận' : ' và rảnh') : ''}: ${drivers.length}`);

    if (drivers.length > 0) {
      console.log(`[DriverService] Danh sách tài xế online:`, drivers.map(d => ({
        id: d.id || d.driverData?.id,
        socketId: d.socketId,
        isOnline: d.isOnline,
        isBusy: d.isBusy,
        hasLocation: !!d.location
      })));
    }

    // Nếu có tọa độ lat, lng
    if (lat !== null && lng !== null) {
      // Lọc tài xế có location không null
      const driversWithLocation = drivers.filter(driver => driver.location && driver.location.lat && driver.location.lng);
      console.log(`[DriverService] Số tài xế online có vị trí: ${driversWithLocation.length}/${drivers.length}`);

      drivers = driversWithLocation;

      // Tính khoảng cách và sắp xếp từ gần đến xa
      drivers.forEach(driver => {
        driver.distance = this.calculateDistance(lat, lng, driver.location.lat, driver.location.lng);
      });

      // Sắp xếp theo khoảng cách tăng dần
      drivers.sort((a, b) => a.distance - b.distance);

      if (drivers.length > 0) {
        console.log(`[DriverService] Tài xế gần nhất: id=${drivers[0].id || drivers[0].driverData?.id}, distance=${drivers[0].distance}km`);
      }
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
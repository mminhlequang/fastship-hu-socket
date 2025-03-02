const Driver = require('../models/Driver');

class DriverService {
  constructor() {
    this.drivers = {}; // Lưu trữ các tài xế theo UUID
    this.socketToDriverMap = {}; // Map từ socket ID đến UUID tài xế
  }

  // Thêm hoặc cập nhật thông tin tài xế
  registerDriver(uuid, phone, name, firebaseId, rate, walletInfo, socketId) {
    // Nếu tài xế đã tồn tại, cập nhật thông tin
    if (this.drivers[uuid]) {
      const driver = this.drivers[uuid];
      
      // Cập nhật thông tin cơ bản nếu có thay đổi
      if (phone) driver.phone = phone;
      if (name) driver.name = name;
      if (firebaseId) driver.firebaseId = firebaseId;
      if (rate !== undefined) driver.rate = rate;
      if (walletInfo) driver.walletInfo = walletInfo;
      
      // Đặt trạng thái online và cập nhật socketId
      driver.setOnlineStatus(true);
      if (socketId) {
        // Xóa mapping cũ nếu có
        if (driver.socketId && this.socketToDriverMap[driver.socketId]) {
          delete this.socketToDriverMap[driver.socketId];
        }
        
        // Cập nhật socketId mới
        driver.setSocketId(socketId);
        this.socketToDriverMap[socketId] = uuid;
      }
      
      return driver;
    } 
    
    // Tạo mới tài xế nếu chưa tồn tại
    const driver = new Driver(uuid, phone, name, firebaseId, rate, walletInfo);
    if (socketId) {
      driver.setSocketId(socketId);
      this.socketToDriverMap[socketId] = uuid;
    }
    
    this.drivers[uuid] = driver;
    return driver;
  }

  // Cập nhật vị trí tài xế
  updateDriverLocation(uuid, lat, lng) {
    const driver = this.drivers[uuid];
    if (!driver) return null;
    
    return driver.updateLocation(lat, lng);
  }

  // Lấy tài xế theo UUID
  getDriverByUuid(uuid) {
    return this.drivers[uuid] || null;
  }

  // Lấy tài xế theo socket ID
  getDriverBySocketId(socketId) {
    const uuid = this.socketToDriverMap[socketId];
    if (!uuid) return null;
    
    return this.drivers[uuid];
  }

  // Đặt trạng thái offline cho tài xế
  setDriverOffline(socketId) {
    const uuid = this.socketToDriverMap[socketId];
    if (!uuid || !this.drivers[uuid]) return false;
    
    this.drivers[uuid].setOnlineStatus(false);
    
    // Xóa mapping socket
    delete this.socketToDriverMap[socketId];
    
    return true;
  }

  // Lấy danh sách tài xế đang online
  getOnlineDrivers() {
    return Object.values(this.drivers).filter(driver => driver.isOnline && !driver.isBusy);
  }

  // Lấy danh sách tài xế ưu tiên cho đơn hàng theo tiêu chí
  // rate cao, gần địa chỉ giao hàng, đủ tiền trong ví
  getPriorityDriversForOrder(deliveryLocation, requiredAmount) {
    // Lọc tài xế đang online và không bận
    const availableDrivers = this.getOnlineDrivers();
    
    // Lọc tài xế có đủ tiền trong ví
    const eligibleDrivers = availableDrivers.filter(
      driver => driver.walletInfo && driver.walletInfo.balance >= requiredAmount
    );
    
    // Tính toán khoảng cách và xếp hạng
    const driversWithScore = eligibleDrivers.map(driver => {
      let score = driver.rate * 10; // Đánh giá có trọng số cao
      
      // Tính điểm dựa trên khoảng cách nếu tài xế có vị trí
      if (driver.location && deliveryLocation) {
        const distance = this.calculateDistance(
          driver.location.lat, 
          driver.location.lng,
          deliveryLocation.lat,
          deliveryLocation.lng
        );
        
        // Điểm khoảng cách ngược với khoảng cách (càng gần càng cao)
        // Điểm tối đa 50 cho khoảng cách gần (dưới 1km)
        const distanceScore = Math.max(0, 50 - distance * 5);
        score += distanceScore;
      }
      
      return { driver, score };
    });
    
    // Sắp xếp theo điểm giảm dần
    driversWithScore.sort((a, b) => b.score - a.score);
    
    // Trả về danh sách tài xế đã được sắp xếp
    return driversWithScore.map(item => item.driver);
  }
  
  // Tính khoảng cách giữa hai tọa độ (công thức Haversine)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Bán kính trái đất tính bằng km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c; // Khoảng cách tính bằng km
    return distance;
  }
  
  deg2rad(deg) {
    return deg * (Math.PI/180);
  }
}

module.exports = new DriverService(); 
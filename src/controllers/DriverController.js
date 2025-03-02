const driverService = require('../services/DriverService');

class DriverController {
  /**
   * Xử lý khi tài xế kết nối
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Thông tin tài xế
   */
  handleDriverConnect (socket, data) {
    try {
      const { uuid, phone, name, firebaseId, rate, walletInfo } = data;

      if (!uuid) {
        socket.emit('error', { message: 'UUID là bắt buộc' });
        return;
      }

      // Đăng ký hoặc cập nhật thông tin tài xế
      const driver = driverService.registerDriver(
        uuid, phone, name, firebaseId, rate, walletInfo, socket.id
      );

      // Thông báo kết nối thành công
      socket.emit('connection_success', {
        message: 'Kết nối thành công',
        driverId: uuid
      });

      console.log(`Tài xế đã kết nối: ${uuid} (${socket.id})`);

      return driver;
    } catch (error) {
      console.error('Lỗi khi xử lý kết nối tài xế:', error);
      socket.emit('error', { message: 'Lỗi server' });
    }
  }

  /**
   * Xử lý khi tài xế ngắt kết nối
   * @param {string} socketId - ID socket của tài xế
   */
  handleDriverDisconnect (socketId) {
    try {
      const driver = driverService.getDriverBySocketId(socketId);

      if (driver) {
        driverService.setDriverOffline(socketId);
        console.log(`Tài xế đã ngắt kết nối: ${driver.uuid} (${socketId})`);
        return driver;
      }
    } catch (error) {
      console.error('Lỗi khi xử lý ngắt kết nối tài xế:', error);
    }

    return null;
  }

  /**
   * Cập nhật vị trí tài xế
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu vị trí
   */
  handleUpdateLocation (socket, data) {
    try {
      const driver = driverService.getDriverBySocketId(socket.id);

      if (!driver) {
        socket.emit('error', { message: 'Tài xế không tồn tại hoặc chưa đăng nhập' });
        return null;
      }

      const { lat, lng } = data;

      if (typeof lat !== 'number' || typeof lng !== 'number') {
        socket.emit('error', { message: 'Vị trí không hợp lệ' });
        return null;
      }

      // Cập nhật vị trí
      const location = driverService.updateDriverLocation(driver.uuid, lat, lng);

      // Phát sóng vị trí mới đến kênh cụ thể của tài xế
      // Những client đang nghe kênh này sẽ nhận được cập nhật vị trí mới
      socket.server.emit(`driver_${driver.uuid}`, {
        type: 'location_update',
        driver: {
          uuid: driver.uuid,
          location,
          lastActive: driver.lastActive
        }
      });

      return location;
    } catch (error) {
      console.error('Lỗi khi cập nhật vị trí tài xế:', error);
      socket.emit('error', { message: 'Lỗi server' });
    }

    return null;
  }

  /**
   * Lấy danh sách tài xế đang online
   */
  getOnlineDrivers () {
    try {
      return driverService.getOnlineDrivers();
    } catch (error) {
      console.error('Lỗi khi lấy danh sách tài xế online:', error);
      return [];
    }
  }

  /**
   * Lấy thông tin tài xế theo UUID
   * @param {string} uuid - UUID của tài xế
   */
  getDriverByUuid (uuid) {
    try {
      return driverService.getDriverByUuid(uuid);
    } catch (error) {
      console.error(`Lỗi khi lấy thông tin tài xế ${uuid}:`, error);
      return null;
    }
  }
}

module.exports = new DriverController(); 
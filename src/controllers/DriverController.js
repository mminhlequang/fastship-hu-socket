const driverService = require('../services/DriverService');
const SocketResponse = require('../utils/SocketResponse');
const { MessageCodes, AppOrderProcessStatus } = require('../utils/MessageCodes');

class DriverController {
  /**
   * Xử lý khi tài xế kết nối
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Thông tin tài xế
   */
  handleDriverConnect (socket) {
    try {

      // Đăng ký hoặc cập nhật thông tin tài xế
      const driver = driverService.registerDriver(socket);
      const uid = driver.driverData.uid;

      // Thông báo kết nối thành công
      SocketResponse.emitSuccess(socket, 'connection_success', {
        message: 'Kết nối thành công',
        driverId: uid
      });

      console.log(`Tài xế đã kết nối: ${uid} (${socket.id})`);

      return driver;
    } catch (error) {
      console.error('Lỗi khi xử lý kết nối tài xế:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.SERVER_ERROR, {
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Xử lý cập nhật trạng thái của tài xế (online/offline)
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Dữ liệu trạng thái
   */
  handleDriverStatusUpdate (socket, data) {
    try {
      const { uid, status } = data;

      if (!uid) {
        SocketResponse.emitError(socket, 'error', MessageCodes.INVALID_PARAMS, {
          message: 'UUID là bắt buộc'
        });
        return null;
      }

      // Kiểm tra tài xế có tồn tại không
      const driver = driverService.getDriverByUuid(uid);
      if (!driver) {
        SocketResponse.emitError(socket, 'error', MessageCodes.DRIVER_NOT_FOUND, {
          message: 'Tài xế không tồn tại'
        });
        return null;
      }

      // Cập nhật trạng thái online/offline
      if (status === 'online') {
        driverService.setDriverOnline(uid);
        console.log(`Tài xế đã online: ${uid} (${socket.id})`);
      } else {
        driverService.setDriverOffline(uid);
        console.log(`Tài xế đã offline: ${uid} (${socket.id})`);
      }

      return driver;
    } catch (error) {
      console.error('Lỗi khi cập nhật trạng thái tài xế:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.SERVER_ERROR, {
        message: 'Lỗi server'
      });
    }

    return null;
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
        console.log(`Tài xế đã ngắt kết nối: ${driver.uid} (${socketId})`);
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
        SocketResponse.emitError(socket, 'error', MessageCodes.DRIVER_NOT_FOUND, {
          message: 'Tài xế không tồn tại hoặc chưa đăng nhập'
        });
        return null;
      }

      const { latitude, longitude } = data;

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        SocketResponse.emitError(socket, 'error', MessageCodes.LOCATION_INVALID, {
          message: 'Vị trí không hợp lệ ' + JSON.stringify(data)
        });
        return null;
      }

      // Cập nhật vị trí
      const location = driverService.updateDriverLocation(driver.driverData.uid, latitude, longitude);

      // Phát sóng vị trí mới đến kênh cụ thể của tài xế
      // Những client đang nghe kênh này sẽ nhận được cập nhật vị trí mới
      SocketResponse.emitToRoom(socket.server, `driver_${driver.driverData.uid}`, `driver_${driver.driverData.uid}`, true, MessageCodes.SUCCESS, {
        type: 'location_update',
        driver: {
          uid: driver.driverData.uid,
          location,
          lastActive: driver.lastActive
        }
      });

      return location;
    } catch (error) {
      console.error('Lỗi khi cập nhật vị trí tài xế:', error);
      SocketResponse.emitError(socket, 'error', MessageCodes.SERVER_ERROR, {
        message: 'Lỗi server'
      });
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
   * @param {string} uid - UUID của tài xế
   */
  getDriverByUuid (uid) {
    try {
      return driverService.getDriverByUuid(uid);
    } catch (error) {
      console.error(`Lỗi khi lấy thông tin tài xế ${uid}:`, error);
      return null;
    }
  }
}

module.exports = new DriverController(); 
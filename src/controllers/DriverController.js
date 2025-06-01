const driverService = require('../services/DriverService');
const SocketResponse = require('../utils/SocketResponse');
const { MessageCodes, AppOrderProcessStatus } = require('../utils/Enums');

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
      const driverId = driver.driverData.id;

      // Thông báo kết nối thành công
      SocketResponse.emitSuccess(socket, 'connection_success', {
        message: 'Kết nối thành công',
        driverId: driverId
      });

      console.log(`Tài xế đã kết nối: ${driverId} (${socket.id})`);

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
      const { id, status } = data;

      if (!id) {
        SocketResponse.emitError(socket, 'error', MessageCodes.INVALID_PARAMS, {
          message: 'ID là bắt buộc'
        });
        return null;
      }

      // Kiểm tra tài xế có tồn tại không
      const driver = driverService.getDriverById(id);
      if (!driver) {
        SocketResponse.emitError(socket, 'error', MessageCodes.DRIVER_NOT_FOUND, {
          message: 'Tài xế không tồn tại'
        });
        return null;
      }

      // Cập nhật trạng thái online/offline
      if (status === 'online') {
        driverService.setDriverOnline(id);
        console.log(`Tài xế đã online: ${id} (${socket.id})`);
      } else {
        driverService.setDriverOffline(id);
        console.log(`Tài xế đã offline: ${id} (${socket.id})`);
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
        console.log(`Tài xế đã ngắt kết nối: ${driver.id} (${socketId})`);
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
      const location = driverService.updateDriverLocation(driver.driverData.id, latitude, longitude);

      // Phát sóng vị trí mới đến kênh cụ thể của tài xế
      // Những client đang nghe kênh này sẽ nhận được cập nhật vị trí mới
      SocketResponse.emitSuccessToRoom
      SocketResponse.emitToRoom(socket.server, `driver_${driver.driverData.id}`, `driver_${driver.driverData.id}`, true, MessageCodes.SUCCESS, {
        type: 'location_update',
        driver: {
          id: driver.driverData.id,
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
  getOnlineDrivers (isBusy = null, lat = null, lng = null) {
    try {
      return driverService.getOnlineDrivers(isBusy, lat, lng);
    } catch (error) {
      console.error('Lỗi khi lấy danh sách tài xế online:', error);
      return [];
    }
  }

  /**
   * Lấy thông tin tài xế theo ID
   * @param {string} id - ID của tài xế
   */
  getDriverById (id) {
    try {
      return driverService.getDriverById(id);
    } catch (error) {
      console.error(`Lỗi khi lấy thông tin tài xế ${id}:`, error);
      return null;
    }
  }
}

module.exports = new DriverController(); 
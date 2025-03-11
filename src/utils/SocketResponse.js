/**
 * Lớp chuẩn hóa định dạng response cho socket
 */
class SocketResponse {
  /**
   * Tạo response thành công
   * @param {*} data - Dữ liệu trả về
   * @returns {Object} - Response chuẩn hóa
   */
  static success (data = null) {
    return {
      isSuccess: true,
      timestamp: new Date().toISOString(),
      messageCode: 'SUCCESS',
      data: data
    };
  }

  /**
   * Tạo response lỗi
   * @param {string} messageCode - Mã thông báo lỗi
   * @param {*} data - Dữ liệu bổ sung (nếu có)
   * @returns {Object} - Response chuẩn hóa
   */
  static error (messageCode, data = null) {
    return {
      isSuccess: false,
      timestamp: new Date().toISOString(),
      messageCode: messageCode,
      data: data
    };
  }

  /**
   * Tạo response với thông tin tùy chỉnh
   * @param {boolean} isSuccess - Trạng thái thành công
   * @param {string} messageCode - Mã thông báo
   * @param {*} data - Dữ liệu trả về
   * @returns {Object} - Response chuẩn hóa
   */
  static custom (isSuccess, messageCode, data = null) {
    return {
      isSuccess: isSuccess,
      timestamp: new Date().toISOString(),
      messageCode: messageCode,
      data: data
    };
  }

  /**
   * Emit dữ liệu tới socket với định dạng chuẩn
   * @param {Object} socket - Socket instance
   * @param {string} event - Tên sự kiện
   * @param {boolean} isSuccess - Trạng thái thành công
   * @param {string} messageCode - Mã thông báo
   * @param {*} data - Dữ liệu trả về
   */
  static emit (socket, event, isSuccess, messageCode, data = null) {
    socket.emit(event, this.custom(isSuccess, messageCode, data));
  }

  /**
   * Emit thông báo thành công tới socket
   * @param {Object} socket - Socket instance
   * @param {string} event - Tên sự kiện
   * @param {*} data - Dữ liệu trả về
   */
  static emitSuccess (socket, event, data = null) {
    socket.emit(event, this.success(data));
  }

  /**
   * Emit thông báo lỗi tới socket
   * @param {Object} socket - Socket instance
   * @param {string} event - Tên sự kiện
   * @param {string} messageCode - Mã thông báo lỗi
   * @param {*} data - Dữ liệu bổ sung
   */
  static emitError (socket, event, messageCode, data = null) {
    socket.emit(event, this.error(messageCode, data));
  }

  /**
   * Broadcast sự kiện tới một room
   * @param {Object} io - Socket.IO instance
   * @param {string} room - Tên room
   * @param {string} event - Tên sự kiện
   * @param {boolean} isSuccess - Trạng thái thành công
   * @param {string} messageCode - Mã thông báo
   * @param {*} data - Dữ liệu trả về
   */
  static emitToRoom (io, room, event, isSuccess, messageCode, data = null) {
    io.to(room).emit(event, this.custom(isSuccess, messageCode, data));
  }

  /**
   * Broadcast sự kiện thành công tới một room
   * @param {Object} io - Socket.IO instance
   * @param {string} room - Tên room
   * @param {string} event - Tên sự kiện
   * @param {*} data - Dữ liệu trả về
   */
  static emitSuccessToRoom (io, room, event, data = null) {
    io.to(room).emit(event, this.success(data));
  }

  /**
   * Broadcast sự kiện lỗi tới một room
   * @param {Object} io - Socket.IO instance
   * @param {string} room - Tên room
   * @param {string} event - Tên sự kiện
   * @param {string} messageCode - Mã thông báo lỗi
   * @param {*} data - Dữ liệu bổ sung
   */
  static emitErrorToRoom (io, room, event, messageCode, data = null) {
    io.to(room).emit(event, this.error(messageCode, data));
  }
}

module.exports = SocketResponse; 
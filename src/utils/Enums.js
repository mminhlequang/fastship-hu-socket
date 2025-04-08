const AppConfig = {
  HOST_API: 'https://zennail23.com/api/v1'
}

/**
 * Enum cho trạng thái xử lý đơn hàng
 */
const AppOrderProcessStatus = {
  PENDING: 'pending', // Đơn hàng mới 
  FIND_DRIVER: 'findDriver', // Đang tìm tài xế
  DRIVER_ACCEPTED: 'driverAccepted', // Tài xế đã chấp nhận đơn
  STORE_ACCEPTED: 'storeAccepted', // Cửa hàng đã chấp nhận đơn
  DRIVER_ARRIVED_STORE: 'driverArrivedStore', // Tài xế đã đến địa điểm giao hàng
  DRIVER_PICKED: 'driverPicked', // Tài xế đã lấy hàng
  DRIVER_ARRIVED_DESTINATION: 'driverArrivedDestination', // Tài xế đã đến địa điểm giao hàng
  COMPLETED: 'completed', // Đơn hàng hoàn thành
  CANCELLED: 'cancelled' // Đơn hàng đã hủy
};

const FindDriverStatus = {
  FINDING: 'finding', // Đang tìm tài xế
  AVAILABLE_DRIVERS: 'availableDrivers', // Tài xế khả dụng
  FOUND: 'found', // Đã tìm thấy tài xế
  NO_DRIVER: 'noDriver', // Không tìm thấy tài xế
  ERROR: 'error' // Lỗi
};

/**
 * Các mã thông báo được sử dụng trong hệ thống
 */
const MessageCodes = {
  // Mã thành công
  SUCCESS: 'SUCCESS',

  // Mã lỗi xác thực
  AUTH_FAILED: 'AUTH_FAILED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_MISSING: 'TOKEN_MISSING',
  CUSTOMER_ID_MISSING: 'CUSTOMER_ID_MISSING',
  ADMIN_KEY_INVALID: 'ADMIN_KEY_INVALID',

  // Mã lỗi đơn hàng
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_CREATION_FAILED: 'ORDER_CREATION_FAILED',
  ORDER_ID_MISSING: 'ORDER_ID_MISSING',
  ORDER_INVALID_STATUS: 'ORDER_INVALID_STATUS',
  ORDER_INVALID_TRANSITION: 'ORDER_INVALID_TRANSITION',
  ORDER_DRIVER_ASSIGNMENT_FAILED: 'ORDER_DRIVER_ASSIGNMENT_FAILED',
  ORDER_CANCEL_FAILED: 'ORDER_CANCEL_FAILED',
  ORDER_COMPLETE_FAILED: 'ORDER_COMPLETE_FAILED',
  ORDER_UPDATE_FAILED: 'ORDER_UPDATE_FAILED',
  NO_AVAILABLE_DRIVER: 'NO_AVAILABLE_DRIVER',
  ORDER_CANCELLATION_FAILED: 'ORDER_CANCELLATION_FAILED',

  // Mã lỗi tài xế
  DRIVER_NOT_FOUND: 'DRIVER_NOT_FOUND',
  DRIVER_OFFLINE: 'DRIVER_OFFLINE',
  DRIVER_BUSY: 'DRIVER_BUSY',
  DRIVER_UPDATE_FAILED: 'DRIVER_UPDATE_FAILED',
  LOCATION_INVALID: 'LOCATION_INVALID',
  DRIVER_NOT_AUTHORIZED: 'DRIVER_NOT_AUTHORIZED',

  // Mã lỗi chung
  INVALID_PARAMS: 'INVALID_PARAMS',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SERVER_ERROR: 'SERVER_ERROR',
  CUSTOMER_NOT_AUTHORIZED: 'CUSTOMER_NOT_AUTHORIZED'
};

module.exports = { MessageCodes, AppOrderProcessStatus, FindDriverStatus, AppConfig }; 
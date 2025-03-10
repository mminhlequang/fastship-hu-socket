const express = require('express');
const router = express.Router();
const driverController = require('../controllers/DriverController');
const orderController = require('../controllers/OrderController');
const orderService = require('../services/OrderService');

/**
 * API lấy danh sách tài xế online
 * GET /api/drivers/online
 */
router.get('/drivers/online', (req, res) => {
  try {
    const drivers = driverController.getOnlineDrivers().map(driver => ({
      info: driver.driverData,
      location: driver.location,
      lastActive: driver.lastActive,
      isBusy: driver.isBusy
    }));

    res.status(200).json({
      success: true,
      count: drivers.length,
      drivers
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách tài xế online:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
});

/**
 * API lấy thông tin tài xế theo UUID
 * GET /api/drivers/:uid
 */
router.get('/drivers/:uid', (req, res) => {
  try {
    const { uid } = req.params;
    const driver = driverController.getDriverByUuid(uid);

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài xế'
      });
    }

    res.status(200).json({
      success: true,
      driver: {
        info: driver.driverData,
        location: driver.location,
        lastActive: driver.lastActive,
        isOnline: driver.isOnline,
        isBusy: driver.isBusy
      }
    });
  } catch (error) {
    console.error(`Lỗi khi lấy thông tin tài xế ${req.params.uid}:`, error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
});

/**
 * API lấy danh sách đơn hàng
 * GET /api/orders
 */
router.get('/orders', (req, res) => {
  try {
    const { status, customerId, driverId } = req.query;
    let orders = [];

    if (status) {
      orders = orderService.getOrdersByStatus(status);
    } else if (customerId) {
      orders = orderService.getOrdersByCustomerId(customerId);
    } else if (driverId) {
      orders = orderService.getOrdersByDriverId(driverId);
    } else {
      orders = orderService.getAllOrders();
    }

    res.status(200).json({
      success: true,
      count: orders.length,
      orders: orders.map(order => order.getOrderData())
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách đơn hàng:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
});

/**
 * API lấy thông tin đơn hàng theo ID
 * GET /api/orders/:orderId
 */
router.get('/orders/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const order = orderService.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng'
      });
    }

    res.status(200).json({
      success: true,
      order: order.getOrderData()
    });
  } catch (error) {
    console.error(`Lỗi khi lấy thông tin đơn hàng ${req.params.orderId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
});

/**
 * API tạo đơn hàng mới
 * POST /api/orders
 */
router.post('/orders', async (req, res) => {
  try {
    const { customerId, orderDetails, findDriver } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'customerId là bắt buộc'
      });
    }

    // Tạo đơn hàng mới
    const order = orderService.createOrder({
      customerId,
      orderDetails: orderDetails || {}
    });

    // Thông báo qua socket đến khách hàng nếu có
    const io = req.app.get('io');
    if (io) {
      io.to(`customer_${customerId}`).emit('new_order_created', {
        orderId: order.orderId,
        order: order.getOrderData(),
        timestamp: new Date().toISOString()
      });
    }

    // Tự động tìm tài xế nếu có yêu cầu
    if (findDriver === true) {
      // Tạo mock socket để gọi controller
      const mockSocket = {
        emit: (event, data) => {
          // Nếu cần, có thể gửi thông báo về kết quả tìm tài xế qua socket
          if (io) {
            io.to(`customer_${customerId}`).emit(event, data);
          }
        }
      };

      // Gọi controller để tìm tài xế
      await orderController.findDriverForOrder(mockSocket, { orderId: order.orderId }, io);
    }

    res.status(201).json({
      success: true,
      orderId: order.orderId,
      order: order.getOrderData()
    });
  } catch (error) {
    console.error('Lỗi khi tạo đơn hàng:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + error.message
    });
  }
});

/**
 * API cập nhật trạng thái đơn hàng
 * PUT /api/orders/:orderId/status
 */
router.put('/orders/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, details, updatedBy } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status là bắt buộc'
      });
    }

    // Lấy thông tin đơn hàng
    const order = orderService.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng'
      });
    }

    // Cập nhật trạng thái
    const result = orderService.updateOrderStatus(orderId, status, details || {});

    // Thông báo qua socket đến các bên liên quan
    const io = req.app.get('io');
    if (io) {
      // Thông báo cho khách hàng
      io.to(`customer_${order.customerId}`).emit('order_status_updated', {
        orderId,
        status,
        updatedBy: updatedBy || 'api',
        details: details || {},
        timestamp: new Date().toISOString()
      });

      // Thông báo cho tài xế nếu có
      if (order.assignedDriver) {
        const driver = driverController.getDriverByUuid(order.assignedDriver);
        if (driver && driver.socketId) {
          io.to(driver.socketId).emit('order_status_updated', {
            orderId,
            status,
            updatedBy: updatedBy || 'api',
            details: details || {},
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      orderId,
      status: result.status,
      timestamp: result.timestamp,
      order: order.getOrderData()
    });
  } catch (error) {
    console.error(`Lỗi khi cập nhật trạng thái đơn hàng ${req.params.orderId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + error.message
    });
  }
});

/**
 * API hủy đơn hàng
 * DELETE /api/orders/:orderId
 */
router.delete('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, cancelledBy } = req.body;

    // Lấy thông tin đơn hàng
    const order = orderService.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng'
      });
    }

    // Hủy đơn hàng
    orderService.updateOrderStatus(orderId, 'cancelled', {
      cancelledBy: cancelledBy || 'api',
      cancelReason: reason || 'Hủy qua API'
    });

    // Thông báo qua socket đến các bên liên quan
    const io = req.app.get('io');
    if (io) {
      // Thông báo cho khách hàng
      io.to(`customer_${order.customerId}`).emit('order_cancelled', {
        orderId,
        cancelledBy: cancelledBy || 'api',
        reason: reason || 'Hủy qua API',
        timestamp: new Date().toISOString()
      });

      // Thông báo cho tài xế nếu có
      if (order.assignedDriver) {
        const driver = driverController.getDriverByUuid(order.assignedDriver);
        if (driver && driver.socketId) {
          io.to(driver.socketId).emit('order_cancelled', {
            orderId,
            cancelledBy: cancelledBy || 'api',
            reason: reason || 'Hủy qua API',
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      orderId,
      message: 'Đơn hàng đã được hủy thành công',
      order: order.getOrderData()
    });
  } catch (error) {
    console.error(`Lỗi khi hủy đơn hàng ${req.params.orderId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + error.message
    });
  }
});

module.exports = router; 
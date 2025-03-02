const express = require('express');
const router = express.Router();
const orderController = require('../controllers/OrderController');
const driverController = require('../controllers/DriverController');

/**
 * API tạo đơn hàng mới
 * POST /api/orders
 */
router.post('/orders', (req, res) => {
  const io = req.app.get('io'); // Lấy instance Socket.IO từ app
  const result = orderController.createOrder(io, req.body);
  res.status(result.success ? 200 : 400).json(result);
});

/**
 * API hủy đơn hàng
 * DELETE /api/orders/:orderId
 */
router.delete('/orders/:orderId', (req, res) => {
  const result = orderController.cancelOrder(req.params.orderId);
  res.status(result.success ? 200 : 400).json(result);
});

/**
 * API lấy danh sách tài xế online
 * GET /api/drivers/online
 */
router.get('/drivers/online', (req, res) => {
  try {
    const drivers = driverController.getOnlineDrivers().map(driver => ({
      uuid: driver.uuid,
      name: driver.name,
      phone: driver.phone,
      rate: driver.rate,
      location: driver.location,
      lastActive: driver.lastActive
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
 * GET /api/drivers/:uuid
 */
router.get('/drivers/:uuid', (req, res) => {
  try {
    const driver = driverController.getDriverByUuid(req.params.uuid);

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài xế'
      });
    }

    res.status(200).json({
      success: true,
      driver: {
        uuid: driver.uuid,
        name: driver.name,
        phone: driver.phone,
        rate: driver.rate,
        isOnline: driver.isOnline,
        isBusy: driver.isBusy,
        location: driver.location,
        lastActive: driver.lastActive
      }
    });
  } catch (error) {
    console.error(`Lỗi khi lấy thông tin tài xế ${req.params.uuid}:`, error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
});

module.exports = router; 
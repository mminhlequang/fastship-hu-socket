const express = require('express');
const router = express.Router();
const driverController = require('../controllers/DriverController');

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


module.exports = router; 
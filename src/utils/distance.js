/**
 * Công cụ tính toán khoảng cách giữa hai tọa độ
 */

/**
 * Tính khoảng cách giữa hai tọa độ GPS theo công thức Haversine
 * @param {number} lat1 - Vĩ độ điểm 1
 * @param {number} lng1 - Kinh độ điểm 1
 * @param {number} lat2 - Vĩ độ điểm 2
 * @param {number} lng2 - Kinh độ điểm 2
 * @returns {number} Khoảng cách tính bằng km
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Bán kính trái đất tính bằng km
  const dLat = deg2rad(lat2 - lat1);
  const dLng = deg2rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Khoảng cách tính bằng km
  return distance;
};

/**
 * Chuyển đổi độ sang radian
 * @param {number} deg - Độ
 * @returns {number} Radian
 */
const deg2rad = (deg) => {
  return deg * (Math.PI / 180);
};

module.exports = {
  calculateDistance,
  deg2rad
}; 
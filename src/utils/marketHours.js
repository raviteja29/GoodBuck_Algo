/**
 * Market Hours Utility for Indian Stock Markets
 * Based on NSE/BSE trading hours: 9:15 AM to 3:30 PM IST
 */

/**
 * Check if Indian markets are currently open
 * Market hours: Monday to Friday, 9:15 AM to 3:30 PM IST
 * @returns {boolean} True if markets are open
 */
export function isMarketOpen() {
  const now = new Date();
  
  // Convert to IST (UTC + 5:30)
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  const istTime = new Date(now.getTime() + istOffset);
  
  // Check if it's a weekday (Monday = 1, Sunday = 0)
  const dayOfWeek = istTime.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false; // Weekend
  }
  
  // Get current time in IST
  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  const currentTimeMinutes = hours * 60 + minutes;
  
  // Market hours: 9:15 AM to 3:30 PM IST
  const marketOpenMinutes = 9 * 60 + 15; // 9:15 AM
  const marketCloseMinutes = 15 * 60 + 30; // 3:30 PM
  
  return currentTimeMinutes >= marketOpenMinutes && currentTimeMinutes <= marketCloseMinutes;
}

/**
 * Get market status with additional information
 * @returns {Object} Market status object
 */
export function getMarketStatus() {
  const isOpen = isMarketOpen();
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  
  const dayOfWeek = istTime.getUTCDay();
  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  
  // Check if it's weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      isOpen: false,
      status: 'Weekend',
      message: 'Markets closed for weekend',
      nextOpen: getNextMarketOpen()
    };
  }
  
  // Check market hours
  const currentTimeMinutes = hours * 60 + minutes;
  const marketOpenMinutes = 9 * 60 + 15; // 9:15 AM
  const marketCloseMinutes = 15 * 60 + 30; // 3:30 PM
  
  if (currentTimeMinutes < marketOpenMinutes) {
    return {
      isOpen: false,
      status: 'Pre-Market',
      message: `Markets open at 9:15 AM IST`,
      nextOpen: getNextMarketOpen()
    };
  } else if (currentTimeMinutes > marketCloseMinutes) {
    return {
      isOpen: false,
      status: 'After Hours',
      message: 'Markets closed for the day',
      nextOpen: getNextMarketOpen()
    };
  } else {
    return {
      isOpen: true,
      status: 'Open',
      message: 'Markets are open',
      nextClose: getNextMarketClose()
    };
  }
}

/**
 * Get next market opening time
 * @returns {Date} Next market opening time
 */
function getNextMarketOpen() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  
  const nextOpen = new Date(istTime);
  nextOpen.setUTCHours(9, 15, 0, 0); // 9:15 AM IST
  
  // If market opening time has passed today, move to next business day
  if (istTime.getUTCHours() > 15 || (istTime.getUTCHours() === 15 && istTime.getUTCMinutes() > 30)) {
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
  }
  
  // Skip weekends
  while (nextOpen.getUTCDay() === 0 || nextOpen.getUTCDay() === 6) {
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
  }
  
  // Convert back to local time
  return new Date(nextOpen.getTime() - istOffset);
}

/**
 * Get next market closing time
 * @returns {Date} Next market closing time
 */
function getNextMarketClose() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  
  const nextClose = new Date(istTime);
  nextClose.setUTCHours(15, 30, 0, 0); // 3:30 PM IST
  
  // Convert back to local time
  return new Date(nextClose.getTime() - istOffset);
}

/**
 * Format time for display
 * @param {Date} date 
 * @returns {string} Formatted time string
 */
export function formatMarketTime(date) {
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

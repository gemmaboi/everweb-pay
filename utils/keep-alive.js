// Utility to prevent Render.com from spinning down the service
async function pingServer() {
    try {
      const response = await fetch("https://everweb-pay.onrender.com/api/health")
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      console.log("Keep-alive ping successful:", new Date().toISOString())
    } catch (error) {
      console.error("Keep-alive ping failed:", error.message)
    }
  }
  
  // Start the keep-alive ping every 5 minutes (30000ms)
  // Using a longer interval to reduce unnecessary requests while still preventing spin-down
  const PING_INTERVAL = 30000
  
  // Export the start function to be called from server.js
  function startKeepAlive() {
    console.log("Starting keep-alive service...")
    setInterval(pingServer, PING_INTERVAL)
    // Execute immediately instead of waiting for first interval
    pingServer()
  }
  
  module.exports = { startKeepAlive }
  
  
const express = require("express")
const axios = require("axios")
const { GoogleSpreadsheet } = require("google-spreadsheet")
const { JWT } = require("google-auth-library")
const cors = require("cors")
const { startKeepAlive } = require("./utils/keep-alive")
require("dotenv").config()

// Validate required environment variables
const requiredEnvVars = [
  "EVERWEBINAR_API_KEY",
  "WEBINAR_ID",
  "PAYHIP_SHEET_ID",
  "EVERWEBINAR_SHEET_ID",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
]
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`)
  } else {
    console.log(`Found environment variable: ${varName}`)
  }
})

const app = express()
const port = process.env.PORT || 3000

app.use(express.static("public"))
app.use(express.json())
app.use(cors())

// EverWebinar API endpoints
const EVERWEBINAR_API_URL = "https://api.webinarjam.com/everwebinar/webinar"
const EVERWEBINAR_REGISTER_URL = "https://api.webinarjam.com/everwebinar/register"

// Function to format the private key
function formatPrivateKey(key) {
  // Remove any extra quotes and newlines
  key = key.replace(/\\n/g, "\n").replace(/"/g, "")

  // Ensure the key has the correct header and footer
  if (!key.startsWith("-----BEGIN PRIVATE KEY-----")) {
    key = "-----BEGIN PRIVATE KEY-----\n" + key
  }
  if (!key.endsWith("-----END PRIVATE KEY-----")) {
    key = key + "\n-----END PRIVATE KEY-----"
  }

  return key
}

// Function to initialize Google Sheets
async function initializeGoogleSheets(sheetId) {
  try {
    const privateKey = formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY)
    console.log("Private key length:", privateKey.length)
    console.log("Private key first 10 characters:", privateKey.substring(0, 10))
    console.log("Private key last 10 characters:", privateKey.substring(privateKey.length - 10))

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    })

    const doc = new GoogleSpreadsheet(sheetId, auth)
    await doc.loadInfo()
    return doc
  } catch (error) {
    console.error("Error initializing Google Sheets:", error)
    console.error("Error stack:", error.stack)
    throw error
  }
}

// Function to retry API calls
async function retryApiCall(apiCall, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiCall()
    } catch (error) {
      console.error(`API call failed (attempt ${i + 1}/${maxRetries}):`, error.message)
      if (i === maxRetries - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))) // Exponential backoff
    }
  }
}

// Endpoint to fetch webinar schedules
app.get("/api/schedules", async (req, res) => {
  try {
    console.log("API Key present:", !!process.env.EVERWEBINAR_API_KEY)
    console.log("Webinar ID present:", !!process.env.WEBINAR_ID)

    const schedules = await retryApiCall(async () => {
      const requestBody = {
        api_key: process.env.EVERWEBINAR_API_KEY,
        webinar_id: process.env.WEBINAR_ID,
        page: 0,
      }

      console.log("Making request with body:", {
        ...requestBody,
        api_key: requestBody.api_key ? "[PRESENT]" : "[MISSING]",
      })

      const response = await axios.post(EVERWEBINAR_API_URL, requestBody)

      if (!response.data || !response.data.webinar || !response.data.webinar.schedules) {
        console.error("Invalid response format:", response.data)
        throw new Error("Invalid API response format")
      }

      return response.data.webinar.schedules.map((schedule) => ({
        date: schedule.date,
        schedule: schedule.schedule,
        comment: schedule.comment,
      }))
    })
    res.json(schedules)
  } catch (error) {
    const errorDetails = {
      message: error.message,
      response: error.response?.data,
      stack: error.stack,
    }
    console.error("Detailed error in schedules endpoint:", errorDetails)
    res.status(500).json({
      error: "Failed to fetch schedules",
      details: errorDetails,
    })
  }
})

// Function to register user to EverWebinar
async function registerToEverWebinar(userData) {
  return retryApiCall(async () => {
    const response = await axios.post(EVERWEBINAR_REGISTER_URL, {
      api_key: process.env.EVERWEBINAR_API_KEY,
      webinar_id: process.env.WEBINAR_ID,
      schedule: userData.scheduleId,
      email: userData.email,
      first_name: userData.firstName,
      last_name: userData.lastName,
      timezone: "UTC",
      page: 0,
    })
    console.log("EverWebinar registration response:", response.data)
    return response.data
  })
}

// Endpoint to submit form data to Google Sheets and register to EverWebinar
app.post("/api/submit", async (req, res) => {
  try {
    const { name, email, selectedSchedule, scheduleId } = req.body
    const [firstName, lastName] = name.split(" ")

    console.log("Received form submission:", { name, email, selectedSchedule, scheduleId })
    console.log("Payhip Sheet ID:", process.env.PAYHIP_SHEET_ID)

    // Initialize Google Sheets documents
    const everwebinarDoc = await initializeGoogleSheets(process.env.EVERWEBINAR_SHEET_ID)
    const payhipDoc = await initializeGoogleSheets(process.env.PAYHIP_SHEET_ID)

    console.log("Google Sheets initialized")

    // Get Payhip sheet data
    const payhipSheet = payhipDoc.sheetsByIndex[0]
    const payhipRows = await payhipSheet.getRows()

    console.log("Payhip rows fetched:", payhipRows.length)

    // Check if email exists in Payhip sheet
    const emailExists = payhipRows.some((row) => {
      const rowEmail = row.get("Email")
      if (!rowEmail) {
        console.log("Warning: Row with missing Email field:", row.get("First Name"), row.get("Last Name"))
        return false
      }
      console.log("Comparing:", rowEmail, email)
      return rowEmail.toLowerCase().trim() === email.toLowerCase().trim()
    })

    console.log("Email exists in Payhip sheet:", emailExists)

    // Add row to Everwebinar sheet
    const everwebinarSheet = everwebinarDoc.sheetsByIndex[0]
    await everwebinarSheet.addRow({ Name: name, Email: email, Schedule: selectedSchedule })

    console.log("Row added to Everwebinar sheet")

    let everwebinarResponse = null
    let message = "Form submitted successfully."

    if (emailExists) {
      // Register to EverWebinar
      everwebinarResponse = await registerToEverWebinar({
        firstName,
        lastName,
        email,
        scheduleId,
      })
      message += " Registered to EverWebinar."
      console.log("Registered to EverWebinar")
    } else {
      message += " Email not found in Payhip sheet. Not registered to EverWebinar."
      console.log("Not registered to EverWebinar")
    }

    res.json({
      message,
      everwebinarResponse,
    })
  } catch (error) {
    console.error("Error in form submission or EverWebinar registration:", error)
    res.status(500).json({ error: "Failed to submit form or register to EverWebinar", details: error.message })
  }
})

// Add health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() })
})

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
  // Start the keep-alive service after server starts
  startKeepAlive()
})


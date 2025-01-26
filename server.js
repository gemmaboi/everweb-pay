const express = require("express")
const axios = require("axios")
const { GoogleSpreadsheet } = require("google-spreadsheet")
const { JWT } = require("google-auth-library")
const cors = require("cors")
require("dotenv").config()

const app = express()
const port = process.env.PORT || 3000

app.use(express.static("public"))
app.use(express.json())
app.use(cors())

// EverWebinar API endpoints
const EVERWEBINAR_API_URL = "https://api.webinarjam.com/everwebinar/webinar"
const EVERWEBINAR_REGISTER_URL = "https://api.webinarjam.com/everwebinar/register"

// Function to initialize Google Sheets
async function initializeGoogleSheets(sheetId) {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })

  const doc = new GoogleSpreadsheet(sheetId, auth)
  await doc.loadInfo()
  return doc
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
    const schedules = await retryApiCall(async () => {
      const response = await axios.post(EVERWEBINAR_API_URL, {
        api_key: process.env.EVERWEBINAR_API_KEY,
        webinar_id: process.env.WEBINAR_ID,
      })
      return response.data.webinar.schedules.map((schedule) => ({
        date: schedule.date,
        schedule: schedule.schedule,
        comment: schedule.comment,
      }))
    })
    res.json(schedules)
  } catch (error) {
    console.error("Error fetching schedules:", error)
    res.status(500).json({ error: "Failed to fetch schedules" })
  }
})

// Function to register user to EverWebinar
async function registerToEverWebinar(userData) {
  return retryApiCall(async () => {
    const response = await axios.post(EVERWEBINAR_REGISTER_URL, {
      api_key: process.env.EVERWEBINAR_API_KEY,
      webinar_id: process.env.WEBINAR_ID,
      first_name: userData.firstName,
      last_name: userData.lastName,
      email: userData.email,
      schedule: userData.scheduleId,
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
    res.status(500).json({ error: "Failed to submit form or register to EverWebinar" })
  }
})

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})


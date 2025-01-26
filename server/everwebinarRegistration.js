const { GoogleSpreadsheet } = require("google-spreadsheet")
const axios = require("axios")

async function registerMatchingUsers() {
  try {
    // Initialize both Google Sheets
    const payhipSheet = new GoogleSpreadsheet(process.env.PAYHIP_SHEET_ID)
    const everwebinarSheet = new GoogleSpreadsheet(process.env.EVERWEBINAR_SHEET_ID)

    await payhipSheet.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    })

    await everwebinarSheet.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    })

    await payhipSheet.loadInfo()
    await everwebinarSheet.loadInfo()

    const payhipData = await payhipSheet.sheetsByIndex[0].getRows()
    const everwebinarData = await everwebinarSheet.sheetsByIndex[0].getRows()

    for (const everwebinarRow of everwebinarData) {
      const matchingPayhipRow = payhipData.find((row) => row.Email === everwebinarRow.Email)

      if (matchingPayhipRow) {
        await registerToEverWebinar({
          firstName: matchingPayhipRow["First Name"],
          lastName: matchingPayhipRow["Last Name"],
          email: matchingPayhipRow.Email,
          date: everwebinarRow.Schedule,
        })
      }
    }

    console.log("Registration process completed")
  } catch (error) {
    console.error("Error in registration process:", error)
  }
}

async function registerToEverWebinar(userData) {
  try {
    const response = await axios.post("https://api.webinarjam.com/everwebinar/register", {
      api_key: process.env.EVERWEBINAR_API_KEY,
      webinar_id: process.env.WEBINAR_ID,
      first_name: userData.firstName,
      last_name: userData.lastName,
      email: userData.email,
      date: userData.date,
    })

    console.log(`User ${userData.email} registered successfully`)
    return response.data
  } catch (error) {
    console.error(`Error registering user ${userData.email}:`, error.response ? error.response.data : error.message)
  }
}

module.exports = { registerMatchingUsers }


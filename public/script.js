document.addEventListener("DOMContentLoaded", () => {
    const scheduleSelect = document.getElementById("scheduleSelect")
    const additionalFields = document.getElementById("additionalFields")
    const registrationForm = document.getElementById("registrationForm")
    const messageDiv = document.getElementById("message")
  
    // Fetch schedules from the server
    fetch("/api/schedules")
      .then((response) => response.json())
      .then((schedules) => {
        schedules.forEach((schedule) => {
          const option = document.createElement("option")
          option.value = JSON.stringify({ date: schedule.date, scheduleId: schedule.schedule })
          option.textContent = `${schedule.date} - ${schedule.comment}`
          scheduleSelect.appendChild(option)
        })
      })
      .catch((error) => {
        console.error("Error fetching schedules:", error)
        messageDiv.textContent = "Failed to load schedules. Please try again later."
      })
  
    // Show additional fields when a schedule is selected
    scheduleSelect.addEventListener("change", () => {
      if (scheduleSelect.value) {
        additionalFields.style.display = "block"
      } else {
        additionalFields.style.display = "none"
      }
    })
  
    // Handle form submission
    registrationForm.addEventListener("submit", (e) => {
      e.preventDefault()
  
      const name = document.getElementById("name").value
      const email = document.getElementById("email").value
      const selectedScheduleData = JSON.parse(scheduleSelect.value)
  
      fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          selectedSchedule: selectedScheduleData.date,
          scheduleId: selectedScheduleData.scheduleId,
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          messageDiv.textContent = data.message
          if (data.everwebinarResponse) {
            messageDiv.textContent += ` EverWebinar registration successful. User ID: ${data.everwebinarResponse.user.user_id}`
          }
          registrationForm.reset()
          additionalFields.style.display = "none"
        })
        .catch((error) => {
          console.error("Error submitting form:", error)
          messageDiv.textContent = "Failed to submit form. Please try again later."
        })
    })
  })
  
  
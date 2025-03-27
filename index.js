require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const moment = require("moment-timezone");
const schedule = require("node-schedule");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const express = require("express");
const app = express();

// Serve static files from public directory
app.use(express.static("public"));

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Initialize bot with token and proper error handling
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: {
    autoStart: true,
    params: {
      timeout: 10,
    },
  },
});

// Function to schedule alerts for a user
function scheduleUserAlerts(chatId) {
  const userPrefs = userPreferences[chatId];
  if (!userPrefs || !userPrefs.alertsEnabled) {
    // Cancel existing schedules if alerts are disabled
    schedule.cancelJob(`checkIn_${chatId}`);
    schedule.cancelJob(`checkOut_${chatId}`);
    return;
  }

  const checkInTime = userPrefs.alertTimes?.checkIn || { hour: 8, minute: 25 };
  const checkOutTime = userPrefs.alertTimes?.checkOut || {
    hour: 17,
    minute: 30,
  };

  // Cancel existing schedules before creating new ones
  schedule.cancelJob(`checkIn_${chatId}`);
  schedule.cancelJob(`checkOut_${chatId}`);

  // Schedule check-in alert
  const checkInRule = new schedule.RecurrenceRule();
  checkInRule.tz = "Asia/Phnom_Penh";
  checkInRule.hour = checkInTime.hour;
  checkInRule.minute = checkInTime.minute;
  schedule.scheduleJob(`checkIn_${chatId}`, checkInRule, () => {
    bot.sendMessage(chatId, "🔔 Time to check in!", getCommandKeyboard());
  });

  // Schedule check-out alert
  const checkOutRule = new schedule.RecurrenceRule();
  checkOutRule.tz = "Asia/Phnom_Penh";
  checkOutRule.hour = checkOutTime.hour;
  checkOutRule.minute = checkOutTime.minute;
  schedule.scheduleJob(`checkOut_${chatId}`, checkOutRule, () => {
    bot.sendMessage(chatId, "🔔 Time to check out!", getCommandKeyboard());
  });

  console.log(
    `Scheduled alerts for user ${chatId}:\nCheck-in: ${checkInTime.hour}:${checkInTime.minute}\nCheck-out: ${checkOutTime.hour}:${checkOutTime.minute}`,
  );
}

// Handle polling errors
bot.on("polling_error", (error) => {
  console.error("Polling error:", error.code);
  if (
    error.code === "ETELEGRAM" &&
    error.message.includes("terminated by other getUpdates request")
  ) {
    console.log(
      "Another bot instance is running. This instance will stop polling.",
    );
    bot.stopPolling();
    process.exit(1);
  }
});

// Store user preferences
let userPreferences = {};

// Load existing preferences and schedule alerts
const preferencesPath = path.join(dataDir, "preferences.json");
if (fs.existsSync(preferencesPath)) {
  userPreferences = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
  // Schedule alerts for all users
  Object.keys(userPreferences).forEach((chatId) => {
    scheduleUserAlerts(chatId);
  });
}

// Save preferences
function savePreferences() {
  fs.writeFileSync(preferencesPath, JSON.stringify(userPreferences, null, 2));
}

// Get command keyboard
function getCommandKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ["✅ Check In", "🚪 Check Out"],
        ["📊 Monthly Report", "⚙️ Settings"],
        ["📸 Get Image"],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      persistent: true,
    },
  };
}

// Get alert settings keyboard
function getAlertSettingsKeyboard(chatId) {
  const userPrefs = userPreferences[chatId] || { alertsEnabled: true };
  const alertsEnabled =
    userPrefs.alertsEnabled !== undefined ? userPrefs.alertsEnabled : true;
  const checkInTime = userPrefs.alertTimes?.checkIn || { hour: 8, minute: 25 };
  const checkOutTime = userPrefs.alertTimes?.checkOut || {
    hour: 17,
    minute: 30,
  };

  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `${alertsEnabled ? "🔔 Alerts: ON" : "🔕 Alerts: OFF"}`,
            callback_data: alertsEnabled ? "alerts_off" : "alerts_on",
          },
        ],
        [
          {
            text: `⏰ Check-in Time: ${String(checkInTime.hour).padStart(
              2,
              "0",
            )}:${String(checkInTime.minute).padStart(2, "0")}`,
            callback_data: "set_checkIn_time",
          },
        ],
        [
          {
            text: `⏰ Check-out Time: ${String(checkOutTime.hour).padStart(
              2,
              "0",
            )}:${String(checkOutTime.minute).padStart(2, "0")}`,
            callback_data: "set_checkOut_time",
          },
        ],
        [
          {
            text: "❌ Close Menu Settings",
            callback_data: "closed_menu_settings",
          },
        ],
      ],
    },
  };
}

// Get time selection keyboard
function getTimeSelectionKeyboard(
  type,
  currentHour = 8,
  currentMinute = 30,
  step = "hour",
) {
  if (step === "hour") {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourButtons = hours.map((h) => ({
      text: String(h).padStart(2, "0"),
      callback_data: `${type}_hour_${h}`,
    }));

    const hourRows = [];
    for (let i = 0; i < hourButtons.length; i += 6) {
      hourRows.push(hourButtons.slice(i, i + 6));
    }

    return {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `Select Hour (Current: ${String(currentHour).padStart(
                2,
                "0",
              )}:${String(currentMinute).padStart(2, "0")})`,
              callback_data: "current_time",
            },
          ],
          ...hourRows,
          [
            {
              text: "⬅️ Back to Menu Settings",
              callback_data: "back_to_menu_settings",
            },
          ],
        ],
      },
    };
  } else {
    const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
    const minuteButtons = minutes.map((m) => ({
      text: String(m).padStart(2, "0"),
      callback_data: `${type}_minute_${m}`,
    }));

    const minuteRows = [];
    for (let i = 0; i < minuteButtons.length; i += 6) {
      minuteRows.push(minuteButtons.slice(i, i + 6));
    }

    return {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `Select Minute (Hour: ${String(currentHour).padStart(
                2,
                "0",
              )})`,
              callback_data: "current_time",
            },
          ],
          ...minuteRows,
          [
            {
              text: "⬅️ Back to Hour Selection",
              callback_data: `${type}_back_to_hour`,
            },
          ],
        ],
      },
    };
  }
}

// Handle start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage =
    "Welcome to the Attendance Bot! 📝\n\nUse the buttons below to manage your attendance:";

  try {
    await bot.sendMessage(chatId, welcomeMessage, getCommandKeyboard());
  } catch (error) {
    console.error("Error sending start message:", error);
    await bot.sendMessage(chatId, "An error occurred. Please try again.");
  }
});

// Handle callback queries from inline keyboard
// Handle settings button
bot.onText(/⚙️ Settings/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId,
    "Settings Menu:",
    getAlertSettingsKeyboard(chatId),
  );
});

// Handle Get Image button
bot.onText(/📸 Get Image/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, "Select image type:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📥 Check-in Image", callback_data: "get_checkin_image" }],
        [{ text: "📤 Check-out Image", callback_data: "get_checkout_image" }],
        [{ text: "❌ Close Menu", callback_data: "closed_getting_image" }],
      ],
    },
  });
});

// Handle callback queries
bot.on("callback_query", async (query) => {
  try {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    await bot.answerCallbackQuery(query.id);

    const timestamp = moment();
    const date = timestamp.tz("Asia/Phnom_Penh").format("YYYY-MM-DD");
    const time = timestamp.tz("Asia/Phnom_Penh").format("HH:mm:ss");

    switch (query.data) {
      case "check_in":
        const checkInPath = path.join(dataDir, `${chatId}_attendance.json`);
        let checkInAttendance = {};

        if (fs.existsSync(checkInPath)) {
          checkInAttendance = JSON.parse(fs.readFileSync(checkInPath, "utf8"));
        }

        if (!checkInAttendance[date]) {
          checkInAttendance[date] = {};
        }

        checkInAttendance[date].checkIn = time;
        if (checkInAttendance[date].pendingMessageId) {
          await bot.deleteMessage(chatId, messageId);
          checkInAttendance[date].checkInMessageId =
            checkInAttendance[date].pendingMessageId;
          delete checkInAttendance[date].pendingMessageId;
        }
        fs.writeFileSync(
          checkInPath,
          JSON.stringify(checkInAttendance, null, 2),
        );

        await bot.sendMessage(
          chatId,
          `✅ Check-in recorded for ${date} at ${time}!`,
          getCommandKeyboard(),
        );
        break;

      case "check_out":
        const checkOutPath = path.join(dataDir, `${chatId}_attendance.json`);
        let checkOutAttendance = {};

        if (fs.existsSync(checkOutPath)) {
          checkOutAttendance = JSON.parse(
            fs.readFileSync(checkOutPath, "utf8"),
          );
        }

        if (!checkOutAttendance[date]) {
          checkOutAttendance[date] = {};
        }

        checkOutAttendance[date].checkOut = time;
        if (checkOutAttendance[date].pendingMessageId) {
          await bot.deleteMessage(chatId, messageId);
          checkInAttendance[date].checkOutMessageId =
            checkInAttendance[date].pendingMessageId;
          delete checkOutAttendance[date].pendingMessageId;
        }
        fs.writeFileSync(
          checkOutPath,
          JSON.stringify(checkOutAttendance, null, 2),
        );

        await bot.sendMessage(
          chatId,
          `🚪 Check-out recorded for ${date} at ${time}!`,
          getCommandKeyboard(),
        );
        break;
      case "report_text":
      case "report_excel":
        try {
          const { report, records, currentMonth } = await generateReportData(
            chatId,
          );

          if (query.data === "report_text") {
            await bot.editMessageText(report, {
              chat_id: chatId,
              message_id: messageId,
              reply_markup: { inline_keyboard: [] },
            });
          } else {
            // Generate Excel file
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(records);
            XLSX.utils.book_append_sheet(wb, ws, currentMonth);

            const excelPath = path.join(
              dataDir,
              `${chatId}_attendance_${currentMonth}.xlsx`,
            );
            XLSX.writeFile(wb, excelPath);

            await bot.editMessageText(report, {
              chat_id: chatId,
              message_id: messageId,
              reply_markup: { inline_keyboard: [] },
            });
            await bot.sendDocument(chatId, excelPath);
            fs.unlinkSync(excelPath); // Clean up the file after sending
          }
        } catch (error) {
          console.error("Error generating report:", error);
          await bot.sendMessage(
            chatId,
            "An error occurred while generating the report. Please try again.",
          );
        }
        break;
      case "alert_settings":
        await bot.editMessageText("Alert Settings:", {
          chat_id: chatId,
          message_id: messageId,
          ...getAlertSettingsKeyboard(chatId),
        });
        break;

      case "back_to_main":
        await bot.deleteMessage(chatId, messageId);
        await bot.sendMessage(chatId, "Main Menu:", getCommandKeyboard());
        break;

      case "closed_menu_settings":
        await bot.deleteMessage(chatId, messageId);
        await bot.sendMessage(
          chatId,
          "❌ Menu settings closed",
          getCommandKeyboard(),
        );
        break;

      case "closed_getting_image":
        await bot.deleteMessage(chatId, messageId);
        await bot.sendMessage(
          chatId,
          "❌ Getting image closed",
          getCommandKeyboard(),
        );
        break;

      case "back_to_menu_settings":
        await bot.editMessageText("Menu Settings:", {
          chat_id: chatId,
          message_id: messageId,
          ...getAlertSettingsKeyboard(chatId),
        });
        break;

      case "get_checkin_image":
      case "get_checkout_image":
        const imageType =
          query.data === "get_checkin_image" ? "checkIn" : "checkOut";
        await bot.deleteMessage(chatId, messageId);
        await bot.sendMessage(
          chatId,
          "Please enter the date in format: YYYY-MM-DD",
          {
            reply_markup: {
              force_reply: true,
              selective: true,
            },
          },
        );
        // Store the image type in user preferences for later use
        if (!userPreferences[chatId]) userPreferences[chatId] = {};
        userPreferences[chatId].pendingImageType = imageType;
        savePreferences();
        break;

      case "alerts_on":
      case "alerts_off":
        if (!userPreferences[chatId]) {
          userPreferences[chatId] = {};
        }
        userPreferences[chatId].alertsEnabled = query.data === "alerts_on";
        savePreferences();
        // Update alert schedules
        if (query.data === "alerts_on") {
          scheduleUserAlerts(chatId);
        } else {
          // Cancel existing schedules
          schedule.cancelJob(`checkIn_${chatId}`);
          schedule.cancelJob(`checkOut_${chatId}`);
        }
        await bot.editMessageText("Settings Menu:", {
          chat_id: chatId,
          message_id: messageId,
          ...getAlertSettingsKeyboard(chatId),
        });
        break;

      case "set_checkIn_time":
      case "set_checkOut_time":
        const type = query.data.includes("checkIn") ? "checkIn" : "checkOut";
        const currentTime = userPreferences[chatId]?.alertTimes?.[type] || {
          hour: 8,
          minute: 25,
        };
        await bot.editMessageText(
          `Select ${type === "checkIn" ? "Check-in" : "Check-out"} Time:`,
          {
            chat_id: chatId,
            message_id: messageId,
            ...getTimeSelectionKeyboard(
              type,
              currentTime.hour,
              currentTime.minute,
              "hour",
            ),
          },
        );
        break;

      case query.data.match(/^(checkIn|checkOut)_back_to_hour$/)?.input:
        const backType = query.data.split("_")[0];
        const backCurrentTime = userPreferences[chatId]?.alertTimes?.[
          backType
        ] || { hour: 8, minute: 25 };
        await bot.editMessageText(
          `Select ${backType === "checkIn" ? "Check-in" : "Check-out"} Time:`,
          {
            chat_id: chatId,
            message_id: messageId,
            ...getTimeSelectionKeyboard(
              backType,
              backCurrentTime.hour,
              backCurrentTime.minute,
              "hour",
            ),
          },
        );
        break;
    }

    // Handle time selection
    if (query.data.match(/^(checkIn|checkOut)_(hour|minute)_\d+$/)) {
      const [type, field, value] = query.data.split("_");
      if (!userPreferences[chatId]) {
        userPreferences[chatId] = {};
      }
      if (!userPreferences[chatId].alertTimes) {
        userPreferences[chatId].alertTimes = {};
      }
      if (!userPreferences[chatId].alertTimes[type]) {
        userPreferences[chatId].alertTimes[type] = { hour: 8, minute: 25 };
      }

      userPreferences[chatId].alertTimes[type][field] = parseInt(value);
      savePreferences();
      // Update alert schedules if alerts are enabled
      if (userPreferences[chatId].alertsEnabled) {
        scheduleUserAlerts(chatId);
      }

      const currentTime = userPreferences[chatId].alertTimes[type];
      if (field === "hour") {
        await bot.editMessageText(
          `Select ${type === "checkIn" ? "Check-in" : "Check-out"} Time:`,
          {
            chat_id: chatId,
            message_id: messageId,
            ...getTimeSelectionKeyboard(
              type,
              currentTime.hour,
              currentTime.minute,
              "minute",
            ),
          },
        );
      } else {
        await bot.editMessageText("Menu Settings:", {
          chat_id: chatId,
          message_id: messageId,
          ...getAlertSettingsKeyboard(chatId),
        });
      }
    }
  } catch (error) {
    console.error("Error handling callback query:", error);
    try {
      await bot.answerCallbackQuery(query.id, {
        text: "An error occurred. Please try again.",
      });
    } catch (e) {
      console.error("Error sending error message:", e);
    }
  }
});

// Handle alerts on command
bot.onText(/\/alerts_on/, async (msg) => {
  const chatId = msg.chat.id;
  userPreferences[chatId] = { alertsEnabled: true };
  savePreferences();
  await bot.sendMessage(
    chatId,
    "Alerts enabled! I'll remind you about check-in (8:30 AM) and check-out (5:30 PM).",
    getCommandKeyboard(),
  );
});

// Handle text message for enabling alerts
bot.onText(/🔔 Enable Alerts/, async (msg) => {
  const chatId = msg.chat.id;
  userPreferences[chatId] = { alertsEnabled: true };
  savePreferences();
  await bot.sendMessage(
    chatId,
    "Alerts enabled! I'll remind you about check-in (8:30 AM) and check-out (5:30 PM).",
    getCommandKeyboard(),
  );
});

// Handle text message for disabling alerts
bot.onText(/🔕 Disable Alerts/, async (msg) => {
  const chatId = msg.chat.id;
  userPreferences[chatId] = { alertsEnabled: false };
  savePreferences();
  await bot.sendMessage(chatId, "Alerts disabled!", getCommandKeyboard());
});

// Handle toggle inline report command
bot.onText(/\/toggle_report_format/, async (msg) => {
  const chatId = msg.chat.id;
  if (!userPreferences[chatId]) {
    userPreferences[chatId] = {};
  }
  userPreferences[chatId].inlineReportEnabled =
    !userPreferences[chatId].inlineReportEnabled;
  savePreferences();

  const status = userPreferences[chatId].inlineReportEnabled
    ? "enabled"
    : "disabled";
  const message = `Report format selection is now ${status}!\n${
    status === "enabled"
      ? "You will see format options when requesting reports."
      : "Reports will be sent directly in text format."
  }`;

  await bot.sendMessage(chatId, message, getCommandKeyboard());
});

// Handle Monthly Report button
bot.onText(/📊 Monthly Report/, async (msg) => {
  const chatId = msg.chat.id;
  const userPrefs = userPreferences[chatId] || {};

  try {
    if (userPrefs.inlineReportEnabled) {
      await bot.sendMessage(chatId, "Choose report format:", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📝 Text Report", callback_data: "report_text" },
              {
                text: "📊 Include Excel Report",
                callback_data: "report_excel",
              },
            ],
          ],
        },
      });
    } else {
      const { report } = await generateReportData(chatId);
      await bot.sendMessage(chatId, report, {
        ...getCommandKeyboard(),
        parse_mode: "Markdown",
      });
    }
  } catch (error) {
    console.error("Error generating report:", error);
    await bot.sendMessage(
      chatId,
      "An error occurred while generating the report. Please try again.",
    );
  }
});

// Handle date input for image retrieval and force reply cancellation
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Check if we're waiting for a date input
  if (userPreferences[chatId]?.pendingImageType) {
    const imageType = userPreferences[chatId].pendingImageType;
    delete userPreferences[chatId].pendingImageType;
    savePreferences();

    // Parse the date
    const dateParts = text.split("-");
    if (dateParts.length !== 3) {
      await bot.sendMessage(
        chatId,
        "Invalid date format. Please use: YYYY-MM-DD",
        getCommandKeyboard(),
      );
      return;
    }

    const [year, month, day] = dateParts;
    const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

    // Get the attendance record
    const attendancePath = path.join(dataDir, `${chatId}_attendance.json`);
    if (!fs.existsSync(attendancePath)) {
      await bot.sendMessage(
        chatId,
        "No attendance records found!",
        getCommandKeyboard(),
      );
      return;
    }

    const attendance = JSON.parse(fs.readFileSync(attendancePath, "utf8"));
    const record = attendance[date];
    const messageIdKey = `${imageType}MessageId`;
    const imageTypeText = imageType === "checkIn" ? "Check-in" : "Check-out";

    if (!record || !record[messageIdKey]) {
      await bot.sendMessage(
        chatId,
        `No ${imageTypeText} image found for ${date}`,
        getCommandKeyboard(),
      );
      return;
    }

    // Retrieve the corresponding fileId based on the action
    const fileId = record[messageIdKey];

    try {
      // Send the image directly using fileId
      await bot.sendPhoto(chatId, fileId);
      await bot.sendMessage(
        chatId,
        `Here is the photo for your ${imageTypeText} on ${date}!`,
        getCommandKeyboard(),
      );
    } catch (error) {
      console.error("Error retrieving the photo:", error);
      await bot.sendMessage(
        chatId,
        "Sorry, there was an error retrieving your photo. Please try again later.",
        getCommandKeyboard(),
      );
    }
  }
});

// Store user states
let userStates = {};

// Load existing user states
const userStatesPath = path.join(dataDir, "user_states.json");
if (fs.existsSync(userStatesPath)) {
  userStates = JSON.parse(fs.readFileSync(userStatesPath, "utf8"));
}

// Save user states
function saveUserStates() {
  fs.writeFileSync(userStatesPath, JSON.stringify(userStates, null, 2));
}

// Reset user state
function resetUserState(chatId) {
  userStates[chatId] = {
    action: null,
    timestamp: null,
  };
  saveUserStates();
}

// Function to generate report data
async function generateReportData(chatId) {
  const reportPath = path.join(dataDir, `${chatId}_attendance.json`);
  const reportAttendance = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const currentMonth = moment().tz("Asia/Phnom_Penh").format("YYYY-MM");
  const userPrefs = userPreferences[chatId] || {
    alertTimes: {
      checkIn: { hour: 8, minute: 30 },
      checkOut: { hour: 17, minute: 30 },
    },
  };

  let report = `📊 Attendance Report for ${currentMonth}\n\n`;
  const records = [];

  Object.keys(reportAttendance)
    .filter((date) => date.startsWith(currentMonth))
    .sort()
    .forEach((date) => {
      const record = reportAttendance[date];
      report += `\`${date}\`:\n`;

      // Convert check-in time to Asia/Phnom_Penh timezone
      const checkInTime = record.checkIn
        ? moment
            .utc(`${date} ${record.checkIn}`)
            .tz("Asia/Phnom_Penh")
            .format("HH:mm:ss")
        : "Missing";

      // Convert check-out time to Asia/Phnom_Penh timezone
      const checkOutTime = record.checkOut
        ? moment
            .utc(`${date} ${record.checkOut}`)
            .tz("Asia/Phnom_Penh")
            .format("HH:mm:ss")
        : "Missing";

      // Add status flags for check-in
      let checkInFlag = "";
      if (checkInTime !== "Missing") {
        const checkInMoment = moment
          .utc(`${date} ${record.checkIn}`)
          .tz("Asia/Phnom_Penh");
        const expectedCheckIn = moment.tz(
          `${date} ${String(userPrefs.alertTimes.checkIn.hour).padStart(
            2,
            "0",
          )}:${String(userPrefs.alertTimes.checkIn.minute).padStart(
            2,
            "0",
          )}:00`,
          "Asia/Phnom_Penh",
        );

        if (checkInMoment.isBefore(expectedCheckIn)) {
          checkInFlag = " ⭐ (Early)";
        } else if (checkInMoment.isAfter(expectedCheckIn.add(15, "minutes"))) {
          checkInFlag = " ⚠️ (Late)";
        } else {
          checkInFlag = " ✅ (On Time)";
        }
      }

      // Add status flags for check-out
      let checkOutFlag = "";
      if (checkOutTime !== "Missing") {
        const checkOutMoment = moment
          .utc(`${date} ${record.checkOut}`)
          .tz("Asia/Phnom_Penh");
        const expectedCheckOut = moment.tz(
          `${date} ${String(userPrefs.alertTimes.checkOut?.hour || 17).padStart(
            2,
            "0",
          )}:${String(userPrefs.alertTimes.checkOut?.minute || 30).padStart(
            2,
            "0",
          )}:00`,
          "Asia/Phnom_Penh",
        );

        if (checkOutMoment.isBefore(expectedCheckOut.subtract(30, "minutes"))) {
          checkOutFlag = " ⚠️ (Early)";
        } else if (
          checkOutMoment.isAfter(expectedCheckOut.add(30, "minutes"))
        ) {
          checkOutFlag = " ⭐ (Overtime)";
        } else {
          checkOutFlag = " ✅ (On Time)";
        }
      }

      // Add image indicators
      const checkInImageFlag = record.checkInMessageId ? " 📸" : "";
      const checkOutImageFlag = record.checkOutMessageId ? " 📸" : "";

      report += `  Check-in: ${checkInTime}${checkInFlag}${checkInImageFlag}\n`;
      report += `  Check-out: ${checkOutTime}${checkOutFlag}${checkOutImageFlag}\n`;
      report += "\n";

      records.push({
        Date: date,
        "Check-in": checkInTime + checkInFlag + checkInImageFlag,
        "Check-out": checkOutTime + checkOutFlag + checkOutImageFlag,
      });
    });

  return { report, records, currentMonth };
}

// Handle test alert command
bot.onText(/⏰ Test Alert|test alert/, async (msg) => {
  const chatId = msg.chat.id;
  if (userPreferences[chatId]?.alertsEnabled) {
    const now = moment();
    const alertTime = now.add(1, "minutes").toDate();

    await bot.sendMessage(
      chatId,
      "⏰ Test alert scheduled for 1 minutes from now.",
      getCommandKeyboard(),
    );

    schedule.scheduleJob(alertTime, () => {
      bot.sendMessage(
        chatId,
        "🔔 This is your scheduled test alert!",
        getCommandKeyboard(),
      );
    });
  } else {
    await bot.sendMessage(
      chatId,
      "⚠️ Alerts are currently disabled. Enable alerts first to use this feature.",
      getCommandKeyboard(),
    );
  }
});

// Handle text message for check-in
bot.onText(/✅ Check In/, async (msg) => {
  const chatId = msg.chat.id;
  const timestamp = moment();
  const date = timestamp.tz("Asia/Phnom_Penh").format("YYYY-MM-DD");
  const time = timestamp.tz("Asia/Phnom_Penh").format("HH:mm:ss");

  // Set user state for check-in
  userStates[chatId] = {
    action: "check_in",
    timestamp: timestamp.valueOf(),
  };
  saveUserStates();

  const checkInPath = path.join(dataDir, `${chatId}_attendance.json`);
  let checkInAttendance = {};

  if (fs.existsSync(checkInPath)) {
    checkInAttendance = JSON.parse(fs.readFileSync(checkInPath, "utf8"));
  }

  if (!checkInAttendance[date]) {
    checkInAttendance[date] = {};
  }

  checkInAttendance[date].checkIn = time;
  fs.writeFileSync(checkInPath, JSON.stringify(checkInAttendance, null, 2));
  hasCheckedIn = true;
  hasCheckedOut = false;

  await bot.sendMessage(
    chatId,
    `✅ Check-in recorded for ${date} at ${time}!\n\nPlease send a photo of your attendance record.`,
    getCommandKeyboard(),
  );
});

// Handle text message for check-out
bot.onText(/🚪 Check Out/, async (msg) => {
  const chatId = msg.chat.id;
  const timestamp = moment();
  const date = timestamp.tz("Asia/Phnom_Penh").format("YYYY-MM-DD");
  const time = timestamp.tz("Asia/Phnom_Penh").format("HH:mm:ss");

  // Set user state for check-out
  userStates[chatId] = {
    action: "check_out",
    timestamp: timestamp.valueOf(),
  };
  saveUserStates();

  const checkOutPath = path.join(dataDir, `${chatId}_attendance.json`);
  let checkOutAttendance = {};

  if (fs.existsSync(checkOutPath)) {
    checkOutAttendance = JSON.parse(fs.readFileSync(checkOutPath, "utf8"));
  }

  if (!checkOutAttendance[date]) {
    checkOutAttendance[date] = {};
  }

  checkOutAttendance[date].checkOut = time;
  fs.writeFileSync(checkOutPath, JSON.stringify(checkOutAttendance, null, 2));
  hasCheckedOut = true;
  hasCheckedIn = false;

  await bot.sendMessage(
    chatId,
    `🚪 Check-out recorded for ${date} at ${time}!\n\nPlease send a photo of your attendance record.`,
    getCommandKeyboard(),
  );
});

// Reset user state for other commands
bot.onText(
  /📊 Monthly Report|🔔 Enable Alerts|🔕 Disable Alerts|⏰ Test Alert|📸 Get Image/,
  (msg) => {
    const chatId = msg.chat.id;
    resetUserState(chatId);
  },
);

// Handle photo messages
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  const fileId = msg.photo[msg.photo.length - 1].file_id; // Get highest resolution
  const timestamp = moment();
  const date = timestamp.tz("Asia/Phnom_Penh").format("YYYY-MM-DD");

  const attendancePath = path.join(dataDir, `${chatId}_attendance.json`);
  let attendance = {};

  if (fs.existsSync(attendancePath)) {
    attendance = JSON.parse(fs.readFileSync(attendancePath, "utf8"));
  }

  if (!attendance[date]) {
    attendance[date] = {};
  }

  const userState = userStates[chatId] || { action: null };

  if (userState.action === "check_in") {
    attendance[date].checkInMessageId = fileId;
    await bot.sendMessage(
      chatId,
      "📸 Photo received and attached to your check-in record!",
      getCommandKeyboard(),
    );
    resetUserState(chatId);
  } else if (userState.action === "check_out") {
    attendance[date].checkOutMessageId = fileId;
    await bot.sendMessage(
      chatId,
      "📸 Photo received and attached to your check-out record!",
      getCommandKeyboard(),
    );
    resetUserState(chatId);
  } else {
    // If no check-in/out record exists, show the options
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Check In", callback_data: "check_in" },
            { text: "🚪 Check Out", callback_data: "check_out" },
          ],
        ],
      },
    };

    attendance[date].pendingMessageId = fileId;
    await bot.sendMessage(
      chatId,
      "📸 Photo received! Please specify if this is for Check In or Check Out:",
      options,
    );
  }

  fs.writeFileSync(attendancePath, JSON.stringify(attendance, null, 2));
  resetUserState(chatId); // Reset state after handling photo to prevent duplicate messages
});

// Retrieve a Specific Image
bot.onText(
  /\/get (checkIn|checkOut) (\d{4}-\d{2}-\d{2})/,
  async (msg, match) => {
    const chatId = msg.chat.id;
    const action = match[1]; // Extract 'checkIn' or 'checkOut'
    const date = match[2]; // Extract the date (YYYY-MM-DD)

    const attendancePath = path.join(dataDir, `${chatId}_attendance.json`);
    if (!fs.existsSync(attendancePath)) {
      return bot.sendMessage(chatId, "No attendance data found.");
    }

    const attendance = JSON.parse(fs.readFileSync(attendancePath, "utf8"));

    // Check if the attendance data for the specified date exists
    if (!attendance[date]) {
      return bot.sendMessage(chatId, `No attendance data found for ${date}.`);
    }

    // Retrieve the corresponding fileId based on the action
    const fileId =
      action === "checkIn"
        ? attendance[date].checkInMessageId
        : attendance[date].checkOutMessageId;

    try {
      // Send the image directly using fileId
      await bot.sendPhoto(chatId, fileId, {
        caption: `Here is the photo for your ${action} on ${date}!`,
      });
    } catch (error) {
      console.error("Error retrieving the photo:", error);
      await bot.sendMessage(
        chatId,
        "Sorry, there was an error retrieving your photo. Please try again later.",
      );
    }
  },
);

// Initialize Express app
// const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get("/", (req, res) => {
  res.send("Attendance Bot is running!");
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Attendance Bot is running on port ${PORT}...`);
});

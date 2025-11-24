require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const moment = require("moment");
const schedule = require("node-schedule");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const express = require("express");

// Initialize storage (supports Vercel KV, Upstash Redis, or file system)
const isVercel = process.env.VERCEL === "1";
let storage;
let storageType = "filesystem"; // "kv", "upstash", or "filesystem"

// Try Upstash Redis first (free tier available)
if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  try {
    const { Redis } = require("@upstash/redis");
    storage = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    storageType = "upstash";
    console.log("Using Upstash Redis for storage");
  } catch (error) {
    console.warn("Upstash Redis not available:", error.message);
  }
}

// Try Vercel KV if Upstash not available
if (storageType === "filesystem") {
  try {
    const kvClient = require("@vercel/kv").kv;
    if (isVercel || process.env.KV_REST_API_URL) {
      storage = kvClient;
      storageType = "kv";
      console.log("Using Vercel KV for storage");
    }
  } catch (error) {
    console.warn("Vercel KV not available:", error.message);
  }
}

// Data directory for local development (fallback)
const dataDir = path.join(__dirname, "data");
if (storageType === "filesystem" && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Unified Storage Helper Functions
async function getPreferences() {
  if (storageType === "upstash") {
    const data = await storage.get("preferences");
    return data || {};
  } else if (storageType === "kv") {
    const data = await storage.get("preferences");
    return data || {};
  } else {
    const preferencesPath = path.join(dataDir, "preferences.json");
    if (fs.existsSync(preferencesPath)) {
      return JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
    }
    return {};
  }
}

async function savePreferences(preferences) {
  if (storageType === "upstash") {
    await storage.set("preferences", preferences);
  } else if (storageType === "kv") {
    await storage.set("preferences", preferences);
  } else {
    const preferencesPath = path.join(dataDir, "preferences.json");
    fs.writeFileSync(preferencesPath, JSON.stringify(preferences, null, 2));
  }
}

async function getUserStates() {
  if (storageType === "upstash") {
    const data = await storage.get("user_states");
    return data || {};
  } else if (storageType === "kv") {
    const data = await storage.get("user_states");
    return data || {};
  } else {
    const userStatesPath = path.join(dataDir, "user_states.json");
    if (fs.existsSync(userStatesPath)) {
      return JSON.parse(fs.readFileSync(userStatesPath, "utf8"));
    }
    return {};
  }
}

async function saveUserStates(userStates) {
  if (storageType === "upstash") {
    await storage.set("user_states", userStates);
  } else if (storageType === "kv") {
    await storage.set("user_states", userStates);
  } else {
    const userStatesPath = path.join(dataDir, "user_states.json");
    fs.writeFileSync(userStatesPath, JSON.stringify(userStates, null, 2));
  }
}

async function getAttendance(chatId) {
  if (storageType === "upstash") {
    const data = await storage.get(`attendance:${chatId}`);
    return data || {};
  } else if (storageType === "kv") {
    const data = await storage.get(`attendance:${chatId}`);
    return data || {};
  } else {
    const attendancePath = path.join(dataDir, `${chatId}_attendance.json`);
    if (fs.existsSync(attendancePath)) {
      return JSON.parse(fs.readFileSync(attendancePath, "utf8"));
    }
    return {};
  }
}

async function saveAttendance(chatId, attendance) {
  if (storageType === "upstash") {
    await storage.set(`attendance:${chatId}`, attendance);
  } else if (storageType === "kv") {
    await storage.set(`attendance:${chatId}`, attendance);
  } else {
    const attendancePath = path.join(dataDir, `${chatId}_attendance.json`);
    fs.writeFileSync(attendancePath, JSON.stringify(attendance, null, 2));
  }
}

// Initialize bot with token and proper error handling
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: !isVercel
    ? {
        autoStart: true,
        params: {
          timeout: 10,
        },
      }
    : false,
});

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

// Store user preferences (will be loaded async)
let userPreferences = {};
let preferencesLoaded = false;

// Ensure preferences are loaded
async function ensurePreferencesLoaded() {
  if (!preferencesLoaded) {
    userPreferences = await getPreferences();
    preferencesLoaded = true;
  }
  return userPreferences;
}

// Get command keyboard
function getCommandKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ["✅ Check In", "🚪 Check Out"],
        ["📊 Monthly Report"],
        ["🔔 Enable Alerts", "🔕 Disable Alerts"],
        ["⏰ Test Alert"],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      persistent: true,
    },
  };
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
bot.on("callback_query", async (query) => {
  try {
    const chatId = query.message.chat.id;
    console.log(`Received callback query: ${query.data} from chat ${chatId}`);

    // Handle the callback query first to provide immediate feedback
    await bot.answerCallbackQuery(query.id);

    const timestamp = moment();
    const date = timestamp.format("YYYY-MM-DD");
    const time = timestamp.format("HH:mm:ss");

    switch (query.data) {
      case "check_in":
        let checkInAttendance = await getAttendance(chatId);

        if (!checkInAttendance[date]) {
          checkInAttendance[date] = {};
        }

        checkInAttendance[date].checkIn = time;
        if (checkInAttendance[date].pendingMessageId) {
          checkInAttendance[date].checkInMessageId =
            checkInAttendance[date].pendingMessageId;
          delete checkInAttendance[date].pendingMessageId;
        }
        await saveAttendance(chatId, checkInAttendance);

        await bot.sendMessage(
          chatId,
          `✅ Check-in recorded for ${date} at ${time}!`,
          getCommandKeyboard(),
        );
        break;

      case "check_out":
        let checkOutAttendance = await getAttendance(chatId);

        if (!checkOutAttendance[date]) {
          checkOutAttendance[date] = {};
        }

        checkOutAttendance[date].checkOut = time;
        if (checkOutAttendance[date].pendingMessageId) {
          checkOutAttendance[date].checkOutMessageId =
            checkOutAttendance[date].pendingMessageId;
          delete checkOutAttendance[date].pendingMessageId;
        }
        await saveAttendance(chatId, checkOutAttendance);

        await bot.sendMessage(
          chatId,
          `🚪 Check-out recorded for ${date} at ${time}!`,
          getCommandKeyboard(),
        );
        break;

      case "report":
        const reportAttendance = await getAttendance(chatId);

        if (Object.keys(reportAttendance).length === 0) {
          await bot.sendMessage(chatId, "No attendance records found!");
          break;
        }
        const currentMonth = moment().format("YYYY-MM");

        let report = `📊 Attendance Report for ${currentMonth}\n\n`;
        const records = [];

        Object.keys(reportAttendance)
          .filter((date) => date.startsWith(currentMonth))
          .sort()
          .forEach((date) => {
            const record = reportAttendance[date];
            report += `${date}:\n`;
            report += record.checkIn
              ? `  Check-in: ${record.checkIn}\n`
              : "  Check-in: Missing\n";
            report += record.checkOut
              ? `  Check-out: ${record.checkOut}\n`
              : "  Check-out: Missing\n";
            if (record.checkInMessageId) {
              report += `  Check-in Image: https://t.me/${chatId}/${record.checkInMessageId}\n`;
            }
            if (record.checkOutMessageId) {
              report += `  Check-out Image: https://t.me/${chatId}/${record.checkOutMessageId}\n`;
            }
            report += "\n";

            records.push({
              Date: date,
              "Check-in": record.checkIn || "Missing",
              "Check-out": record.checkOut || "Missing",
              "Check-in Image": record.checkInMessageId
                ? `https://t.me/${chatId}/${record.checkInMessageId}`
                : "N/A",
              "Check-out Image": record.checkOutMessageId
                ? `https://t.me/${chatId}/${record.checkOutMessageId}`
                : "N/A",
            });
          });

        await bot.sendMessage(chatId, report);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(records);
        XLSX.utils.book_append_sheet(wb, ws, "Attendance");

        const excelPath =
          storageType !== "filesystem"
            ? path.join("/tmp", `${chatId}_attendance.xlsx`)
            : path.join(dataDir, `${chatId}_attendance.xlsx`);
        XLSX.writeFile(wb, excelPath);

        await bot.sendDocument(chatId, excelPath, {
          caption: `📊 Excel Report for ${currentMonth}`,
        });

        if (fs.existsSync(excelPath)) {
          fs.unlinkSync(excelPath);
        }
        break;

      case "alerts_on":
        await ensurePreferencesLoaded();
        userPreferences[chatId] = { alertsEnabled: true };
        await savePreferences(userPreferences);
        await bot.sendMessage(
          chatId,
          "Alerts enabled! I'll remind you about check-in (8:30 AM) and check-out (5:30 PM).",
          getCommandKeyboard(),
        );
        break;

      case "alerts_off":
        await ensurePreferencesLoaded();
        userPreferences[chatId] = { alertsEnabled: false };
        await savePreferences(userPreferences);
        await bot.sendMessage(chatId, "Alerts disabled!", getCommandKeyboard());
        break;

      case "test_alert":
        await ensurePreferencesLoaded();
        if (userPreferences[chatId]?.alertsEnabled) {
          const now = moment();
          const alertTime = now.add(2, "minutes").toDate();
          const alertTimestamp = alertTime.getTime();

          if (isVercel) {
            // Store test alert in storage for cron to pick up
            if (storageType !== "filesystem") {
              const testAlerts = (await storage.get("test_alerts")) || {};
              testAlerts[chatId] = alertTimestamp;
              await storage.set("test_alerts", testAlerts);
            }

            await bot.sendMessage(
              chatId,
              "⏰ Test alert scheduled for 2 minutes from now.",
              getCommandKeyboard(),
            );
          } else {
            await bot.sendMessage(
              chatId,
              "⏰ Test alert scheduled for 2 minutes from now.",
              getCommandKeyboard(),
            );

            schedule.scheduleJob(alertTime, () => {
              bot.sendMessage(
                chatId,
                "🔔 This is your scheduled test alert!",
                getCommandKeyboard(),
              );
            });
          }
        } else {
          await bot.sendMessage(
            chatId,
            "⚠️ Alerts are currently disabled. Use /alerts_on to enable reminders.",
            getCommandKeyboard(),
          );
        }
        break;

      default:
        console.log(`Unknown callback query data: ${query.data}`);
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
  await ensurePreferencesLoaded();
  userPreferences[chatId] = { alertsEnabled: true };
  await savePreferences(userPreferences);
  await bot.sendMessage(
    chatId,
    "Alerts enabled! I'll remind you about check-in (8:30 AM) and check-out (5:30 PM).",
    getCommandKeyboard(),
  );
});

// Handle text message for enabling alerts
bot.onText(/🔔 Enable Alerts/, async (msg) => {
  const chatId = msg.chat.id;
  await ensurePreferencesLoaded();
  userPreferences[chatId] = { alertsEnabled: true };
  await savePreferences(userPreferences);
  await bot.sendMessage(
    chatId,
    "Alerts enabled! I'll remind you about check-in (8:30 AM) and check-out (5:30 PM).",
    getCommandKeyboard(),
  );
});

// Handle text message for disabling alerts
bot.onText(/🔕 Disable Alerts/, async (msg) => {
  const chatId = msg.chat.id;
  await ensurePreferencesLoaded();
  userPreferences[chatId] = { alertsEnabled: false };
  await savePreferences(userPreferences);
  await bot.sendMessage(chatId, "Alerts disabled!", getCommandKeyboard());
});

// Store user states (will be loaded async)
let userStates = {};
let userStatesLoaded = false;

// Ensure user states are loaded
async function ensureUserStatesLoaded() {
  if (!userStatesLoaded) {
    userStates = await getUserStates();
    userStatesLoaded = true;
  }
  return userStates;
}

// Reset user state
async function resetUserState(chatId) {
  await ensureUserStatesLoaded();
  userStates[chatId] = {
    action: null,
    timestamp: null,
  };
  await saveUserStates(userStates);
}

// Handle monthly report button
bot.onText(/📊 Monthly Report/, async (msg) => {
  const chatId = msg.chat.id;
  console.log("Monthly report button clicked", msg);

  const reportAttendance = await getAttendance(chatId);

  if (Object.keys(reportAttendance).length === 0) {
    await bot.sendMessage(chatId, "No attendance records found!");
    return;
  }
  const currentMonth = moment().format("YYYY-MM");

  let report = `📊 Attendance Report for ${currentMonth}\n\n`;
  const records = [];

  Object.keys(reportAttendance)
    .filter((date) => date.startsWith(currentMonth))
    .sort()
    .forEach((date) => {
      const record = reportAttendance[date];
      report += `${date}:\n`;
      report += record.checkIn
        ? `  Check-in: ${record.checkIn}\n`
        : "  Check-in: Missing\n";
      report += record.checkOut
        ? `  Check-out: ${record.checkOut}\n`
        : "  Check-out: Missing\n";
      if (record.checkInMessageId) {
        report += `  Check-in Image: https://t.me/${chatId}/${record.checkInMessageId}\n`;
      }
      if (record.checkOutMessageId) {
        report += `  Check-out Image: https://t.me/${chatId}/${record.checkOutMessageId}\n`;
      }
      report += "\n";

      records.push({
        Date: date,
        "Check-in": record.checkIn || "Missing",
        "Check-out": record.checkOut || "Missing",
        "Check-in Image": record.checkInMessageId
          ? `https://t.me/${chatId}/${record.checkInMessageId}`
          : "N/A",
        "Check-out Image": record.checkOutMessageId
          ? `https://t.me/${chatId}/${record.checkOutMessageId}`
          : "N/A",
      });
    });

  await bot.sendMessage(chatId, report);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(records);
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");

  const excelPath =
    storageType !== "filesystem"
      ? path.join("/tmp", `${chatId}_attendance.xlsx`)
      : path.join(dataDir, `${chatId}_attendance.xlsx`);
  XLSX.writeFile(wb, excelPath);

  await bot.sendDocument(chatId, excelPath, {
    caption: `📊 Excel Report for ${currentMonth}`,
  });

  if (fs.existsSync(excelPath)) {
    fs.unlinkSync(excelPath);
  }
});

// Handle test alert button
bot.onText(/⏰ Test Alert/, async (msg) => {
  const chatId = msg.chat.id;
  await ensurePreferencesLoaded();
  if (userPreferences[chatId]?.alertsEnabled) {
    const now = moment();
    const alertTime = now.add(2, "minutes").toDate();
    const alertTimestamp = alertTime.getTime();

    if (isVercel) {
      if (storageType !== "filesystem") {
        // Store test alert in storage for cron to pick up
        const testAlerts = (await storage.get("test_alerts")) || {};
        testAlerts[chatId] = alertTimestamp;
        await storage.set("test_alerts", testAlerts);

        await bot.sendMessage(
          chatId,
          "⏰ Test alert scheduled for 2 minutes from now.",
          getCommandKeyboard(),
        );
      } else {
        await bot.sendMessage(
          chatId,
          "⚠️ Storage not available. Please configure Upstash Redis or Vercel KV.",
          getCommandKeyboard(),
        );
      }
    } else {
      await bot.sendMessage(
        chatId,
        "⏰ Test alert scheduled for 2 minutes from now.",
        getCommandKeyboard(),
      );

      schedule.scheduleJob(alertTime, () => {
        bot.sendMessage(
          chatId,
          "🔔 This is your scheduled test alert!",
          getCommandKeyboard(),
        );
      });
    }
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
  const date = timestamp.format("YYYY-MM-DD");
  const time = timestamp.format("HH:mm:ss");

  // Set user state for check-in
  await ensureUserStatesLoaded();
  userStates[chatId] = {
    action: "check_in",
    timestamp: timestamp.valueOf(),
  };
  await saveUserStates(userStates);

  let checkInAttendance = await getAttendance(chatId);

  if (!checkInAttendance[date]) {
    checkInAttendance[date] = {};
  }

  checkInAttendance[date].checkIn = time;
  await saveAttendance(chatId, checkInAttendance);

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
  const date = timestamp.format("YYYY-MM-DD");
  const time = timestamp.format("HH:mm:ss");

  // Set user state for check-out
  await ensureUserStatesLoaded();
  userStates[chatId] = {
    action: "check_out",
    timestamp: timestamp.valueOf(),
  };
  await saveUserStates(userStates);

  let checkOutAttendance = await getAttendance(chatId);

  if (!checkOutAttendance[date]) {
    checkOutAttendance[date] = {};
  }

  checkOutAttendance[date].checkOut = time;
  await saveAttendance(chatId, checkOutAttendance);

  await bot.sendMessage(
    chatId,
    `🚪 Check-out recorded for ${date} at ${time}!\n\nPlease send a photo of your attendance record.`,
    getCommandKeyboard(),
  );
});

// Reset user state for other commands
bot.onText(
  /📊 Monthly Report|🔔 Enable Alerts|🔕 Disable Alerts|⏰ Test Alert/,
  async (msg) => {
    const chatId = msg.chat.id;
    await resetUserState(chatId);
  },
);

// Handle photo messages
bot.on("photo", async (msg) => {
  console.log("Photo received:", msg.chat.id);

  const chatId = msg.chat.id;
  const timestamp = moment();
  const date = timestamp.format("YYYY-MM-DD");

  let attendance = await getAttendance(chatId);

  if (!attendance[date]) {
    attendance[date] = {};
  }

  await ensureUserStatesLoaded();
  const userState = userStates[chatId] || { action: null };

  if (userState.action === "check_in") {
    attendance[date].checkInMessageId = msg.message_id;
    await bot.sendMessage(
      chatId,
      "📸 Photo received and attached to your check-in record!",
      getCommandKeyboard(),
    );
    await resetUserState(chatId);
  } else if (userState.action === "check_out") {
    attendance[date].checkOutMessageId = msg.message_id;
    await bot.sendMessage(
      chatId,
      "📸 Photo received and attached to your check-out record!",
      getCommandKeyboard(),
    );
    await resetUserState(chatId);
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

    attendance[date].pendingMessageId = msg.message_id;
    await bot.sendMessage(
      chatId,
      "📸 Photo received! Please specify if this is for Check In or Check Out:",
      options,
    );
  }

  await saveAttendance(chatId, attendance);
  await resetUserState(chatId); // Reset state after handling photo to prevent duplicate messages
});

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get("/", (req, res) => {
  res.send("Attendance Bot is running!");
});

// Webhook endpoint for Vercel
if (isVercel) {
  app.use(express.json());
  app.post("/api/webhook", (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  // Cron endpoint for scheduled alerts
  // Can be called by Vercel Cron Jobs (Pro) or external cron services (Free tier)
  app.get("/api/cron/alerts", async (req, res) => {
    try {
      // Optional: Add authentication token check for security
      const authToken = process.env.CRON_SECRET;
      if (authToken && req.query.secret !== authToken) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const preferences = await getPreferences();
      const now = moment();
      const currentHour = now.hour();
      const currentMinute = now.minute();
      const currentTime = now.valueOf();

      // Check for pending test alerts
      if (storageType !== "filesystem") {
        const testAlerts = (await storage.get("test_alerts")) || {};
        const updatedTestAlerts = { ...testAlerts };

        for (const [chatId, alertTimestamp] of Object.entries(testAlerts)) {
          if (currentTime >= alertTimestamp) {
            try {
              await bot.sendMessage(
                chatId,
                "🔔 This is your scheduled test alert!",
                getCommandKeyboard(),
              );
              delete updatedTestAlerts[chatId];
            } catch (error) {
              console.error(`Error sending test alert to ${chatId}:`, error);
            }
          }
        }

        if (
          Object.keys(updatedTestAlerts).length !==
          Object.keys(testAlerts).length
        ) {
          await storage.set("test_alerts", updatedTestAlerts);
        }
      }

      // Check all users with alerts enabled
      for (const [chatId, prefs] of Object.entries(preferences)) {
        if (!prefs.alertsEnabled) continue;

        const checkInTime = prefs.alertTimes?.checkIn || {
          hour: 8,
          minute: 25,
        };
        const checkOutTime = prefs.alertTimes?.checkOut || {
          hour: 17,
          minute: 30,
        };

        // Check if it's time for check-in alert (within 5 minute window)
        if (
          currentHour === checkInTime.hour &&
          currentMinute >= checkInTime.minute &&
          currentMinute < checkInTime.minute + 5
        ) {
          try {
            await bot.sendMessage(
              chatId,
              "🔔 Time to check in!",
              getCommandKeyboard(),
            );
          } catch (error) {
            console.error(`Error sending check-in alert to ${chatId}:`, error);
          }
        }

        // Check if it's time for check-out alert (within 5 minute window)
        if (
          currentHour === checkOutTime.hour &&
          currentMinute >= checkOutTime.minute &&
          currentMinute < checkOutTime.minute + 5
        ) {
          try {
            await bot.sendMessage(
              chatId,
              "🔔 Time to check out!",
              getCommandKeyboard(),
            );
          } catch (error) {
            console.error(`Error sending check-out alert to ${chatId}:`, error);
          }
        }
      }

      res.status(200).json({ success: true, timestamp: now.toISOString() });
    } catch (error) {
      console.error("Error in cron job:", error);
      res.status(500).json({ error: error.message });
    }
  });
}

// Start Express server (only if not on Vercel)
if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`Attendance Bot is running on port ${PORT}...`);
  });
}

// Export app for Vercel
module.exports = app;

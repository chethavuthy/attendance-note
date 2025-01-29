require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment');
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Initialize bot with token
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Store user preferences
let userPreferences = {};

// Load existing preferences
const preferencesPath = path.join(dataDir, 'preferences.json');
if (fs.existsSync(preferencesPath)) {
    userPreferences = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
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
                ['✅ Check In', '🚪 Check Out'],
                ['📊 Monthly Report'],
                ['🔔 Enable Alerts', '🔕 Disable Alerts'],
                ['⏰ Test Alert']
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
            persistent: true
        }
    };
}

// Handle start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = 'Welcome to the Attendance Bot! 📝\n\nUse the buttons below to manage your attendance:';
    
    try {
        await bot.sendMessage(chatId, welcomeMessage, getCommandKeyboard());
    } catch (error) {
        console.error('Error sending start message:', error);
        await bot.sendMessage(chatId, 'An error occurred. Please try again.');
    }
});

// Handle callback queries from inline keyboard
bot.on('callback_query', async (query) => {
    try {
        const chatId = query.message.chat.id;
        console.log(`Received callback query: ${query.data} from chat ${chatId}`);
        
        // Handle the callback query first to provide immediate feedback
        await bot.answerCallbackQuery(query.id);
        
        const timestamp = moment();
        const date = timestamp.format('YYYY-MM-DD');
        const time = timestamp.format('HH:mm:ss');
        
        switch (query.data) {
            case 'check_in':
                const checkInPath = path.join(dataDir, `${chatId}_attendance.json`);
                let checkInAttendance = {};
                
                if (fs.existsSync(checkInPath)) {
                    checkInAttendance = JSON.parse(fs.readFileSync(checkInPath, 'utf8'));
                }
                
                if (!checkInAttendance[date]) {
                    checkInAttendance[date] = {};
                }
                
                checkInAttendance[date].checkIn = time;
                if (checkInAttendance[date].pendingMessageId) {
                    checkInAttendance[date].checkInMessageId = checkInAttendance[date].pendingMessageId;
                    delete checkInAttendance[date].pendingMessageId;
                }
                fs.writeFileSync(checkInPath, JSON.stringify(checkInAttendance, null, 2));
                
                await bot.sendMessage(chatId, `✅ Check-in recorded for ${date} at ${time}!`, getCommandKeyboard());
                break;
                
            case 'check_out':
                const checkOutPath = path.join(dataDir, `${chatId}_attendance.json`);
                let checkOutAttendance = {};
                
                if (fs.existsSync(checkOutPath)) {
                    checkOutAttendance = JSON.parse(fs.readFileSync(checkOutPath, 'utf8'));
                }
                
                if (!checkOutAttendance[date]) {
                    checkOutAttendance[date] = {};
                }
                
                checkOutAttendance[date].checkOut = time;
                if (checkOutAttendance[date].pendingMessageId) {
                    checkOutAttendance[date].checkOutMessageId = checkOutAttendance[date].pendingMessageId;
                    delete checkOutAttendance[date].pendingMessageId;
                }
                fs.writeFileSync(checkOutPath, JSON.stringify(checkOutAttendance, null, 2));
                
                await bot.sendMessage(chatId, `🚪 Check-out recorded for ${date} at ${time}!`, getCommandKeyboard());
                break;
                
            case 'report':
                const reportPath = path.join(dataDir, `${chatId}_attendance.json`);
                
                if (!fs.existsSync(reportPath)) {
                    await bot.sendMessage(chatId, 'No attendance records found!');
                    break;
                }
                
                const reportAttendance = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                const currentMonth = moment().format('YYYY-MM');
                
                let report = `📊 Attendance Report for ${currentMonth}\n\n`;
                const records = [];
                
                Object.keys(reportAttendance)
                    .filter(date => date.startsWith(currentMonth))
                    .sort()
                    .forEach(date => {
                        const record = reportAttendance[date];
                        report += `${date}:\n`;
                        report += record.checkIn ? `  Check-in: ${record.checkIn}\n` : '  Check-in: Missing\n';
                        report += record.checkOut ? `  Check-out: ${record.checkOut}\n` : '  Check-out: Missing\n';
                        if (record.checkInMessageId) {
                            report += `  Check-in Image: https://t.me/${chatId}/${record.checkInMessageId}\n`;
                        }
                        if (record.checkOutMessageId) {
                            report += `  Check-out Image: https://t.me/${chatId}/${record.checkOutMessageId}\n`;
                        }
                        report += '\n';
                        
                        records.push({
                            Date: date,
                            'Check-in': record.checkIn || 'Missing',
                            'Check-out': record.checkOut || 'Missing',
                            'Check-in Image': record.checkInMessageId ? `https://t.me/${chatId}/${record.checkInMessageId}` : 'N/A',
                            'Check-out Image': record.checkOutMessageId ? `https://t.me/${chatId}/${record.checkOutMessageId}` : 'N/A'
                        });
                    });
                
                await bot.sendMessage(chatId, report);
                
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(records);
                XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
                
                const excelPath = path.join(dataDir, `${chatId}_attendance.xlsx`);
                XLSX.writeFile(wb, excelPath);
                
                await bot.sendDocument(chatId, excelPath, { caption: `📊 Excel Report for ${currentMonth}` });
                
                fs.unlinkSync(excelPath);
                break;
                
            case 'alerts_on':
                userPreferences[chatId] = { alertsEnabled: true };
                savePreferences();
                await bot.sendMessage(chatId, 'Alerts enabled! I\'ll remind you about check-in (8:30 AM) and check-out (5:30 PM).', getCommandKeyboard());
                break;
                
            case 'alerts_off':
                userPreferences[chatId] = { alertsEnabled: false };
                savePreferences();
                await bot.sendMessage(chatId, 'Alerts disabled!', getCommandKeyboard());
                break;
                
            case 'test_alert':
                if (userPreferences[chatId]?.alertsEnabled) {
                    const now = moment();
                    const alertTime = now.add(2, 'minutes').toDate();
                    
                    await bot.sendMessage(chatId, '⏰ Test alert scheduled for 2 minutes from now.', getCommandKeyboard());
                    
                    schedule.scheduleJob(alertTime, () => {
                        bot.sendMessage(chatId, '🔔 This is your scheduled test alert!', getCommandKeyboard());
                    });
                } else {
                    await bot.sendMessage(chatId, '⚠️ Alerts are currently disabled. Use /alerts_on to enable reminders.', getCommandKeyboard());
                }
                break;
                
            default:
                console.log(`Unknown callback query data: ${query.data}`);
        }
    } catch (error) {
        console.error('Error handling callback query:', error);
        try {
            await bot.answerCallbackQuery(query.id, { text: 'An error occurred. Please try again.' });
        } catch (e) {
            console.error('Error sending error message:', e);
        }
    }
});


// Handle alerts on command
bot.onText(/\/alerts_on/, async (msg) => {
    const chatId = msg.chat.id;
    userPreferences[chatId] = { alertsEnabled: true };
    savePreferences();
    await bot.sendMessage(chatId, 'Alerts enabled! I\'ll remind you about check-in (8:30 AM) and check-out (5:30 PM).', getCommandKeyboard());
});

// Handle text message for enabling alerts
bot.onText(/🔔 Enable Alerts/, async (msg) => {
    const chatId = msg.chat.id;
    userPreferences[chatId] = { alertsEnabled: true };
    savePreferences();
    await bot.sendMessage(chatId, 'Alerts enabled! I\'ll remind you about check-in (8:30 AM) and check-out (5:30 PM).', getCommandKeyboard());
});

// Handle text message for disabling alerts
bot.onText(/🔕 Disable Alerts/, async (msg) => {
    const chatId = msg.chat.id;
    userPreferences[chatId] = { alertsEnabled: false };
    savePreferences();
    await bot.sendMessage(chatId, 'Alerts disabled!', getCommandKeyboard());
});

// Store user states
let userStates = {};

// Load existing user states
const userStatesPath = path.join(dataDir, 'user_states.json');
if (fs.existsSync(userStatesPath)) {
    userStates = JSON.parse(fs.readFileSync(userStatesPath, 'utf8'));
}

// Save user states
function saveUserStates() {
    fs.writeFileSync(userStatesPath, JSON.stringify(userStates, null, 2));
}

// Reset user state
function resetUserState(chatId) {
    userStates[chatId] = {
        action: null,
        timestamp: null
    };
    saveUserStates();
}

// Handle monthly report button
bot.onText(/📊 Monthly Report/, async (msg) => {
    const chatId = msg.chat.id;
    console.log('Monthly report button clicked', msg);
    
    const reportPath = path.join(dataDir, `${chatId}_attendance.json`);
    
    if (!fs.existsSync(reportPath)) {
        await bot.sendMessage(chatId, 'No attendance records found!');
        return;
    }
    
    const reportAttendance = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const currentMonth = moment().format('YYYY-MM');
    
    let report = `📊 Attendance Report for ${currentMonth}\n\n`;
    const records = [];
    
    Object.keys(reportAttendance)
        .filter(date => date.startsWith(currentMonth))
        .sort()
        .forEach(date => {
            const record = reportAttendance[date];
            report += `${date}:\n`;
            report += record.checkIn ? `  Check-in: ${record.checkIn}\n` : '  Check-in: Missing\n';
            report += record.checkOut ? `  Check-out: ${record.checkOut}\n` : '  Check-out: Missing\n';
            if (record.checkInMessageId) {
                report += `  Check-in Image: https://t.me/${chatId}/${record.checkInMessageId}\n`;
            }
            if (record.checkOutMessageId) {
                report += `  Check-out Image: https://t.me/${chatId}/${record.checkOutMessageId}\n`;
            }
            report += '\n';
            
            records.push({
                Date: date,
                'Check-in': record.checkIn || 'Missing',
                'Check-out': record.checkOut || 'Missing',
                'Check-in Image': record.checkInMessageId ? `https://t.me/${chatId}/${record.checkInMessageId}` : 'N/A',
                'Check-out Image': record.checkOutMessageId ? `https://t.me/${chatId}/${record.checkOutMessageId}` : 'N/A'
            });
        });
    
    await bot.sendMessage(chatId, report);
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(records);
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    
    const excelPath = path.join(dataDir, `${chatId}_attendance.xlsx`);
    XLSX.writeFile(wb, excelPath);
    
    await bot.sendDocument(chatId, excelPath, { caption: `📊 Excel Report for ${currentMonth}` });
    
    fs.unlinkSync(excelPath);
});

// Handle test alert button
bot.onText(/⏰ Test Alert/, async (msg) => {
    const chatId = msg.chat.id;
    if (userPreferences[chatId]?.alertsEnabled) {
        const now = moment();
        const alertTime = now.add(2, 'minutes').toDate();
        
        await bot.sendMessage(chatId, '⏰ Test alert scheduled for 2 minutes from now.', getCommandKeyboard());
        
        schedule.scheduleJob(alertTime, () => {
            bot.sendMessage(chatId, '🔔 This is your scheduled test alert!', getCommandKeyboard());
        });
    } else {
        await bot.sendMessage(chatId, '⚠️ Alerts are currently disabled. Enable alerts first to use this feature.', getCommandKeyboard());
    }
});

// Handle text message for check-in
bot.onText(/✅ Check In/, async (msg) => {
    const chatId = msg.chat.id;
    const timestamp = moment();
    const date = timestamp.format('YYYY-MM-DD');
    const time = timestamp.format('HH:mm:ss');
    
    // Set user state for check-in
    userStates[chatId] = {
        action: 'check_in',
        timestamp: timestamp.valueOf()
    };
    saveUserStates();
    
    const checkInPath = path.join(dataDir, `${chatId}_attendance.json`);
    let checkInAttendance = {};
    
    if (fs.existsSync(checkInPath)) {
        checkInAttendance = JSON.parse(fs.readFileSync(checkInPath, 'utf8'));
    }
    
    if (!checkInAttendance[date]) {
        checkInAttendance[date] = {};
    }
    
    checkInAttendance[date].checkIn = time;
    fs.writeFileSync(checkInPath, JSON.stringify(checkInAttendance, null, 2));
    hasCheckedIn = true;
    hasCheckedOut = false;
    
    await bot.sendMessage(chatId, `✅ Check-in recorded for ${date} at ${time}!\n\nPlease send a photo of your attendance record.`, getCommandKeyboard());
});

// Handle text message for check-out
bot.onText(/🚪 Check Out/, async (msg) => {
    const chatId = msg.chat.id;
    const timestamp = moment();
    const date = timestamp.format('YYYY-MM-DD');
    const time = timestamp.format('HH:mm:ss');
    
    // Set user state for check-out
    userStates[chatId] = {
        action: 'check_out',
        timestamp: timestamp.valueOf()
    };
    saveUserStates();
    
    const checkOutPath = path.join(dataDir, `${chatId}_attendance.json`);
    let checkOutAttendance = {};
    
    if (fs.existsSync(checkOutPath)) {
        checkOutAttendance = JSON.parse(fs.readFileSync(checkOutPath, 'utf8'));
    }
    
    if (!checkOutAttendance[date]) {
        checkOutAttendance[date] = {};
    }
    
    checkOutAttendance[date].checkOut = time;
    fs.writeFileSync(checkOutPath, JSON.stringify(checkOutAttendance, null, 2));
    hasCheckedOut = true;
    hasCheckedIn = false;
    
    await bot.sendMessage(chatId, `🚪 Check-out recorded for ${date} at ${time}!\n\nPlease send a photo of your attendance record.`, getCommandKeyboard());
});

// Reset user state for other commands
bot.onText(/📊 Monthly Report|🔔 Enable Alerts|🔕 Disable Alerts|⏰ Test Alert/, (msg) => {
    const chatId = msg.chat.id;
    resetUserState(chatId);
});

// Handle photo messages
bot.on('photo', async (msg) => {
    console.log('Photo received:', msg.chat.id);
    
    const chatId = msg.chat.id;
    const timestamp = moment();
    const date = timestamp.format('YYYY-MM-DD');
    
    const attendancePath = path.join(dataDir, `${chatId}_attendance.json`);
    let attendance = {};
    
    if (fs.existsSync(attendancePath)) {
        attendance = JSON.parse(fs.readFileSync(attendancePath, 'utf8'));
    }
    
    if (!attendance[date]) {
        attendance[date] = {};
    }
    
    const userState = userStates[chatId] || { action: null };
    
    if (userState.action === 'check_in') {
        attendance[date].checkInMessageId = msg.message_id;
        await bot.sendMessage(chatId, '📸 Photo received and attached to your check-in record!', getCommandKeyboard());
        resetUserState(chatId);
    } else if (userState.action === 'check_out') {
        attendance[date].checkOutMessageId = msg.message_id;
        await bot.sendMessage(chatId, '📸 Photo received and attached to your check-out record!', getCommandKeyboard());
        resetUserState(chatId);
    } else {
        // If no check-in/out record exists, show the options
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Check In', callback_data: 'check_in' },
                        { text: '🚪 Check Out', callback_data: 'check_out' }
                    ]
                ]
            }
        };
        
        attendance[date].pendingMessageId = msg.message_id;
        await bot.sendMessage(chatId, '📸 Photo received! Please specify if this is for Check In or Check Out:', options);
    }
    
    fs.writeFileSync(attendancePath, JSON.stringify(attendance, null, 2));
    resetUserState(chatId); // Reset state after handling photo to prevent duplicate messages
});

console.log('Attendance Bot is running...');
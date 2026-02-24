const { Client, GatewayIntentBits } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const cron = require('node-cron');
require('dotenv').config();

const prisma = new PrismaClient();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const ADMIN_ID = "1465374336214106237";
const PREFIX = "!";

client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} đã sẵn sàng!`);

    // --- TỰ ĐỘNG HÓA BÓNG ĐÁ ---
    const botCado = require('./share/bot_cado.js');
    
    // Cứ mỗi 5 phút quét API một lần để kiểm tra trận đấu
    cron.schedule('*/5 * * * *', () => {
        console.log("⚽ Đang quét dữ liệu bóng đá...");
        botCado.autoUpdate(client, prisma); 
    });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        // Module Tài Xỉu
        if (command === 'tx') {
            await require('./share/bot_taixiu.js')(message, args, prisma);
        } 
        // Module Ví & Admin (nạp, ví, chuyển, xemvi)
        else if (['vi', 'chuyen', 'nap', 'xemvi'].includes(command)) {
            await require('./share/bot_admin.js')(message, args, prisma, ADMIN_ID);
        } 
        // Module Bảng Xếp Hạng
        else if (command === 'bxh') {
            await require('./share/bot_bxh.js')(message, prisma);
        }
        // Module Cá Độ (Lệnh xem danh sách trận đấu đang có kèo)
        else if (command === 'bongda' || command === 'keo') {
            await require('./share/bot_cado.js').showAvailableBets(message, prisma);
        }

    } catch (err) {
        console.error("Lỗi điều hướng lệnh:", err);
    }
});

client.login(process.env.DISCORD_TOKEN);

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

    // GỌI BOT CADO (File nằm ở thư mục gốc theo ảnh của bạn)
    const botCado = require('./bot_cado.js'); 
    
    // Tự động quét API mỗi 5 phút
    cron.schedule('*/5 * * * *', () => {
        botCado.autoUpdate(client, prisma); 
    });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        // --- CÁC FILE Ở THƯ MỤC GỐC ---
        if (command === 'tx') {
            await require('./bot_taixiu.js')(message, args, prisma);
        } 
        else if (command === 'cado' || command === 'keo') {
            await require('./bot_cado.js').showMenu(message, prisma);
        }
        else if (['vi', 'chuyen', 'nap', 'xemvi'].includes(command)) {
            // File bot_admin.js cũng ở thư mục gốc
            await require('./bot_admin.js')(message, args, prisma, ADMIN_ID);
        }
        else if (command === 'bxh') {
            await require('./bot_bxh.js')(message, prisma);
        }
        
        // --- FILE Ở THƯ MỤC SHARE ---
        if (command === 'share') {
            await require('./share/share.js')(message, args, prisma);
        }

    } catch (err) {
        console.error("Lỗi hệ thống:", err);
    }
});

client.login(process.env.DISCORD_TOKEN);

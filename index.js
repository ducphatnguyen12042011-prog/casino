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

// 1. KHI BOT SẴN SÀNG
client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} đã sẵn sàng!`);

    // Chạy quét API bóng đá tự động mỗi 5 phút
    const botCado = require('./bot_cado.js'); 
    cron.schedule('*/5 * * * *', () => {
        console.log('⚽ Đang quét API bóng đá...');
        botCado.autoUpdate(client, prisma); 
    });
});

// 2. XỬ LÝ CÁC LỆNH CHAT (PREFIX !)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        if (command === 'tx') {
            await require('./bot_taixiu.js')(message, args, prisma);
        } 
        else if (command === 'cado' || command === 'keo') {
            await require('./bot_cado.js').showMenu(message, prisma);
        }
        else if (['vi', 'chuyen', 'nap', 'xemvi'].includes(command)) {
            await require('./bot_admin.js')(message, args, prisma, ADMIN_ID);
        }
        else if (command === 'bxh') {
            await require('./bot_bxh.js')(message, prisma);
        }
        else if (command === 'share') {
            await require('./share/share.js')(message, args, prisma);
        }
    } catch (err) {
        console.error("❌ Lỗi lệnh chat:", err);
    }
});

// 3. XỬ LÝ CÁC NÚT BẤM (BUTTON INTERACTIONS) - PHẦN BẠN ĐANG THIẾU
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    try {
        // Xử lý nút bấm của Bóng Đá (cado_...)
        if (interaction.customId.startsWith('cado_')) {
            const botCado = require('./bot_cado.js');
            await botCado.handleButton(interaction, prisma);
        }

        // Xử lý nút bấm của Tài Xỉu (bet_tai hoặc bet_xiu)
        if (interaction.customId.startsWith('bet_tai') || interaction.customId.startsWith('bet_xiu')) {
            const botTX = require('./bot_taixiu.js');
            // Đảm bảo trong bot_taixiu.js có export hàm handleButton
            if (typeof botTX.handleButton === 'function') {
                await botTX.handleButton(interaction, prisma);
            }
        }
    } catch (err) {
        console.error("❌ Lỗi xử lý nút bấm:", err);
        if (!interaction.replied) {
            await interaction.reply({ content: 'Có lỗi xảy ra khi xử lý lựa chọn của bạn!', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

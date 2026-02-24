const { Client, GatewayIntentBits, InteractionType } = require('discord.js');
const { PrismaClient } = require('@prisma/client');

// 1. Khởi tạo Prisma và Client Bot
const prisma = new PrismaClient();
global.prisma = prisma; 

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 2. Import các file bot (Đảm bảo các file này export object có hàm execute và handleInteraction)
const botTaiXiu = require('./bot_taixiu.js');
const botCado = require('./bot_cado.js');
// ... Tương tự cho các file khác

// 3. Xử lý Lệnh Chat (!tx)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!tx') {
        await botTaiXiu.execute(message);
    }
    
    if (message.content === '!cado') {
        await botCado.execute(message);
    }
});

// 4. Xử lý Nút bấm và Modal (Interaction)
client.on('interactionCreate', async (interaction) => {
    // Xử lý các tương tác liên quan đến Tài Xỉu
    if (interaction.customId?.includes('tx_')) {
        await botTaiXiu.handleInteraction(interaction);
    }

    // Xử lý các tương tác liên quan đến Cá Độ
    if (interaction.customId?.includes('cado_')) {
        await botCado.handleInteraction(interaction);
    }
});

client.once('ready', () => {
    console.log(`🚀 Bot đã online: ${client.user.tag}`);
});

// 5. Đăng nhập và Ngắt kết nối an toàn
client.login('TOKEN_BOT_CUA_BAN');

process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit();
});

const { Client, GatewayIntentBits, InteractionType } = require('discord.js');
const { PrismaClient } = require('@prisma/client');

// Khởi tạo Prisma toàn cục
const prisma = new PrismaClient();
global.prisma = prisma; 

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Bắt buộc để đọc được "!tx"
    ]
});

// Import các file bot
const bot_taixiu = require('./bot_taixiu.js');
// const bot_cado = require('./bot_cado.js'); // Khi nào bạn làm xong cado thì mở dòng này ra

client.on('ready', () => {
    console.log(`🚀 Bot đã online: ${client.user.tag}`);
});

// Lắng nghe lệnh chat
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!tx') {
        await bot_taixiu.execute(message);
    }
});

// Lắng nghe nút bấm và modal
client.on('interactionCreate', async (interaction) => {
    // Điều hướng các tương tác có ID bắt đầu bằng "tx_" về file bot_taixiu
    if (interaction.customId?.startsWith('tx_') || interaction.customId?.startsWith('modal_tx_')) {
        await bot_taixiu.handleInteraction(interaction);
    }
});

client.login('TOKEN_CUA_BAN');

process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit();
});

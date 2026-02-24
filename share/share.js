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

// Import các module từ thư mục gốc
const botCado = require('./bot_cado.js');
const botAdmin = require('./bot_admin.js');
const botTaixiu = require('./bot_taixiu.js');
const botLookup = require('./bot_lookup.js');
// Import từ thư mục share
const { getWalletEmbed } = require('./share/share.js');

client.once('ready', () => {
    console.log(`✅ Bot ${client.user.tag} đã sẵn sàng!`);
    
    // Tự động quét bóng đá mỗi 5 phút
    cron.schedule('*/5 * * * *', () => {
        botCado.autoUpdate(client, prisma);
    });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'vi') {
        const user = await prisma.user.findUnique({ where: { id: message.author.id } });
        const embed = getWalletEmbed(user, message.author); // Dùng hàm từ share/share.js
        message.reply({ embeds: [embed] });
    }

    if (command === 'tx') await botTaixiu(message, args, prisma);
    
    // Thêm các lệnh khác tương tự...
});

// PHẦN QUAN TRỌNG: Xử lý nút bấm cado và tài xỉu
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('cado_')) {
        await botCado.handleButton(interaction, prisma);
    }
    
    if (interaction.customId.startsWith('tx_')) {
        await botTaixiu.handleInteraction(interaction, prisma);
    }
});

client.login(process.env.DISCORD_TOKEN);

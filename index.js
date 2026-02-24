const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const cron = require('node-cron');
require('dotenv').config();

// Khởi tạo Database
const prisma = new PrismaClient();

// Khởi tạo Bot với đầy đủ Intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel] // Hỗ trợ nhận tin nhắn DM
});

const ADMIN_ID = "1465374336214106237";
const PREFIX = "!";

// 1. KHI BOT READY
client.once('ready', async () => {
    console.log(`✅ Đã đăng nhập thành công: ${client.user.tag}`);

    // Khởi động vòng lặp quét bóng đá (bot_cado.js ở thư mục gốc)
    const botCado = require('./bot_cado.js');
    cron.schedule('*/5 * * * *', () => {
        console.log('⚽ Đang quét dữ liệu trận đấu...');
        botCado.autoUpdate(client, prisma);
    });
});

// 2. XỬ LÝ LỆNH CHAT
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        if (command === 'vi') {
            // Sử dụng hàm getWalletEmbed từ folder share
            const { getWalletEmbed } = require('./share/share.js');
            const user = await prisma.user.findUnique({ where: { id: message.author.id } });
            const embed = await getWalletEmbed(user, message.author);
            return message.reply({ embeds: [embed] });
        }

        if (command === 'tx') {
            await require('./bot_taixiu.js')(message, args, prisma);
        } 
        else if (command === 'cado' || command === 'keo') {
            await require('./bot_cado.js').showMenu(message, prisma);
        }
        else if (['nap', 'xemvi', 'chuyen'].includes(command)) {
            await require('./bot_admin.js')(message, args, prisma, ADMIN_ID);
        }
        else if (command === 'bxh') {
            await require('./bot_bxh.js')(message, prisma);
        }

    } catch (err) {
        console.error("❌ Lỗi thực thi lệnh:", err);
    }
});

// 3. XỬ LÝ NÚT BẤM (BUTTON) - GIẢI QUYẾT LỖI TƯƠNG TÁC
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    try {
        // Nút bấm từ bot_cado (đặt cược, xem kèo)
        if (interaction.customId.startsWith('cado_')) {
            const botCado = require('./bot_cado.js');
            await botCado.handleButton(interaction, prisma);
        }

        // Nút bấm xem lịch sử từ bot_lookup (hoặc share)
        if (interaction.customId === 'view_history') {
            // Logic xử lý lịch sử giao dịch
            await interaction.reply({ content: 'Đang tải lịch sử...', ephemeral: true });
        }
    } catch (err) {
        console.error("❌ Lỗi Interaction:", err);
        if (!interaction.replied) {
            await interaction.reply({ content: 'Có lỗi xảy ra khi xử lý nút bấm!', ephemeral: true });
        }
    }
});

// 4. ĐĂNG NHẬP (SỬ DỤNG BIẾN TRÊN RAILWAY)
// Thay vì dùng process.env.DISCORD_TOKEN, hãy dán thẳng token vào đây
const token = "MTQ3NDY3Mjg3Mzg5NjY3MzMxMA.GXG3Ok.YWVKGkXRv0yNZ1F2NwwdgHUfux9Xv1708nPLPg"; 

if (!token || token === "DÁN_MÃ_TOKEN_CỦA_BẠN_VÀO_TRONG_NGOẶC_KÉP_NÀY") {
    console.error("❌ BẠN CHƯA DÁN TOKEN TRỰC TIẾP VÀO CODE!");
    process.exit(1);
}

client.login(token);

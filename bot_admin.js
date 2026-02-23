const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { updateBalance, getBalance, prisma } = require('./shared/economy');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

// --- CẤU HÌNH ---
const ADMIN_ROLE_ID = "1465374336214106237"; 
const LOG_CHANNEL_ID = "1475501156267462676"; 
const CURRENCY_NAME = "Verdict Cash";

// Hàm lấy/tạo Số tài khoản (STK)
async function getOrCreateSTK(userId) {
    let user = await prisma.user.findUnique({ where: { discordId: userId } });
    const autoSTK = "88" + userId.slice(-6);
    if (!user) {
        user = await prisma.user.create({ data: { discordId: userId, balance: 5000, stk: autoSTK } });
    } else if (!user.stk) {
        user = await prisma.user.update({ where: { discordId: userId }, data: { stk: autoSTK } });
    }
    return user.stk;
}

// Logic trả thưởng cược bóng đá (Sửa lỗi 'coins' thành 'balance')
async function settleMatch(matchId, scoreHome, scoreAway, hcap, ouLine) {
    const total = scoreHome + scoreAway;
    const bets = await prisma.bet.findMany({ where: { matchId: matchId, status: 'PENDING' } });

    for (const bet of bets) {
        let isWin = false;
        // ... (Logic tính toán thắng thua)
        
        if (isWin) {
            const winAmt = Math.floor(bet.amount * 1.95);
            // SỬA LỖI TÊN CỘT: Đổi 'coins' thành 'balance' theo Schema của bạn
            await prisma.user.update({
                where: { discordId: bet.userId },
                data: { balance: { increment: winAmt }, profit: { increment: winAmt - bet.amount } }
            });
            await prisma.bet.update({ where: { id: bet.id }, data: { status: 'WIN' } });
        } else {
            await prisma.bet.update({ where: { id: bet.id }, data: { status: 'LOSS' } });
        }
    }
}

client.on('ready', () => {
    console.log(`🚀 Hệ thống Verdict Economy đã online: ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID) || msg.member.permissions.has(PermissionFlagsBits.Administrator);

    // Lệnh xem Ví & STK
    if (command === '!vi') {
        const target = msg.mentions.users.first() || msg.author;
        const stk = await getOrCreateSTK(target.id);
        const user = await prisma.user.findUnique({ where: { discordId: target.id } });
        
        const embed = new EmbedBuilder()
            .setTitle("🏦 VERDICT BANKING")
            .setColor("#00fbff")
            .addFields(
                { name: "👤 CHỦ THẺ", value: target.username, inline: true },
                { name: "🔢 STK", value: `\`${stk}\``, inline: true },
                { name: "💵 SỐ DƯ", value: `**${(user?.balance || 0).toLocaleString()}** ${CURRENCY_NAME}` }
            );
        msg.reply({ embeds: [embed] });
    }

    // Các lệnh Admin khác (!nap, !tru, !chuyen...) giữ nguyên logic của bạn
});

// SỬA LỖI QUAN TRỌNG NHẤT: Gọi Token từ biến môi trường Railway
const TOKEN = process.env.DISCORD_TOKEN_ECONOMY;

if (!TOKEN) {
    console.error("❌ LỖI: Chưa cấu hình DISCORD_TOKEN_ECONOMY trong Variables!");
} else {
    client.login(TOKEN).catch(err => console.error("❌ LỖI TOKEN:", err.message));
}

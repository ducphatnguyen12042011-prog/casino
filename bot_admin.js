const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { prisma } = require('./shared/economy');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const ADMIN_ROLE_ID = "1465374336214106237"; 
const CURRENCY_NAME = "Verdict Cash";

// --- HÀM AUTO TRẢ THƯỞNG ---
async function settleMatch(matchId, scoreHome, scoreAway) {
    const bets = await prisma.bet.findMany({ where: { matchId: matchId, status: 'PENDING' } });
    
    for (const bet of bets) {
        let isWin = false;
        if (bet.choice === 'HOME' && scoreHome > scoreAway) isWin = true;
        if (bet.choice === 'AWAY' && scoreAway > scoreHome) isWin = true;

        if (isWin) {
            const winAmt = Math.floor(bet.amount * 1.95);
            // Cập nhật đúng tên cột 'balance'
            await prisma.user.update({
                where: { discordId: bet.discordId },
                data: { 
                    balance: { increment: winAmt },
                    profit: { increment: winAmt - bet.amount }
                }
            });
            await prisma.bet.update({ where: { id: bet.id }, data: { status: 'WIN' } });
            
            // Lưu lịch sử
            await prisma.transaction.create({
                data: { userId: bet.discordId, type: "THANG", amount: winAmt, reason: `Thắng kèo trận ${matchId}` }
            });
        } else {
            await prisma.bet.update({ where: { id: bet.id }, data: { status: 'LOSS' } });
        }
    }
}

client.on('ready', () => {
    console.log(`🚀 [VERDICT] Bot Admin đã online: ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID);

    // 1. Lệnh xem Ví
    if (command === '!vi') {
        const target = msg.mentions.users.first() || msg.author;
        let user = await prisma.user.findUnique({ where: { discordId: target.id } });
        if (!user) user = await prisma.user.create({ data: { discordId: target.id, balance: 5000 } });

        const embed = new EmbedBuilder()
            .setTitle(`🏦 NGÂN HÀNG VERDICT`)
            .setColor("#00fbff")
            .addFields(
                { name: "👤 Chủ sở hữu", value: target.username, inline: true },
                { name: "💵 Số dư", value: `**${user.balance.toLocaleString()}** ${CURRENCY_NAME}`, inline: true },
                { name: "📈 Tiền lời", value: `\`${user.profit.toLocaleString()}\` VC`, inline: true }
            );
        msg.reply({ embeds: [embed] });
    }

    // 2. Lệnh Trả thưởng (Admin)
    if (command === '!ketqua' && isAdmin) {
        const mId = args[1];
        const sH = parseInt(args[2]);
        const sA = parseInt(args[3]);
        if (!mId || isNaN(sH) || isNaN(sA)) return msg.reply("⚠️ HD: `!ketqua [ID] [Home] [Away]`");

        await settleMatch(mId, sH, sA);
        msg.reply(`✅ Trận \`${mId}\` kết thúc: **${sH} - ${sA}**. Tiền thưởng đã được cộng tự động!`);
    }

    // 3. Lệnh Nạp (Admin)
    if (command === '!nap' && isAdmin) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount)) return msg.reply("⚠️ HD: `!nap @user [số tiền]`");

        await prisma.user.update({
            where: { discordId: target.id },
            data: { balance: { increment: amount } }
        });
        await prisma.transaction.create({
            data: { userId: target.id, type: "NAP", amount: amount, reason: "Admin nạp tiền" }
        });
        msg.reply(`✨ Đã nạp thành công **${amount.toLocaleString()}** VC cho ${target}.`);
    }
});

// SỬA LỖI TOKEN TẠI ĐÂY
client.login(process.env.DISCORD_TOKEN_ECONOMY).catch(err => {
    console.error("❌ Không thể đăng nhập. Hãy kiểm tra Token trong Variables!");
});

const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { prisma } = require('./shared/economy');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const ADMIN_ROLE_ID = "1465374336214106237"; 
const LOG_CHANNEL_ID = "1475501156267462676"; 

// --- HÀM TỰ ĐỘNG TRẢ THƯỞNG & LƯU LỊCH SỬ ---
async function settleMatch(matchId, scoreHome, scoreAway) {
    const bets = await prisma.bet.findMany({ where: { matchId: matchId, status: 'PENDING' } });
    
    for (const bet of bets) {
        let isWin = false;
        if (bet.choice === 'HOME' && scoreHome > scoreAway) isWin = true;
        if (bet.choice === 'AWAY' && scoreAway > scoreHome) isWin = true;

        if (isWin) {
            const winAmt = Math.floor(bet.amount * 1.95);
            // Cập nhật số dư và tiền lời
            await prisma.user.update({
                where: { discordId: bet.discordId },
                data: { balance: { increment: winAmt }, profit: { increment: winAmt - bet.amount } }
            });
            await prisma.bet.update({ where: { id: bet.id }, data: { status: 'WIN' } });
            // Ghi lịch sử thắng
            await prisma.transaction.create({
                data: { userId: bet.discordId, type: "THANG", amount: winAmt, reason: `Thắng cược trận ${matchId}` }
            });
        } else {
            await prisma.bet.update({ where: { id: bet.id }, data: { status: 'LOSS' } });
            // Ghi lịch sử thua
            await prisma.transaction.create({
                data: { userId: bet.discordId, type: "THUA", amount: bet.amount, reason: `Thua cược trận ${matchId}` }
            });
        }
    }
}

client.on('ready', () => {
    console.log(`🚀 [SYSTEM ONLINE] ${client.user.tag} đã sẵn sàng!`);
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID);

    // 1. LỆNH !VI (Giao diện đẹp + Lịch sử)
    if (command === '!vi') {
        const target = msg.mentions.users.first() || msg.author;
        try {
            const [user, logs] = await Promise.all([
                prisma.user.findUnique({ where: { discordId: target.id } }),
                prisma.transaction.findMany({
                    where: { userId: target.id },
                    orderBy: { createdAt: 'desc' },
                    take: 3
                })
            ]);

            const bal = user?.balance || 5000;
            const history = logs.length > 0 
                ? logs.map(l => {
                    const icon = (l.type === "NAP" || l.type === "NHAN" || l.type === "THANG") ? "🟢" : "🔴";
                    const time = `<t:${Math.floor(l.createdAt.getTime() / 1000)}:R>`;
                    return `${icon} **${l.type}**: \`${l.amount.toLocaleString()}\` VC | ${time}`;
                }).join("\n")
                : "🔹 *Chưa có giao dịch gần đây*";

            const embed = new EmbedBuilder()
                .setAuthor({ name: `VERDICT DIGITAL BANKING`, iconURL: 'https://i.imgur.com/6Xw6kIn.png' })
                .setColor("#00fbff")
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setTitle(`💳 CHỦ THẺ: ${target.username.toUpperCase()}`)
                .addFields(
                    { name: "💵 SỐ DƯ", value: `>>> **${bal.toLocaleString()}** \`Verdict Cash\``, inline: false },
                    { name: "📈 TIỀN LỜI", value: `\`${user?.profit || 0}\` VC`, inline: true },
                    { name: "🏦 TRẠNG THÁI", value: `\`Hoạt động\``, inline: true },
                    { name: "📜 GIAO DỊCH GẦN NHẤT", value: history }
                )
                .setFooter({ text: "Hệ thống bảo mật Verdict MySQL" })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
        } catch (e) { console.error(e); }
    }

    // 2. LỆNH !KETQUA (Admin trả thưởng)
    if (command === '!ketqua' && isAdmin) {
        const mId = args[1];
        const sH = parseInt(args[2]);
        const sA = parseInt(args[3]);
        if (!mId || isNaN(sH) || isNaN(sA)) return msg.reply("⚠️ HD: `!ketqua [ID] [Home] [Away]`");

        await settleMatch(mId, sH, sA);
        msg.reply(`✅ Đã chốt trận \`${mId}\` (**${sH}-${sA}**). Tiền đã được trả!`);
    }

    // 3. LỆNH !NAP (Admin)
    if (command === '!nap' && isAdmin) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount)) return msg.reply("⚠️ HD: `!nap @user [số tiền]`");

        await prisma.user.upsert({
            where: { discordId: target.id },
            update: { balance: { increment: amount } },
            create: { discordId: target.id, balance: 5000 + amount }
        });
        await prisma.transaction.create({
            data: { userId: target.id, type: "NAP", amount: amount, reason: "Admin nạp tiền" }
        });
        msg.reply(`✨ Đã nạp **${amount.toLocaleString()}** VC cho ${target}.`);
    }
});

// LOGIN AN TOÀN
client.login(process.env.DISCORD_TOKEN_ECONOMY).catch(e => console.error("❌ Token sai!"));

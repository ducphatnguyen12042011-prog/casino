const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { prisma } = require('./shared/economy');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const ADMIN_ROLE_ID = "1465374336214106237"; 

// --- 🛠️ HÀM HIỂN THỊ VÍ LUXURY ---
async function sendLuxuryWallet(msg, targetUser, isUpdate = false) {
    let user = await prisma.user.findUnique({ where: { discordId: targetUser.id } });
    if (!user) user = await prisma.user.create({ data: { discordId: targetUser.id, balance: 5000 } });

    const logs = await prisma.transaction.findMany({
        where: { userId: targetUser.id },
        orderBy: { createdAt: 'desc' },
        take: 3
    });

    const history = logs.length > 0 
        ? logs.map(l => {
            const icon = (l.type === "NAP" || l.type === "NHAN" || l.type === "THANG") ? "🟢" : "🔴";
            return `${icon} **${l.type}**: \`${l.amount.toLocaleString()}\` VC | <t:${Math.floor(l.createdAt.getTime() / 1000)}:R>`;
        }).join("\n")
        : "🔹 *Chưa có giao dịch gần đây*";

    const embed = new EmbedBuilder()
        .setAuthor({ name: isUpdate ? '🏦 CẬP NHẬT SỐ DƯ THÀNH CÔNG' : '💳 VERDICT DIGITAL BANKING', iconURL: 'https://i.imgur.com/6Xw6kIn.png' })
        .setColor(isUpdate ? "#2ecc71" : "#00fbff")
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setTitle(`CHỦ THẺ: ${targetUser.username.toUpperCase()}`)
        .addFields(
            { name: "💵 SỐ DƯ HIỆN TẠI", value: `>>> **${user.balance.toLocaleString()}** \`Verdict Cash\`` },
            { name: "📈 TỔNG TIỀN LỜI", value: `\`${user.profit.toLocaleString()}\` VC`, inline: true },
            { name: "🏦 TRẠNG THÁI", value: `\`Đang hoạt động\``, inline: true },
            { name: "📜 LỊCH SỬ 03 GIAO DỊCH GẦN NHẤT", value: history }
        )
        .setFooter({ text: "Hệ thống bảo mật Verdict MySQL Security" })
        .setTimestamp();

    return msg.reply({ embeds: [embed] });
}

client.on('ready', () => console.log(`🚀 [SYSTEM ONLINE] ${client.user.tag}`));

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID);

    // 1. LỆNH !VI
    if (command === '!vi') {
        const target = msg.mentions.users.first() || msg.author;
        await sendLuxuryWallet(msg, target);
    }

    // 2. LỆNH !CHUYEN (Biên lai cực xịn)
    if (command === '!chuyen') {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount < 100) return msg.reply("⚠️ **HD:** `!chuyen @user [số tiền]`");
        if (target.id === msg.author.id) return msg.reply("❌ Bạn không thể tự chuyển cho mình.");

        try {
            const sender = await prisma.user.findUnique({ where: { discordId: msg.author.id } });
            if (!sender || sender.balance < amount) return msg.reply("❌ Số dư không đủ!");

            const transID = `VC-${Math.random().toString(36).substring(4).toUpperCase()}`;

            await prisma.$transaction([
                prisma.user.update({ where: { discordId: msg.author.id }, data: { balance: { decrement: amount } } }),
                prisma.user.upsert({
                    where: { discordId: target.id },
                    update: { balance: { increment: amount } },
                    create: { discordId: target.id, balance: 5000 + amount }
                }),
                prisma.transaction.create({ data: { userId: msg.author.id, type: "CHUYEN", amount, reason: `Gửi đến ${target.username}` } }),
                prisma.transaction.create({ data: { userId: target.id, type: "NHAN", amount, reason: `Nhận từ ${msg.author.username}` } })
            ]);

            const receipt = new EmbedBuilder()
                .setAuthor({ name: 'BIÊN LAI CHUYỂN TIỀN THÀNH CÔNG', iconURL: 'https://i.imgur.com/6Xw6kIn.png' })
                .setColor("#2ecc71")
                .addFields(
                    { name: "📤 NGƯỜI GỬI", value: `${msg.author}`, inline: true },
                    { name: "📥 NGƯỜI NHẬN", value: `${target}`, inline: true },
                    { name: "💰 SỐ TIỀN", value: `**${amount.toLocaleString()}** \`Verdict Cash\`` },
                    { name: "🆔 MÃ GIAO DỊCH", value: `\`${transID}\`` }
                )
                .setTimestamp();
            msg.reply({ embeds: [receipt] });
        } catch (e) { console.error(e); }
    }

    // 3. LỆNH !NAP (Nạp cho người khác + Hiện luôn ví của họ)
    if (command === '!nap' && isAdmin) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount)) return msg.reply("⚠️ **HD:** `!nap @user [số tiền]`");

        await prisma.user.upsert({
            where: { discordId: target.id },
            update: { balance: { increment: amount } },
            create: { discordId: target.id, balance: 5000 + amount }
        });
        await prisma.transaction.create({ data: { userId: target.id, type: "NAP", amount, reason: "Admin nạp tiền" } });
        
        // Hiện ví ngay sau khi nạp
        await sendLuxuryWallet(msg, target, true);
    }

    // 4. LỆNH !TOP (Giao diện bảng vàng)
    if (command === '!top') {
        const topUsers = await prisma.user.findMany({ orderBy: { balance: 'desc' }, take: 10 });
        const leaderboard = topUsers.map((u, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🔹";
            return `${medal} **TOP ${i+1}**: <@${u.discordId}> • \`${u.balance.toLocaleString()}\` VC`;
        }).join("\n");

        msg.reply({ embeds: [new EmbedBuilder().setTitle("🏆 BẢNG XẾP HẠNG ĐẠI GIA").setColor("#f1c40f").setDescription(leaderboard || "Chưa có dữ liệu")] });
    }
});

client.login(process.env.DISCORD_TOKEN_ECONOMY);

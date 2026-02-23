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
const CURRENCY_ICON = "💎";

// Hàm gửi Log chuyên nghiệp
async function sendLog(guild, embed) {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
        logChannel.send({ embeds: [embed] }).catch(e => console.error("Lỗi gửi log:", e));
    }
}

// Hàm lưu lịch sử giao dịch vào MySQL
async function saveTransaction(userId, type, amount, reason) {
    try {
        await prisma.transaction.create({
            data: { userId, type, amount, reason }
        });
    } catch (e) { console.error("Lỗi lưu Transaction:", e); }
}

client.on('ready', () => {
    console.log(`🚀 Hệ thống Verdict Economy Premium đã online: ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID) || msg.member.permissions.has(PermissionFlagsBits.Administrator);

    // 1. LỆNH !VI - GIAO DIỆN THẺ TÀI KHOẢN CAO CẤP
    if (command === '!vi') {
        const target = msg.mentions.users.first() || msg.author;
        if (target.id !== msg.author.id && !isAdmin) return msg.reply("❌ Quyền truy cập bị từ chối!");

        try {
            const [user, logs] = await Promise.all([
                prisma.user.findUnique({ where: { discordId: target.id } }),
                prisma.transaction.findMany({
                    where: { userId: target.id },
                    orderBy: { createdAt: 'desc' },
                    take: 3
                })
            ]);

            const balance = user ? user.balance : 0;
            const profit = user?.profit || 0;
            const historyText = logs.length > 0 
                ? logs.map(l => {
                    const icon = (l.type === "NAP" || l.type === "NHAN" || l.type === "THANG") ? "🟢" : "🔴";
                    return `${icon} **${l.type}**: \`${l.amount.toLocaleString()}\` | <t:${Math.floor(l.createdAt.getTime() / 1000)}:R>`;
                }).join("\n")
                : "🔹 *Chưa có biến động số dư gần đây*";

            const embed = new EmbedBuilder()
                .setTitle(`💳 VERDICT CARD: ${target.username.toUpperCase()}`)
                .setColor("#00fbff")
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: "💵 TIỀN TIÊU", value: `>>> **${balance.toLocaleString()}** ${CURRENCY_NAME}`, inline: true },
                    { name: "📈 TIỀN LỜI", value: `>>> **${profit.toLocaleString()}** ${CURRENCY_NAME}`, inline: true },
                    { name: "━━━━━━━━━ GIAO DỊCH GẦN NHẤT ━━━━━━━━━", value: historyText }
                )
                .setFooter({ text: "Hệ thống bảo mật Verdict MySQL" })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
        } catch (e) { msg.reply("❌ Lỗi kết nối hệ thống ví."); }
    }

    // 2. LỆNH !NAP - GIAO DIỆN PHÊ DUYỆT CẤP VỐN
    if (command === '!nap' && isAdmin) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0) return msg.reply("⚠️ HD: `!nap @user [số tiền]`");

        try {
            await updateBalance(target.id, amount);
            const newBalance = await getBalance(target.id);

            const embed = new EmbedBuilder()
                .setTitle("✨ PHÊ DUYỆT CẤP VỐN ✨")
                .setColor("#f1c40f")
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: "👤 Tài khoản", value: `${target}`, inline: true },
                    { name: "➕ Hạn mức", value: `\`+${amount.toLocaleString()}\` ${CURRENCY_ICON}`, inline: true },
                    { name: "🏦 Số dư sau thuế", value: `**${newBalance.toLocaleString()}** ${CURRENCY_NAME}`, inline: false }
                )
                .setFooter({ text: `Lệnh từ Admin: ${msg.author.tag}` })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
            await saveTransaction(target.id, "NAP", amount, `Admin nạp vốn`);
            await sendLog(msg.guild, embed);
        } catch (e) { msg.reply("❌ Lỗi xử lý nạp tiền."); }
    }

    // 3. LỆNH !CHUYEN - GIAO DIỆN BIÊN LAI GIAO DỊCH
    if (command === '!chuyen') {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0 || target.id === msg.author.id) return msg.reply("⚠️ HD: `!chuyen @user [số tiền]`");

        try {
            const myBal = await getBalance(msg.author.id);
            if (myBal < amount) return msg.reply("❌ Số dư tài khoản không đủ để thực hiện giao dịch này!");

            await updateBalance(msg.author.id, -amount);
            await updateBalance(target.id, amount);

            const embed = new EmbedBuilder()
                .setAuthor({ name: "BIÊN LAI VERDICT PAY", iconURL: "https://i.imgur.com/6Xw6kIn.png" })
                .setColor("#3498db")
                .addFields(
                    { name: "📤 NGƯỜI GỬI", value: `${msg.author}`, inline: true },
                    { name: "📥 NGƯỜI NHẬN", value: `${target}`, inline: true },
                    { name: "💰 TỔNG CHUYỂN", value: `**${amount.toLocaleString()}** ${CURRENCY_NAME}` }
                )
                .setFooter({ text: "Mã giao dịch: TX-" + Math.random().toString(36).substring(7).toUpperCase() })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
            await saveTransaction(msg.author.id, "CHUYEN", amount, `Chuyển cho ${target.tag}`);
            await saveTransaction(target.id, "NHAN", amount, `Nhận từ ${msg.author.tag}`);
            await sendLog(msg.guild, embed);
        } catch (e) { msg.reply("❌ Giao dịch bị từ chối."); }
    }

    // 4. LỆNH !TOP - BẢNG XẾP HẠNG ANH TÀI
    if (command === '!top') {
        try {
            const topUsers = await prisma.user.findMany({ orderBy: { balance: 'desc' }, take: 10 });
            const list = topUsers.map((u, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🔹";
                return `${medal} **#${i+1}** <@${u.discordId}>: \`${u.balance.toLocaleString()}\` VC`;
            }).join("\n");

            const embed = new EmbedBuilder()
                .setTitle("🏆 BẢNG XẾP HẠNG VERDICT CASH")
                .setColor("#ff007b")
                .setDescription(list || "*Chưa có dữ liệu giao dịch*")
                .setTimestamp();

            msg.reply({ embeds: [embed] });
        } catch (e) { msg.reply("❌ Không thể tải bảng xếp hạng."); }
    }

    // 5. LỆNH !TRU - KHẤU TRỪ TÀI KHOẢN
    if (command === '!tru' && isAdmin) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0) return msg.reply("⚠️ HD: `!tru @user [số tiền]`");

        try {
            await updateBalance(target.id, -amount);
            msg.reply(`✅ Đã thực hiện khấu trừ **${amount.toLocaleString()}** ${CURRENCY_NAME} từ tài khoản ${target}.`);
            await saveTransaction(target.id, "TRU", amount, `Admin khấu trừ`);
        } catch (e) { msg.reply("❌ Lỗi khấu trừ."); }
    }
});

client.login(process.env.DISCORD_TOKEN_ECONOMY);

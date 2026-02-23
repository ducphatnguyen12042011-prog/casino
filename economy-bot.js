const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { updateBalance, getBalance, prisma } = require('./shared/economy');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const ADMIN_ROLE_ID = "1465374336214106237";
const CURRENCY_ICON = "💵"; // Bạn có thể thay bằng emoji server bạn

// Hàm lưu lịch sử vào DB
async function saveLog(userId, type, amount, reason) {
    await prisma.transaction.create({
        data: { userId, type, amount, reason }
    });
}

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const hasRole = msg.member.roles.cache.has(ADMIN_ROLE_ID);

    // 1. LỆNH XEM VÍ (Embed xịn)
    if (command === '!vi') {
        const target = msg.mentions.users.first() || msg.author;
        if (target.id !== msg.author.id && !hasRole) return msg.reply("❌ Bạn không có quyền soi ví người khác!");

        try {
            const balance = await getBalance(target.id);
            const embed = new EmbedBuilder()
                .setAuthor({ name: `Tài Khoản Của ${target.username}`, iconURL: target.displayAvatarURL() })
                .setDescription(`### Số dư: ${CURRENCY_ICON} \`${balance.toLocaleString()}\` Cash`)
                .setColor(balance > 0 ? "#5865F2" : "#ffcc00")
                .setFooter({ text: "Sử dụng !lichsu để xem giao dịch gần đây" })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
        } catch (e) { msg.reply("❌ Lỗi truy xuất ví."); }
    }

    // 2. LỆNH CHUYỂN TIỀN (Có lưu lịch sử)
    if (command === '!chuyen') {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0 || target.id === msg.author.id) return msg.reply("⚠️ Cú pháp: `!chuyen @user [số tiền]`");

        try {
            const senderBal = await getBalance(msg.author.id);
            if (senderBal < amount) return msg.reply("❌ Ví của bạn không đủ tiền!");

            await updateBalance(msg.author.id, -amount);
            await updateBalance(target.id, amount);
            
            // Lưu lịch sử
            await saveLog(msg.author.id, "CHUYEN", amount, `Chuyển cho ${target.tag}`);
            await saveLog(target.id, "NHAN", amount, `Nhận từ ${msg.author.tag}`);

            const embed = new EmbedBuilder()
                .setTitle("🚀 GIAO DỊCH THÀNH CÔNG")
                .setColor("#2ecc71")
                .addFields(
                    { name: "📤 Người gửi", value: `${msg.author}`, inline: true },
                    { name: "📥 Người nhận", value: `${target}`, inline: true },
                    { name: "💰 Số tiền", value: `\`${amount.toLocaleString()}\` Cash` }
                )
                .setThumbnail("https://i.imgur.com/8Qp7Z8m.png") // Icon tiền bay
                .setTimestamp();

            msg.reply({ embeds: [embed] });
        } catch (e) { msg.reply("❌ Lỗi giao dịch."); }
    }

    // 3. LỆNH XEM LỊCH SỬ (Mới)
    if (command === '!lichsu') {
        try {
            const logs = await prisma.transaction.findMany({
                where: { userId: msg.author.id },
                orderBy: { createdAt: 'desc' },
                take: 5 // Lấy 5 giao dịch gần nhất
            });

            if (logs.length === 0) return msg.reply("📭 Bạn chưa có giao dịch nào.");

            const logText = logs.map(l => {
                const icon = l.type === "NHAN" || l.type === "NAP" ? "➕" : "➖";
                return `\`${l.createdAt.toLocaleDateString()}\` **${icon}${l.amount.toLocaleString()}**: ${l.reason}`;
            }).join("\n");

            const embed = new EmbedBuilder()
                .setTitle("📜 LỊCH SỬ GIAO DỊCH GẦN ĐÂY")
                .setDescription(logText)
                .setColor("#95a5a6")
                .setFooter({ text: "Hiển thị 5 giao dịch mới nhất" });

            msg.reply({ embeds: [embed] });
        } catch (e) { msg.reply("❌ Không thể lấy lịch sử."); }
    }

    // 4. LỆNH NẠP (Admin) - Thêm lưu log
    if (command === '!nap' && hasRole) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount)) return;
        await updateBalance(target.id, amount);
        await saveLog(target.id, "NAP", amount, `Admin ${msg.author.tag} nạp`);
        msg.reply(`✅ Đã nạp \`${amount}\` cho ${target}`);
    }
});

client.login(process.env.DISCORD_TOKEN_ECONOMY);

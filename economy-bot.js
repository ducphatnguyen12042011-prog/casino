const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { updateBalance, getBalance, prisma } = require('./shared/economy');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

// --- CẤU HÌNH ---
const ADMIN_ROLE_ID = "1465374336214106237"; // Role ID quản trị
const CURRENCY_NAME = "Cash";

// Hàm hỗ trợ lưu lịch sử vào MySQL
async function saveTransaction(userId, type, amount, reason) {
    try {
        await prisma.transaction.create({
            data: { userId, type, amount, reason }
        });
    } catch (e) {
        console.error("Lỗi lưu Transaction:", e);
    }
}

client.on('ready', () => {
    console.log(`🚀 Bot Economy đã sẵn sàng: ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const hasRole = msg.member.roles.cache.has(ADMIN_ROLE_ID);

    // 1. LỆNH !vi - XEM SỐ DƯ
    if (command === '!vi') {
        const target = msg.mentions.users.first() || msg.author;
        
        // Chặn người thường xem ví người khác
        if (target.id !== msg.author.id && !hasRole) {
            return msg.reply("❌ Bạn chỉ có quyền xem ví của chính mình!");
        }

        try {
            const balance = await getBalance(target.id);
            const embed = new EmbedBuilder()
                .setAuthor({ name: `Tài khoản của ${target.username}`, iconURL: target.displayAvatarURL() })
                .setColor("#3498db")
                .addFields(
                    { name: "👤 Người sở hữu", value: `${target}`, inline: true },
                    { name: "💰 Số dư hiện tại", value: `\`${balance.toLocaleString()}\` ${CURRENCY_NAME}`, inline: true }
                )
                .setFooter({ text: "Dữ liệu thời gian thực từ MySQL" })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
        } catch (e) {
            msg.reply("❌ Không thể lấy dữ liệu ví.");
        }
    }

    // 2. LỆNH !nap @user [số tiền] - CHỈ ADMIN
    if (command === '!nap') {
        if (!hasRole) return msg.reply("❌ Bạn không có quyền nạp tiền!");

        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);

        if (!target || isNaN(amount) || amount <= 0) {
            return msg.reply("⚠️ Cú pháp: `!nap @user [số tiền]`");
        }

        try {
            await updateBalance(target.id, amount);
            const newBalance = await getBalance(target.id);

            const embed = new EmbedBuilder()
                .setTitle("➕ CẤP VỐN THÀNH CÔNG")
                .setColor("#2ecc71")
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: "👤 Người nhận", value: `${target}`, inline: true },
                    { name: "💰 Số tiền nạp", value: `\`+${amount.toLocaleString()}\` ${CURRENCY_NAME}`, inline: true },
                    { name: "🏦 Số dư mới", value: `\`${newBalance.toLocaleString()}\` ${CURRENCY_NAME}`, inline: false }
                )
                .setFooter({ text: `Thực hiện bởi: ${msg.author.tag}` })
                .setTimestamp();

            await saveTransaction(target.id, "NAP", amount, `Được Admin ${msg.author.tag} nạp`);
            msg.reply({ embeds: [embed] });
        } catch (e) {
            msg.reply("❌ Lỗi khi nạp tiền.");
        }
    }

    // 3. LỆNH !tru @user [số tiền] - CHỈ ADMIN
    if (command === '!tru') {
        if (!hasRole) return msg.reply("❌ Bạn không có quyền trừ tiền!");

        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);

        if (!target || isNaN(amount) || amount <= 0) return msg.reply("⚠️ Cú pháp: `!tru @user [số tiền]`");

        try {
            const currentBal = await getBalance(target.id);
            if (currentBal < amount) return msg.reply("❌ Đối tượng không đủ số dư để trừ!");

            await updateBalance(target.id, -amount);
            const newBalance = await getBalance(target.id);

            msg.reply(`✅ Đã trừ \`${amount.toLocaleString()}\` từ ${target}. Số dư mới: \`${newBalance.toLocaleString()}\`.`);
            await saveTransaction(target.id, "TRU", amount, `Bị Admin ${msg.author.tag} trừ`);
        } catch (e) {
            msg.reply("❌ Lỗi khi trừ tiền.");
        }
    }

    // 4. LỆNH !chuyen @user [số tiền] - AI CŨNG DÙNG ĐƯỢC
    if (command === '!chuyen') {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);

        if (!target || isNaN(amount) || amount <= 0) return msg.reply("⚠️ Cú pháp: `!chuyen @user [số tiền]`");
        if (target.id === msg.author.id) return msg.reply("⚠️ Bạn không thể tự chuyển cho chính mình.");

        try {
            const senderBalance = await getBalance(msg.author.id);

            // KIỂM TRA SỐ DƯ TRƯỚC KHI ĐẶT/CHUYỂN
            if (senderBalance < amount) {
                return msg.reply(`❌ **Số dư không đủ!** Bạn cần thêm \`${(amount - senderBalance).toLocaleString()}\` ${CURRENCY_NAME} nữa.`);
            }

            await updateBalance(msg.author.id, -amount);
            await updateBalance(target.id, amount);

            await saveTransaction(msg.author.id, "CHUYEN", amount, `Chuyển cho ${target.tag}`);
            await saveTransaction(target.id, "NHAN", amount, `Nhận từ ${msg.author.tag}`);

            msg.reply(`💸 Chuyển thành công \`${amount.toLocaleString()}\` cho ${target}!`);
        } catch (e) {
            msg.reply("❌ Lỗi giao dịch.");
        }
    }

    // 5. LỆNH !lichsu - XEM 5 GIAO DỊCH GẦN NHẤT
    if (command === '!lichsu') {
        try {
            const logs = await prisma.transaction.findMany({
                where: { userId: msg.author.id },
                orderBy: { createdAt: 'desc' },
                take: 5
            });

            if (logs.length === 0) return msg.reply("📭 Bạn chưa có lịch sử giao dịch nào.");

            const history = logs.map(l => {
                const icon = (l.type === "NAP" || l.type === "NHAN") ? "📈" : "📉";
                return `**${icon} ${l.type}:** \`${l.amount.toLocaleString()}\` - *${l.reason}*`;
            }).join("\n");

            const embed = new EmbedBuilder()
                .setTitle("📜 LỊCH SỬ GIAO DỊCH")
                .setColor("#95a5a6")
                .setDescription(history)
                .setTimestamp();

            msg.reply({ embeds: [embed] });
        } catch (e) {
            msg.reply("❌ Không thể lấy lịch sử.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN_ECONOMY);

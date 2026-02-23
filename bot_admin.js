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
const ADMIN_ROLE_ID = "1465374336214106237"; // ID Role quản trị
const LOG_CHANNEL_ID = "1475501156267462676"; // Kênh Log của bạn
const CURRENCY_NAME = "Cash";
const CURRENCY_ICON = "💰";

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
    console.log(`🚀 Bot Admin & Economy Final đã online: ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID) || msg.member.permissions.has(PermissionFlagsBits.Administrator);

    // 1. LỆNH !VI - XEM VÍ + TIỀN LỜI + 3 LỊCH SỬ GẦN NHẤT
    if (command === '!vi') {
        const target = msg.mentions.users.first() || msg.author;
        if (target.id !== msg.author.id && !isAdmin) return msg.reply("❌ Bạn không có quyền xem ví người khác!");

        try {
            // Lấy thông tin User và 3 giao dịch gần nhất
            const [user, logs] = await Promise.all([
                prisma.user.findUnique({ where: { discordId: target.id } }),
                prisma.transaction.findMany({
                    where: { userId: target.id },
                    orderBy: { createdAt: 'desc' },
                    take: 3
                })
            ]);

            // Nếu user chưa tồn tại trong DB, lấy mặc định
            const balance = user ? user.balance : 0;
            const profit = user && user.profit ? user.profit : 0;

            // Định dạng danh sách lịch sử
            const historyText = logs.length > 0 
                ? logs.map(l => {
                    const icon = (l.type === "NAP" || l.type === "NHAN" || l.type === "THANG") ? "📈" : "📉";
                    return `${icon} **${l.type}**: \`${l.amount.toLocaleString()}\` | <t:${Math.floor(l.createdAt.getTime() / 1000)}:R>`;
                }).join("\n")
                : "📭 Chưa có giao dịch nào gần đây.";

            const embed = new EmbedBuilder()
                .setAuthor({ name: `HỆ THỐNG TÀI CHÍNH - ${target.username.toUpperCase()}`, iconURL: target.displayAvatarURL() })
                .setColor("#00ffcc")
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: "💰 Tiền Tiêu", value: `**${balance.toLocaleString()}** ${CURRENCY_NAME}`, inline: true },
                    { name: "💹 Tiền Lời", value: `**${profit.toLocaleString()}** ${CURRENCY_NAME}`, inline: true },
                    { name: "━━━━━━ 3 Giao dịch gần nhất ━━━━━━", value: historyText }
                )
                .setFooter({ text: "Dữ liệu khớp 100% với MySQL" })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
        } catch (e) { 
            console.error(e);
            msg.reply("❌ Lỗi truy xuất ví."); 
        }
    }

    // 2. LỆNH !NAP - NẠP TIỀN
    if (command === '!nap' && isAdmin) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0) return msg.reply("⚠️ Cú pháp: `!nap @user [số tiền]`");

        try {
            await updateBalance(target.id, amount);
            const newBalance = await getBalance(target.id);

            const embed = new EmbedBuilder()
                .setTitle("✅ CẤP VỐN THÀNH CÔNG")
                .setColor("#2ecc71")
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: "👤 Người nhận", value: `${target}`, inline: true },
                    { name: "💵 Số tiền nạp", value: `\`+${amount.toLocaleString()}\` ${CURRENCY_NAME}`, inline: true },
                    { name: "🏦 Số dư mới", value: `**${newBalance.toLocaleString()}** ${CURRENCY_NAME}`, inline: false }
                )
                .setFooter({ text: `Thực hiện bởi: ${msg.author.tag}` })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
            
            // Gửi Log
            const logEmbed = new EmbedBuilder()
                .setTitle("📝 LOG: ADMIN NẠP TIỀN")
                .setColor("#2ecc71")
                .addFields(
                    { name: "👮 Admin", value: `${msg.author.tag}`, inline: true },
                    { name: "👤 Người nhận", value: `${target.tag}`, inline: true },
                    { name: "💰 Số tiền", value: `**${amount.toLocaleString()}**`, inline: false }
                ).setTimestamp();
            await sendLog(msg.guild, logEmbed);
            await saveTransaction(target.id, "NAP", amount, `Admin nạp tiền`);
        } catch (e) { msg.reply("❌ Lỗi hệ thống."); }
    }

    // 3. LỆNH !TRU - TRỪ TIỀN
    if (command === '!tru' && isAdmin) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0) return msg.reply("⚠️ Cú pháp: `!tru @user [số tiền]`");

        try {
            const currentBal = await getBalance(target.id);
            if (currentBal < amount) return msg.reply("❌ Đối tượng không đủ số dư!");

            await updateBalance(target.id, -amount);
            const newBalance = await getBalance(target.id);

            msg.reply(`✅ Đã trừ **${amount.toLocaleString()}** của ${target}.`);

            const logEmbed = new EmbedBuilder()
                .setTitle("🚨 LOG: ADMIN TRỪ TIỀN")
                .setColor("#e74c3c")
                .addFields(
                    { name: "👮 Admin", value: `${msg.author.tag}`, inline: true },
                    { name: "👤 Đối tượng", value: `${target.tag}`, inline: true },
                    { name: "💸 Số tiền trừ", value: `**-${amount.toLocaleString()}**`, inline: false }
                ).setTimestamp();
            await sendLog(msg.guild, logEmbed);
            await saveTransaction(target.id, "TRU", amount, `Admin trừ tiền`);
        } catch (e) { msg.reply("❌ Lỗi khi trừ tiền."); }
    }

    // 4. LỆNH !CHUYEN - CHUYỂN TIỀN
    if (command === '!chuyen') {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0 || target.id === msg.author.id) return msg.reply("⚠️ Sai cú pháp.");

        try {
            const myBal = await getBalance(msg.author.id);
            if (myBal < amount) return msg.reply("❌ Bạn không đủ tiền!");

            await updateBalance(msg.author.id, -amount);
            await updateBalance(target.id, amount);
            msg.reply(`💸 Đã chuyển **${amount.toLocaleString()}** cho ${target}.`);

            const logEmbed = new EmbedBuilder()
                .setTitle("📝 LOG: GIAO DỊCH USER")
                .setColor("#3498db")
                .setDescription(`**${msg.author.tag}** chuyển **${amount.toLocaleString()}** cho **${target.tag}**`)
                .setTimestamp();
            await sendLog(msg.guild, logEmbed);
            await saveTransaction(msg.author.id, "CHUYEN", amount, `Chuyển cho ${target.tag}`);
            await saveTransaction(target.id, "NHAN", amount, `Nhận từ ${msg.author.tag}`);
        } catch (e) { msg.reply("❌ Lỗi chuyển tiền."); }
    }

    // 5. LỆNH !TOP - BẢNG XẾP HẠNG
    if (command === '!top') {
        try {
            const topUsers = await prisma.user.findMany({ orderBy: { balance: 'desc' }, take: 10 });
            const list = topUsers.map((u, i) => `**#${i+1}** <@${u.discordId}>: \`${u.balance.toLocaleString()}\``).join("\n");
            const embed = new EmbedBuilder().setTitle("🏆 TOP ĐẠI GIA").setColor("#f1c40f").setDescription(list || "Trống").setTimestamp();
            msg.reply({ embeds: [embed] });
        } catch (e) { msg.reply("❌ Lỗi lấy bảng xếp hạng."); }
    }
});

client.login(process.env.DISCORD_TOKEN_ECONOMY);

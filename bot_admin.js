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
const LOG_CHANNEL_ID = "1475501156267462676"; // THAY ID KÊNH LOG CỦA BẠN VÀO ĐÂY
const CURRENCY_NAME = "Cash";
const CURRENCY_ICON = "💰";

// Hàm gửi Log chuyên nghiệp vào kênh riêng
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
    
    // Kiểm tra quyền Admin
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID) || msg.member.permissions.has(PermissionFlagsBits.Administrator);

    // 1. LỆNH !VI - XEM VÍ (Giao diện đẹp)
    if (command === '!vi') {
        const target = msg.mentions.users.first() || msg.author;
        if (target.id !== msg.author.id && !isAdmin) return msg.reply("❌ Bạn không có quyền xem ví người khác!");

        try {
            const balance = await getBalance(target.id);
            const embed = new EmbedBuilder()
                .setAuthor({ name: `THÔNG TIN TÀI KHOẢN`, iconURL: target.displayAvatarURL() })
                .setColor("#3498db")
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: "👤 Người sở hữu", value: `${target}`, inline: true },
                    { name: `${CURRENCY_ICON} Số dư`, value: `**${balance.toLocaleString()}** ${CURRENCY_NAME}`, inline: true }
                )
                .setFooter({ text: "Dữ liệu thời gian thực từ MySQL" })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
        } catch (e) { msg.reply("❌ Lỗi truy xuất ví."); }
    }

    // 2. LỆNH !NAP - NẠP TIỀN (Admin Only + Log)
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

    // 3. LỆNH !TRU - TRỪ TIỀN (Admin Only + Log)
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

    // 4. LỆNH !CHUYEN - CHUYỂN TIỀN (User)
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

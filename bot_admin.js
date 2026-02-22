const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { updateBalance, getBalance, prisma } = require('./shared/economy');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Cấu hình ID kênh để ghi Log (Thay ID thật của bạn vào đây)
const LOG_CHANNEL_ID = "123456789012345678"; 

async function sendLog(guild, embed) {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) logChannel.send({ embeds: [embed] });
}

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    const args = msg.content.split(/\s+/);
    const command = args[0].toLowerCase();

    // Kiểm tra quyền Admin
    const isAdmin = msg.member.permissions.has(PermissionFlagsBits.Administrator);

    // 1. LỆNH NẠP TIỀN: !nap @user [số tiền]
    if (command === '!nap' && isAdmin) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);

        if (!target || isNaN(amount) || amount <= 0) {
            return msg.reply("⚠️ **Cú pháp:** `!nap @user [số tiền]`");
        }

        try {
            await updateBalance(target.id, amount);
            const newBalance = await getBalance(target.id);

            const embed = new EmbedBuilder()
                .setTitle("➕ CẤP VỐN THÀNH CÔNG")
                .setColor("#2ecc71") // Xanh lá
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: "👤 Người nhận", value: `${target}`, inline: true },
                    { name: "💰 Số tiền nạp", value: `\`+${amount.toLocaleString()}\` Cash`, inline: true },
                    { name: "🏦 Số dư mới", value: `\`${newBalance.toLocaleString()}\` Cash`, inline: false }
                )
                .setFooter({ text: `Thực hiện bởi: ${msg.author.tag}`, iconURL: msg.author.displayAvatarURL() })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
            sendLog(msg.guild, embed); // Gửi log
        } catch (err) {
            msg.reply("❌ Lỗi: Không thể cập nhật số dư.");
        }
    }

    // 2. LỆNH TRỪ TIỀN (PHẠT): !tru @user [số tiền]
    if (command === '!tru' && isAdmin) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);

        if (!target || isNaN(amount) || amount <= 0) return msg.reply("⚠️ **Cú pháp:** `!tru @user [số tiền]`");

        try {
            await updateBalance(target.id, -amount);
            const newBalance = await getBalance(target.id);

            const embed = new EmbedBuilder()
                .setTitle("➖ KHẤU TRỪ TÀI KHOẢN")
                .setColor("#e74c3c") // Đỏ
                .addFields(
                    { name: "👤 Đối tượng", value: `${target}`, inline: true },
                    { name: "💸 Số tiền trừ", value: `\`-${amount.toLocaleString()}\` Cash`, inline: true },
                    { name: "🏦 Số dư còn lại", value: `\`${newBalance.toLocaleString()}\` Cash`, inline: false }
                )
                .setFooter({ text: `Lệnh bởi: ${msg.author.tag}` })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
            sendLog(msg.guild, embed);
        } catch (err) {
            msg.reply("❌ Lỗi khi trừ tiền.");
        }
    }

    // 3. LỆNH THIẾT LẬP LẠI (SET): !setmoney @user [số tiền]
    if (command === '!setmoney' && isAdmin) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);

        if (!target || isNaN(amount) || amount < 0) return msg.reply("⚠️ **Cú pháp:** `!setmoney @user [số tiền]`");

        try {
            await prisma.user.update({
                where: { discordId: target.id },
                data: { balance: amount }
            });

            const embed = new EmbedBuilder()
                .setTitle("⚙️ THIẾT LẬP LẠI SỐ DƯ")
                .setColor("#f1c40f") // Vàng
                .setDescription(`Đã đặt lại toàn bộ số dư của ${target} về mức quy định.`)
                .addFields({ name: "💰 Số dư mới", value: `\`${amount.toLocaleString()}\` Cash` })
                .setFooter({ text: `Quản trị viên: ${msg.author.tag}` })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
            sendLog(msg.guild, embed);
        } catch (err) {
            msg.reply("❌ Lỗi: Người dùng này có thể chưa có trong dữ liệu.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN_ADMIN);

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getBalance, prisma } = require('./shared/economy');

const client = new Client({ intents: [32767] });

// Hàm định dạng tiền tệ chuyên nghiệp
const formatCash = (n) => `**${n.toLocaleString()}** 🪙`;

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!vi')) return;

    try {
        const balance = await getBalance(msg.author.id);
        // Lấy thêm thống kê tổng số kèo đã đặt
        const totalBets = await prisma.bet.count({ where: { discordId: msg.author.id } });

        const embed = new EmbedBuilder()
            .setAuthor({ name: `Hệ Thống Tài Chính Verdict`, iconURL: 'https://i.imgur.com/8E9v69v.png' })
            .setTitle("💳 THÔNG TIN TÀI KHOẢN")
            .setColor(0x00ffcc) // Màu xanh neon
            .setThumbnail(msg.author.displayAvatarURL({ dynamic: true }))
            .setDescription(
                `Chào mừng trở lại, ${msg.author}!\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `💰 **Số dư hiện có:**\n` +
                `> ${formatCash(balance)}\n\n` +
                `📊 **Thống kê hoạt động:**\n` +
                `> 📅 Tổng số đơn cược: \`${totalBets}\` ván\n` +
                `━━━━━━━━━━━━━━━━━━━━`
            )
            .setFooter({ text: "Verdict Casino • Uy tín tạo thương hiệu" })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('view_history')
                .setLabel('Lịch Sử Giao Dịch')
                .setEmoji('📜')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setLabel('Nạp Thêm')
                .setURL('https://your-link.com') // Có thể dẫn link web hoặc kênh nạp
                .setStyle(ButtonStyle.Link)
        );

        msg.reply({ embeds: [embed], components: [row] });
    } catch (e) {
        console.error(e);
        msg.reply("❌ Không thể kết nối đến ngân hàng, thử lại sau!");
    }
});

// --- XỬ LÝ LỊCH SỬ ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== 'view_history') return;

    try {
        const history = await prisma.bet.findMany({
            where: { discordId: interaction.user.id },
            orderBy: { createdAt: 'desc' },
            take: 7 // Tăng lên 7 để nhìn đầy đặn hơn
        });

        const embed = new EmbedBuilder()
            .setAuthor({ name: `Nhật ký đặt cược: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTitle("📜 7 GIAO DỊCH GẦN NHẤT")
            .setColor(0x2f3136); // Màu xám tối chuyên nghiệp

        if (history.length === 0) {
            embed.setDescription("*Bạn chưa có dữ liệu giao dịch nào.*");
        } else {
            let desc = "";
            history.forEach((b, index) => {
                let statusInfo = "";
                let statusColor = "";

                // Tối ưu hiển thị theo trạng thái
                if (b.status === "WIN") {
                    statusInfo = "🟢 **THẮNG** (x1.95)";
                } else if (b.status === "LOSS") {
                    statusInfo = "🔴 **THUA**";
                } else {
                    statusInfo = "🟡 **ĐANG CHỜ...**";
                }

                const time = new Date(b.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                const date = new Date(b.createdAt).toLocaleDateString('vi-VN');

                desc += `**#${index + 1} | ID: \`${b.matchId}\`**\n`;
                desc += `└ Trạng thái: ${statusInfo}\n`;
                desc += `└ Tiền cược: \`${b.amount.toLocaleString()}\` xu • Chọn: \`${b.choice}\`\n`;
                desc += `└ *Thời gian: ${time} - ${date}*\n`;
                desc += `──────────────────\n`;
            });
            embed.setDescription(desc);
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e) {
        await interaction.reply({ content: "⚠️ Có lỗi khi tải lịch sử!", ephemeral: true });
    }
});

const { EmbedBuilder } = require('discord.js');

/**
 * Hàm tạo Embed hiển thị ví tiền chuyên nghiệp
 * @param {Object} user - Dữ liệu người dùng từ Prisma
 * @param {Object} discordUser - Đối tượng User từ Discord.js
 */
async function getWalletEmbed(user, discordUser) {
    // Đảm bảo giá trị luôn là số, nếu null/undefined thì mặc định là 0
    const balance = user?.balance ? Number(user.balance) : 0;
    const profit = user?.profit ? Number(user.profit) : 0;

    return new EmbedBuilder()
        .setTitle("🏦 VERDICT DIGITAL BANKING")
        .setColor("#00FFFF") // Màu xanh Neon Cyberpunk
        .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
        .addFields(
            { 
                name: "👤 CHỦ THẺ:", 
                value: `**${discordUser.username.toUpperCase()}**`, 
                inline: false 
            },
            { 
                name: "💵 SỐ DƯ HIỆN TẠI:", 
                value: `**${balance.toLocaleString()}** VC (Verdict Cash)`, 
                inline: false 
            },
            { 
                name: "📈 LỢI NHUẬN:", 
                value: `**${profit >= 0 ? '+' : ''}${profit.toLocaleString()}** VC`, 
                inline: true 
            },
            { 
                name: "🏛️ TRẠNG THÁI:", 
                value: "🟢 `Đang hoạt động`", 
                inline: true 
            }
        )
        .setImage('https://i.imgur.com/8E9v69v.png') // Bạn có thể thay bằng ảnh banner ngân hàng của bạn
        .setFooter({ text: "Hệ thống thanh toán bảo mật bởi Verdict MySQL", iconURL: discordUser.client.user.displayAvatarURL() })
        .setTimestamp();
}

// Lưu ý: Không khởi tạo new PrismaClient() ở đây để tránh lỗi chồng chéo kết nối
module.exports = { getWalletEmbed };

const { EmbedBuilder } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getWalletEmbed(user, discordUser) {
    const balance = user ? Number(user.balance) : 0;
    const profit = user ? Number(user.profit) : 0;

    return new EmbedBuilder()
        .setTitle("VERDICT DIGITAL BANKING")
        .setColor("#00FFFF")
        .setThumbnail(discordUser.displayAvatarURL())
        .addFields(
            { name: "💳 CHỦ THẺ:", value: `**${discordUser.username.toUpperCase()}**`, inline: false },
            { name: "💵 SỐ DƯ", value: `**${balance.toLocaleString()} Verdict Cash**`, inline: false },
            { name: "📈 TIỀN LỜI", value: `**${profit} VC**`, inline: true },
            { name: "🏛️ TRẠNG THÁI", value: "`Hoạt động`", inline: true }
        )
        .setFooter({ text: "Hệ thống bảo mật Verdict MySQL • Hôm qua lúc 11:09 CH" });
}

module.exports = { getWalletEmbed, prisma };

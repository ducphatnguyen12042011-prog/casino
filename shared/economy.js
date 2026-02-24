const { EmbedBuilder } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function showWallet(interaction, targetUser) {
    const user = await prisma.user.findUnique({ where: { id: targetUser.id } });
    const balance = user ? user.balance.toString() : "0";
    const profit = user ? user.profit.toString() : "0";

    const embed = new EmbedBuilder()
        .setTitle("VERDICT DIGITAL BANKING")
        .setThumbnail(targetUser.displayAvatarURL())
        .setColor("#00FFFF")
        .addFields(
            { name: "💳 CHỦ THẺ:", value: `**${targetUser.username.toUpperCase()}**` },
            { name: "💵 SỐ DƯ", value: `**${balance} Verdict Cash**` },
            { name: "📈 TIỀN LỜI", value: `**${profit} VC**`, inline: true },
            { name: "🏛️ TRẠNG THÁI", value: "`Hoạt động`", inline: true }
        )
        .setFooter({ text: "Hệ thống bảo mật Verdict MySQL" })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

module.exports = { showWallet };

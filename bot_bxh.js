const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { prisma } = require('./shared/economy');
const client = new Client({ intents: [32767] });

client.on('messageCreate', async (msg) => {
    if (msg.content === '!bxh') {
        // Lấy top 10 người giàu nhất
        const topUsers = await prisma.user.findMany({
            take: 10,
            orderBy: { balance: 'desc' }
        });

        const embed = new EmbedBuilder()
            .setTitle("🏆 BẢNG XẾP HẠNG ĐẠI GIA")
            .setColor(0xf1c40f)
            .setThumbnail(client.user.displayAvatarURL());

        let description = "";
        for (let i = 0; i < topUsers.length; i++) {
            const user = topUsers[i];
            description += `**#${i + 1}** | <@${user.discordId}>: \`${user.balance.toLocaleString()}\` Cash\n`;
        }

        embed.setDescription(description || "Chưa có dữ liệu.");
        msg.reply({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_TOKEN_BXH);

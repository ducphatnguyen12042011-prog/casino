const axios = require('axios');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const BET_CHANNEL_ID = "1474793205299155135";
const LIVE_CHANNEL_ID = "1474672512708247582";

// Hàm bổ trợ gửi DM
async function sendDM(user, matchName, choice, amount) {
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle('✅ XÁC NHẬN ĐẶT CƯỢC')
            .setDescription(`Bạn đã đặt cược thành công cho trận đấu:\n**${matchName}**`)
            .addFields(
                { name: 'Lựa chọn', value: choice, inline: true },
                { name: 'Số tiền', value: `${amount.toLocaleString()} VNĐ`, inline: true }
            )
            .setColor('#2ecc71')
            .setTimestamp();
        await user.send({ embeds: [dmEmbed] });
    } catch (e) {
        console.log(`Không thể gửi DM cho ${user.tag}, có thể họ chặn tin nhắn lạ.`);
    }
}

module.exports = {
    // 1. Hàm quét API và đăng kèo (Chạy tự động từ index.js)
    async autoUpdate(client, prisma) {
        try {
            const response = await axios.get('https://api.football-data.org/v4/matches', {
                headers: { 'X-Auth-Token': process.env.FOOTBALL_API_KEY }
            });

            const matches = response.data.matches.filter(m => ['PL', 'PD', 'CL'].includes(m.competition.code));

            for (const match of matches) {
                const startTime = new Date(match.utcDate);
                const diffMinutes = (startTime - Date.now()) / 60000;

                // Còn 60p -> Đăng kèo
                if (diffMinutes <= 60 && diffMinutes > 5) {
                    await this.postBetMessage(client, match);
                }

                // Còn 5p -> Xóa tin nhắn cược, báo Live
                if (diffMinutes <= 5 && diffMinutes > 0) {
                    await this.handleMatchStart(client, match);
                }
            }
        } catch (error) { console.error("Lỗi API cado:", error); }
    },

    // 2. Hàm xử lý khi người dùng bấm nút đặt cược (Lắp vào Interaction)
    async handleInteraction(interaction, prisma) {
        if (!interaction.customId.startsWith('cado_')) return;

        const [prefix, side, matchId, matchName] = interaction.customId.split('_');
        const amount = 50000; // Số tiền cược mặc định hoặc lấy từ args

        const user = await prisma.user.findUnique({ where: { id: interaction.user.id } });
        if (!user || user.balance < amount) {
            return interaction.reply({ content: '❌ Bạn không đủ tiền!', ephemeral: true });
        }

        // Trừ tiền & Lưu DB
        await prisma.user.update({
            where: { id: interaction.user.id },
            data: { balance: { decrement: amount } }
        });

        // Gửi DM xác nhận
        await sendDM(interaction.user, matchName, side.toUpperCase(), amount);

        await interaction.reply({ content: `✅ Đã nhận cược ${side.toUpperCase()}. Kiểm tra tin nhắn riêng (DM)!`, ephemeral: true });
    },

    // 3. Đăng Embed cược vào kênh 1474793205299155135
    async postBetMessage(client, match) {
        const channel = client.channels.cache.get(BET_CHANNEL_ID);
        const matchName = `${match.homeTeam.shortName} vs ${match.awayTeam.shortName}`;
        
        const embed = new EmbedBuilder()
            .setTitle(`⚽ KÈO ${match.competition.name}`)
            .setDescription(`**${match.homeTeam.name}** vs **${match.awayTeam.name}**\nĐóng cược: <t:${Math.floor((new Date(match.utcDate)-300000)/1000)}:R>`)
            .setColor('Blue');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`cado_home_${match.id}_${matchName}`).setLabel(match.homeTeam.shortName).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`cado_draw_${match.id}_${matchName}`).setLabel('Hòa').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`cado_away_${match.id}_${matchName}`).setLabel(match.awayTeam.shortName).setStyle(ButtonStyle.Danger),
        );

        await channel.send({ embeds: [embed], components: [row] });
    }
};

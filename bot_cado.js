const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { getBalance, updateBalance, prisma } = require('./shared/economy');
const axios = require('axios');

const client = new Client({ intents: [32767] });
const API_KEY = process.env.FOOTBALL_API_KEY;
const ID_BONG_DA = "1474793205299155135";

// --- HÀM HELPER: LẤY ICON TRẠNG THÁI ---
const getStatusInfo = (status, matchTime) => {
    const now = Date.now();
    const diff = (matchTime - now) / 60000;

    if (status === "IN_PLAY") return { txt: "🔴 ĐANG DIỄN BIẾN", color: 0xff4757, lock: true };
    if (status === "PAUSED") return { txt: "☕ NGHỈ HIỆP", color: 0xffa502, lock: true };
    if (diff <= 5 && diff > 0) return { txt: "⏳ SẮP ĐÁ (KHÓA CƯỢC)", color: 0xfeca57, lock: true };
    if (diff <= 0) return { txt: "🔒 ĐÃ ĐÓNG CỬA", color: 0x576574, lock: true };
    return { txt: "🟢 ĐANG MỞ CƯỢC", color: 0x2ed573, lock: false };
};

// --- 1. SCOREBOARD SIÊU CẤP (2 PHÚT/LẦN) ---
setInterval(async () => {
    const channel = await client.channels.fetch(ID_BONG_DA);
    if (!channel) return;

    try {
        const res = await axios.get("https://api.football-data.org/v4/matches", { headers: {"X-Auth-Token": API_KEY} });
        const matches = res.data.matches.filter(m => ["TIMED", "IN_PLAY", "PAUSED"].includes(m.status)).slice(0, 5);

        const messages = await channel.messages.fetch({ limit: 15 });
        const botMsgs = messages.filter(m => m.author.id === client.user.id);
        if (botMsgs.size > 0) await channel.bulkDelete(botMsgs);

        for (const m of matches) {
            const mTime = new Date(m.utcDate).getTime();
            const status = getStatusInfo(m.status, mTime);
            
            // Giả lập kèo (Bạn có thể thay bằng !setkeo từ Admin)
            const hcap = 0.5; 
            const total = 2.5;

            const embed = new EmbedBuilder()
                .setAuthor({ name: m.competition.name, iconURL: m.competition.emblem })
                .setTitle(`🏟️ ${m.homeTeam.name} vs ${m.awayTeam.name}`)
                .setColor(status.color)
                .setThumbnail(m.homeTeam.crest)
                .setDescription(
                    `📊 **Tỉ số:** \` ${m.score.fullTime.home ?? 0} - ${m.score.fullTime.away ?? 0} \`\n` +
                    `⏰ **Khởi tranh:** <t:${Math.floor(mTime / 1000)}:R>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `🔹 **KÈO CHẤP (Handicap)**\n` +
                    `└ Chủ (${m.homeTeam.shortName}): \`+${hcap}\` | Khách: \`-${hcap}\`\n\n` +
                    `🔸 **KÈO TÀI XỈU (O/U)**\n` +
                    `└ Tài: \`>${total}\` | Xỉu: \`<${total}\`\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📢 **Trạng thái:** ${status.txt}`
                )
                .setFooter({ text: `Verdict Betting System • ID: ${m.id}` })
                .setTimestamp();

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bet_home_${m.id}_${hcap}`).setLabel(`Chủ: ${m.homeTeam.shortName}`).setStyle(ButtonStyle.Primary).setDisabled(status.lock),
                new ButtonBuilder().setCustomId(`bet_away_${m.id}_${-hcap}`).setLabel(`Khách: ${m.awayTeam.shortName}`).setStyle(ButtonStyle.Danger).setDisabled(status.lock)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bet_over_${m.id}_${total}`).setLabel('Đặt Tài (Over)').setStyle(ButtonStyle.Success).setDisabled(status.lock),
                new ButtonBuilder().setCustomId(`bet_under_${m.id}_${total}`).setLabel('Đặt Xỉu (Under)').setStyle(ButtonStyle.Secondary).setDisabled(status.lock)
            );

            await channel.send({ embeds: [embed], components: [row1, row2] });
        }
    } catch (e) { console.error("Lỗi cập nhật bảng kèo."); }
}, 120000);

// --- 2. XỬ LÝ MODAL & GỬI VÉ DM ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith('bet_')) {
        const [_, type, matchId, val] = interaction.customId.split('_');
        
        const modal = new ModalBuilder()
            .setCustomId(`modal_${type}_${matchId}_${val}`)
            .setTitle('🎫 XÁC NHẬN PHIẾU CƯỢC');

        const input = new TextInputBuilder()
            .setCustomId('amt')
            .setLabel('Số tiền cược (Cash)')
            .setPlaceholder('Nhập số tiền bạn muốn đầu tư...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_')) {
        const [_, type, matchId, val] = interaction.customId.split('_');
        const amount = parseInt(interaction.fields.getTextInputValue('amt'));

        // Kiểm tra an ninh giây cuối (Dưới 5 phút không cho cược)
        const res = await axios.get(`https://api.football-data.org/v4/matches/${matchId}`, { headers: {"X-Auth-Token": API_KEY} });
        const m = res.data;
        if ((new Date(m.utcDate).getTime() - Date.now()) / 60000 <= 5) {
            return interaction.reply({ content: "❌ Trận đấu đã vào khung giờ khóa (trước 5 phút), không thể đặt cược!", ephemeral: true });
        }

        const balance = await getBalance(interaction.user.id);
        if (balance < amount) return interaction.reply({ content: "❌ Số dư của bạn không đủ!", ephemeral: true });

        await updateBalance(interaction.user.id, -amount);
        await prisma.bet.create({
            data: { discordId: interaction.user.id, matchId: parseInt(matchId), amount, choice: type.toUpperCase(), hcap: parseFloat(val) }
        });

        const ticket = new EmbedBuilder()
            .setTitle("🎫 VÉ CƯỢC THÀNH CÔNG")
            .setColor(0x2ecc71)
            .setThumbnail('https://i.imgur.com/vHpxX96.png')
            .addFields(
                { name: "🏟️ Trận", value: `ID \`${matchId}\``, inline: true },
                { name: "🎯 Cửa", value: `\`${type.toUpperCase()}\``, inline: true },
                { name: "⚖️ Kèo", value: `\`${val}\``, inline: true },
                { name: "💰 Tiền cược", value: `\`${amount.toLocaleString()}\` Cash`, inline: true }
            )
            .setFooter({ text: "Hệ thống sẽ tự động trả thưởng khi trận đấu kết thúc." });

        await interaction.reply({ content: "✅ Đã ghi nhận vé cược! Check DM để xem chi tiết.", ephemeral: true });
        interaction.user.send({ embeds: [ticket] }).catch(() => {});
    }
});

client.login(process.env.DISCORD_TOKEN_CADO);

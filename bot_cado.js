const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getBalance, updateBalance, prisma } = require('./shared/economy');
const axios = require('axios');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const API_KEY = process.env.FOOTBALL_API_KEY;
const ID_BONG_DA = "1474793205299155135";

// --- HELPER: Định dạng số ---
const formatMoney = (n) => n.toLocaleString() + " 🪙";

// --- 1. VÒNG LẶP CẬP NHẬT SCOREBOARD (NÂNG CẤP GIAO DIỆN) ---
setInterval(async () => {
    const channel = await client.channels.fetch(ID_BONG_DA);
    if (!channel) return;

    try {
        const res = await axios.get("https://api.football-data.org/v4/matches", { headers: {"X-Auth-Token": API_KEY} });
        // Lấy các trận sắp đá (TIMED) hoặc đang đá (IN_PLAY)
        const activeMatches = res.data.matches
            .filter(m => ["IN_PLAY", "TIMED", "PAUSED"].includes(m.status))
            .slice(0, 5);

        // Xóa tin cũ (Tối ưu: Chỉ xóa tin của Bot)
        const messages = await channel.messages.fetch({ limit: 20 });
        const botMsgs = messages.filter(m => m.author.id === client.user.id);
        if (botMsgs.size > 0) await channel.bulkDelete(botMsgs).catch(() => {});

        for (const m of activeMatches) {
            const isLive = m.status === "IN_PLAY" || m.status === "PAUSED";
            const isLocked = isLive; // Khóa cược khi đang đá (hoặc trước 5p tùy bạn)
            const hcap = 0.5; 

            const embed = new EmbedBuilder()
                .setAuthor({ name: `🏆 ${m.competition.name}`, iconURL: m.competition.emblem })
                .setTitle(`${m.homeTeam.name}  vs  ${m.awayTeam.name}`)
                .setColor(isLive ? "#ff4757" : "#2ecc71")
                .setThumbnail('https://i.imgur.com/8E9v69v.png') // Thay bằng icon bóng đá của bạn
                .setDescription(
                    `✨ **TRẠNG THÁI:** ${isLive ? "🔴 **LIVE**" : "⏳ SẮP ĐÁ"}\n` +
                    `📅 **GIỜ ĐÁ:** \`${new Date(m.utcDate).toLocaleString('vi-VN')}\`\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `🏠 **${m.homeTeam.name.toUpperCase()}**\n` +
                    `🔹 Tỷ số: \`${m.score.fullTime.home ?? 0}\` | Handicap: \`+${hcap}\`\n\n` +
                    `✈️ **${m.awayTeam.name.toUpperCase()}**\n` +
                    `🔹 Tỷ số: \`${m.score.fullTime.away ?? 0}\` | Handicap: \`-${hcap}\`\n` +
                    `━━━━━━━━━━━━━━━━━━━━`
                )
                .setFooter({ text: `🆔 Match ID: ${m.id} • Tỷ lệ ăn: x1.95` })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`bet_home_${m.id}_${m.homeTeam.shortName}`)
                    .setLabel(`Cược ${m.homeTeam.shortName}`)
                    .setEmoji('🏠')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(isLocked),
                new ButtonBuilder()
                    .setCustomId(`bet_away_${m.id}_${m.awayTeam.shortName}`)
                    .setLabel(`Cược ${m.awayTeam.shortName}`)
                    .setEmoji('✈️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(isLocked)
            );

            await channel.send({ embeds: [embed], components: [row] });
        }
    } catch (e) { console.error("Lỗi Scoreboard:", e.message); }
}, 120000);

// --- 2. XỬ LÝ SỰ KIỆN (INTERACTION) ---
client.on('interactionCreate', async (interaction) => {
    
    // --- BẤM NÚT CƯỢC ---
    if (interaction.isButton() && interaction.customId.startsWith('bet_')) {
        const [_, side, matchId, teamName] = interaction.customId.split('_');
        const userBalance = await getBalance(interaction.user.id);

        const modal = new ModalBuilder()
            .setCustomId(`modal_bet_${matchId}_${side}`)
            .setTitle(`🎫 VÉ CƯỢC: ${teamName.toUpperCase()}`);

        const amountInput = new TextInputBuilder()
            .setCustomId('bet_amount')
            .setLabel(`Số tiền (Ví dư: ${userBalance.toLocaleString()} xu)`)
            .setPlaceholder("Nhập số tiền muốn đặt cược...")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(10)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await interaction.showModal(modal);
    }

    // --- SUBMIT MODAL ---
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_bet_')) {
        const [_, __, matchId, side] = interaction.customId.split('_');
        const amount = parseInt(interaction.fields.getTextInputValue('bet_amount'));

        if (isNaN(amount) || amount < 1000) {
            return interaction.reply({ content: "❌ Số tiền cược tối thiểu là 1,000 xu!", ephemeral: true });
        }

        const balance = await getBalance(interaction.user.id);
        if (balance < amount) {
            return interaction.reply({ content: `❌ Bạn không đủ tiền! (Hiện có: ${formatMoney(balance)})`, ephemeral: true });
        }

        // Thực hiện giao dịch
        await updateBalance(interaction.user.id, -amount);
        await prisma.bet.create({
            data: {
                discordId: interaction.user.id,
                matchId: parseInt(matchId),
                amount: amount,
                choice: side === "home" ? "HOME_TEAM" : "AWAY_TEAM",
                status: "PENDING"
            }
        });

        const successEmbed = new EmbedBuilder()
            .setAuthor({ name: "XÁC NHẬN ĐẶT CƯỢC", iconURL: interaction.user.displayAvatarURL() })
            .setColor("#2ecc71")
            .setDescription(
                `🏁 **Trạng thái:** Đã nhận kèo\n` +
                `🏟️ **Match ID:** \`${matchId}\`\n` +
                `🚩 **Lựa chọn:** \`${side === 'home' ? 'Đội Nhà' : 'Đội Khách'}\`\n` +
                `💰 **Tiền cược:** \`${formatMoney(amount)}\`\n` +
                `📉 **Số dư còn lại:** ${formatMoney(balance - amount)}`
            )
            .setFooter({ text: "Chúc bạn may mắn! 🍀" });

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN_CADO);

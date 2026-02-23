const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// --- CẤU HÌNH BIẾN MÔI TRƯỜNG ---
const TOKEN = process.env.BOT_TOKEN_CADO;
const CHANNEL_BET_ID = '1474793205299155135'; 

// --- 1. GIAO DIỆN EMBED (PREMIUM STYLE) ---
const createMatchEmbed = (m) => {
    return new EmbedBuilder()
        .setAuthor({ name: m.league, iconURL: m.leagueLogo })
        .setTitle(`🏟️ ${m.homeTeam} vs ${m.awayTeam}`)
        .setThumbnail(m.homeLogo)
        .setColor(0x2ecc71)
        .setDescription(
            `📊 **Tỉ số:** \` ${m.score} \`\n` +
            `⏰ **Khởi tranh:** ${m.startTime}\n` +
            `---------------------------\n` +
            `🔹 **KÈO CHẤP (Handicap)**\n` +
            `└ Chủ (${m.homeShort}): \`${m.hcapHome}\` | Khách: \`${m.hcapAway}\`\n\n` +
            `🔸 **KÈO TÀI XỈU (O/U)**\n` +
            `└ Tài: \`>${m.ouLine}\` | Xỉu: \`<${m.ouLine}\`\n` +
            `---------------------------\n` +
            `📢 **Trạng thái:** 🟢 ĐANG MỞ CƯỢC`
        )
        .setFooter({ text: `Verdict Betting System • ID: ${m.matchId} • ${new Date().toLocaleTimeString('vi-VN')}` });
};

const createButtons = (m) => {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bet_home_${m.matchId}`).setLabel(`Chủ: ${m.homeShort}`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`bet_away_${m.matchId}`).setLabel(`Khách: ${m.awayShort}`).setStyle(ButtonStyle.Danger)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bet_over_${m.matchId}`).setLabel('Đặt Tài (Over)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`bet_under_${m.matchId}`).setLabel('Đặt Xỉu (Under)').setStyle(ButtonStyle.Secondary)
        )
    ];
};

// --- 2. HỆ THỐNG DM VÉ CƯỢC & THÔNG BÁO THẮNG ---
async function sendTicketDM(user, data) {
    const embed = new EmbedBuilder()
        .setTitle("🧾 VÉ CƯỢC HỆ THỐNG - VERDICT")
        .setColor(0xf1c40f)
        .addFields(
            { name: "🆔 Match ID", value: `\`#${data.matchId}\``, inline: true },
            { name: "⚽ Cửa đặt", value: `**${data.side.toUpperCase()}**`, inline: true },
            { name: "💰 Tiền cược", value: `\`${data.amount.toLocaleString()}\` xu`, inline: true }
        )
        .setFooter({ text: "Chúc bạn may mắn! Tiền thắng sẽ tự động cộng vào ví." });
    await user.send({ embeds: [embed] }).catch(() => null);
}

async function sendWinNotify(userId, matchId, winAmount) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    const embed = new EmbedBuilder()
        .setTitle("🎊 CHÚC MỪNG: BẠN ĐÃ THẮNG CƯỢC!")
        .setColor(0x2ecc71)
        .setDescription(`Trận **#${matchId}** đã có kết quả!\n🏆 Tiền thưởng: **+${winAmount.toLocaleString()} xu** (đã cộng vào ví).`)
        .setTimestamp();
    await user.send({ embeds: [embed] }).catch(() => null);
}

// --- 3. XỬ LÝ TƯƠNG TÁC (MODAL & BETTING) ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        const [_, side, matchId] = interaction.customId.split('_');
        const modal = new ModalBuilder().setCustomId(`modal_${side}_${matchId}`).setTitle(`🎫 ĐẶT CƯỢC: ${side.toUpperCase()}`);
        const input = new TextInputBuilder().setCustomId('amount').setLabel('SỐ TIỀN CƯỢC').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
        const [_, side, matchId] = interaction.customId.split('_');
        const amount = parseInt(interaction.fields.getTextInputValue('amount').replace(/\D/g, ''));

        if (isNaN(amount) || amount < 10000) return interaction.reply({ content: "❌ Cược tối thiểu 10,000 xu!", ephemeral: true });

        try {
            const user = await prisma.user.findUnique({ where: { id: interaction.user.id } });
            if (!user || user.coins < amount) return interaction.reply({ content: "❌ Bạn không đủ tiền!", ephemeral: true });

            await prisma.$transaction([
                prisma.user.update({ where: { id: interaction.user.id }, data: { coins: { decrement: amount } } }),
                prisma.bet.create({ data: { userId: interaction.user.id, matchId, side, amount, status: 'PENDING' } })
            ]);

            await interaction.reply({ content: `✅ Cược thành công! Kiểm tra DM để nhận vé.`, ephemeral: true });
            await sendTicketDM(interaction.user, { matchId, side, amount });
        } catch (e) { console.error(e); }
    }
});

// --- 4. HÀM QUYẾT TOÁN TỰ ĐỘNG (PREMIUM) ---
async function settleMatch(matchId, scoreHome, scoreAway, hcap, ouLine) {
    const bets = await prisma.bet.findMany({ where: { matchId: matchId, status: 'PENDING' } });
    for (const bet of bets) {
        let isWin = false;
        const diff = scoreHome - scoreAway;
        const total = scoreHome + scoreAway;

        if (bet.side === 'home' && (diff + hcap) > 0) isWin = true;
        else if (bet.side === 'away' && (scoreAway - scoreHome + hcap) > 0) isWin = true;
        else if (bet.side === 'over' && total > ouLine) isWin = true;
        else if (bet.side === 'under' && total < ouLine) isWin = true;

        if (isWin) {
            const winAmt = Math.floor(bet.amount * 1.95);
            await prisma.user.update({ where: { id: bet.userId }, data: { coins: { increment: winAmt } } });
            await prisma.bet.update({ where: { id: bet.id }, data: { status: 'WIN' } });
            await sendWinNotify(bet.userId, matchId, winAmt);
        } else {
            await prisma.bet.update({ where: { id: bet.id }, data: { status: 'LOSS' } });
        }
    }
}

// --- ADMIN COMMAND ĐĂNG TRẬN ---
client.on('messageCreate', async (msg) => {
    if (msg.content === '!postmatch' && msg.member.permissions.has('Administrator')) {
        const demo = {
            matchId: "545899", league: "Primeira Liga", homeTeam: "FC Famalicão", homeShort: "Famalicão",
            awayTeam: "Casa Pia AC", awayShort: "Casa Pia", score: "0 - 0", startTime: "5 giờ tới",
            hcapHome: "+0.5", hcapAway: "-0.5", ouLine: "2.5", 
            leagueLogo: "https://i.imgur.com/8QO7Z6u.png", homeLogo: "https://i.imgur.com/VpT6zS2.png"
        };
        await msg.channel.send({ embeds: [createMatchEmbed(demo)], components: createButtons(demo) });
    }
});

client.login(TOKEN);

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// ĐÃ DÁN SẴN ID CHANNEL CỦA BẠN TẠI ĐÂY
const CHANNEL_ID = '1475439630274007121'; 

let game = {
    session: 934047n,
    isOpening: false,
    timeLeft: 40,
    totalTai: 0,
    totalXiu: 0,
    history: [],
    bets: new Map(),
    mainMsg: null,
    timerInterval: null
};

const balances = new Map();
const getBalance = (id) => balances.get(id) || 10000000;
const updateBalance = (id, amt) => balances.set(id, getBalance(id) + amt);

function createEmbed(status = 'playing') {
    const timeEmoji = game.timeLeft <= 10 ? '🧨' : '⏳';
    const statusText = status === 'playing' ? '🟢 ĐANG NHẬN CƯỢC' : '🔒 ĐÃ KHÓA CƯỢC';
    
    return new EmbedBuilder()
        .setAuthor({ name: `💎 TÀI XỈU CASINO - PHIÊN #${game.session.toString()}`, iconURL: 'https://i.imgur.com/8QO7Z6u.png' })
        .setColor(status === 'playing' ? '#f1c40f' : '#e74c3c')
        .setDescription(
            `### ${timeEmoji} THỜI GIAN: \`${game.timeLeft}S\`\n` +
            `> **TRẠNG THÁI:** ${statusText}\n\n` +
            `🏆 **HŨ RỒNG:** \`50,000,000\` xu\n` +
            `──────────────────────────\n` +
            `🔴 **TỔNG TÀI:** \`${game.totalTai.toLocaleString()}\` xu\n` +
            `⚪ **TỔNG XỈU:** \`${game.totalXiu.toLocaleString()}\` xu\n` +
            `──────────────────────────\n` +
            `**📊 SOI CẦU GẦN NHẤT:**\n` +
            `${game.history.slice(-10).map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ') || 'Chưa có dữ liệu'}\n` +
            `──────────────────────────`
        );
}

function createRows(disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bet_tai').setLabel('ĐẶT TÀI').setStyle(ButtonStyle.Danger).setDisabled(disabled),
        new ButtonBuilder().setCustomId('bet_xiu').setLabel('ĐẶT XỈU').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('view_history').setLabel('📊 SOI CẦU').setStyle(ButtonStyle.Secondary)
    )];
}

async function startRound() {
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (!channel) return;

    if (game.timerInterval) clearInterval(game.timerInterval);
    game.isOpening = true;
    game.timeLeft = 40;
    game.totalTai = 0;
    game.totalXiu = 0;
    game.bets.clear();
    game.session++;

    game.mainMsg = await channel.send({ embeds: [createEmbed()], components: createRows() });

    game.timerInterval = setInterval(async () => {
        game.timeLeft -= 2; 
        if (game.timeLeft > 5) {
            await game.mainMsg.edit({ embeds: [createEmbed()] }).catch(() => {});
        } else if (game.timeLeft <= 5 && game.timeLeft > 0) {
            game.isOpening = false;
            await game.mainMsg.edit({ embeds: [createEmbed('locked')], components: createRows(true) }).catch(() => {});
        } else if (game.timeLeft <= 0) {
            clearInterval(game.timerInterval);
            handleResult();
        }
    }, 2000); // 2s cập nhật 1 lần để chống đứng bot
}

async function handleResult() {
    const d = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    const total = d[0] + d[1] + d[2];
    const result = total >= 11 ? 'tai' : 'xiu';

    const resultEmbed = new EmbedBuilder()
        .setTitle(result === 'tai' ? "🔴 KẾT QUẢ: TÀI" : "⚪ KẾT QUẢ: XỈU")
        .setColor(result === 'tai' ? '#ED4245' : '#5865F2')
        .setDescription(`📊 **Phiên #${game.session}**\n──────────────────\n🎲 **Kết quả:** \`${d[0]} - ${d[1]} - ${d[2]}\`\n🏁 **Tổng điểm:** \`${total}.0\`\n──────────────────`);

    for (let [uId, bet] of game.bets) {
        if (bet.side === result) {
            updateBalance(uId, bet.amount * 1.95);
            game.mainMsg.channel.send({ content: `🥳 <@${uId}> thắng **+${(bet.amount * 1.95).toLocaleString()}** xu!` });
        } else {
            game.mainMsg.channel.send({ content: `😤 <@${uId}> thua **-${bet.amount.toLocaleString()}** xu!` });
        }
    }

    game.history.push({ result });
    await game.mainMsg.edit({ embeds: [resultEmbed], components: [] });
    setTimeout(() => startRound(), 10000);
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId === 'view_history') {
            const historyStr = game.history.slice(-15).map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ');
            return interaction.reply({ content: `📊 **LỊCH SỬ:** ${historyStr || 'Trống'}`, ephemeral: true });
        }
        if (!game.isOpening) return interaction.reply({ content: '❌ Đã khóa cược!', ephemeral: true });

        const currentBet = game.bets.get(interaction.user.id);
        if (currentBet) {
            if (interaction.customId === 'bet_tai' && currentBet.side === 'xiu') return interaction.reply({ content: '❌ Bạn đang cược Xỉu!', ephemeral: true });
            if (interaction.customId === 'bet_xiu' && currentBet.side === 'tai') return interaction.reply({ content: '❌ Bạn đang cược Tài!', ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId(`modal_${interaction.customId}`).setTitle('VÀO TIỀN');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('money').setLabel("Số tiền cược").setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true }); // Khắc phục lỗi không đặt được tiền
        const inputAmt = parseInt(interaction.fields.getTextInputValue('money').replace(/,/g, ''));
        if (isNaN(inputAmt) || inputAmt < 1000) return interaction.editReply('❌ Tiền không hợp lệ!');
        if (getBalance(interaction.user.id) < inputAmt) return interaction.editReply('💸 Không đủ xu!');

        updateBalance(interaction.user.id, -inputAmt);
        const side = interaction.customId === 'modal_bet_tai' ? 'tai' : 'xiu';
        let uBet = game.bets.get(interaction.user.id) || { side: side, amount: 0 };
        uBet.amount += inputAmt;
        if (side === 'tai') game.totalTai += inputAmt; else game.totalXiu += inputAmt;
        game.bets.set(interaction.user.id, uBet);
        return interaction.editReply(`✅ Đã cược **${inputAmt.toLocaleString()}** vào **${side.toUpperCase()}**`);
    }
});

client.once('ready', () => { startRound(); });

// Tự động lấy Token từ biến môi trường của Railway
client.login(process.env.BOT_TOKEN).catch(err => console.error("❌ Lỗi Token Railway:", err.message));

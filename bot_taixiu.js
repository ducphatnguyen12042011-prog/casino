const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const CHANNEL_ID = '1475439630274007121';
let sessionID = 934045n; 
let gameStatus = {
    isOpening: false,
    timeLeft: 40,
    history: [], 
    currentBets: new Map(), 
    totalTai: 0,
    totalXiu: 0,
    mainMsg: null,
    timerInterval: null
};

const userBalances = new Map();
const getBalance = (id) => userBalances.get(id) || 10000000;
const updateBalance = (id, amt) => userBalances.set(id, getBalance(id) + amt);

// Embed chính thiết kế cực xịn
function createMainEmbed(status = 'playing') {
    const timeEmoji = gameStatus.timeLeft <= 10 ? '🧨' : '⏳';
    const statusText = status === 'playing' ? '🟢 ĐANG NHẬN CƯỢC' : '🔴 ĐÃ KHÓA CƯỢC';
    
    return new EmbedBuilder()
        .setAuthor({ name: `CASINO ROYAL - PHIÊN #${sessionID.toString()}`, iconURL: 'https://cdn-icons-png.flaticon.com/512/1055/1055823.png' })
        .setColor(status === 'playing' ? '#FFD700' : '#FF0000')
        .setDescription(
            `### ${timeEmoji} THỜI GIAN: \`${gameStatus.timeLeft}S\`\n` +
            `> **TRẠNG THÁI:** \`${statusText}\`\n` +
            `──────────────────────────\n` +
            `**🔴 TỔNG TÀI:** \`${gameStatus.totalTai.toLocaleString()}\` xu\n` +
            `**⚪ TỔNG XỈU:** \`${gameStatus.totalXiu.toLocaleString()}\` xu\n` +
            `──────────────────────────\n` +
            `**📊 SOI CẦU (8 PHIÊN):**\n` +
            `\`${gameStatus.history.slice(-8).map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ') || 'Đang cập nhật...'}\`\n` +
            `──────────────────────────`
        )
        .setFooter({ text: '⚠️ Lưu ý: Mỗi phiên chỉ được đặt vào 1 cửa duy nhất' });
}

function createButtons(disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bet_tai').setLabel('ĐẶT TÀI').setStyle(ButtonStyle.Danger).setDisabled(disabled),
        new ButtonBuilder().setCustomId('bet_xiu').setLabel('ĐẶT XỈU').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('show_soicau').setLabel('📊 SOI CẦU').setStyle(ButtonStyle.Secondary)
    )];
}

async function startRound() {
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (!channel) return;
    
    if (gameStatus.timerInterval) clearInterval(gameStatus.timerInterval);
    gameStatus.isOpening = true;
    gameStatus.timeLeft = 40; 
    gameStatus.totalTai = 0;
    gameStatus.totalXiu = 0;
    gameStatus.currentBets.clear();
    sessionID++;

    gameStatus.mainMsg = await channel.send({ embeds: [createMainEmbed()], components: createButtons() });

    gameStatus.timerInterval = setInterval(async () => {
        gameStatus.timeLeft--;
        
        if (gameStatus.timeLeft > 5) {
            await gameStatus.mainMsg.edit({ embeds: [createMainEmbed()] }).catch(() => {});
        } else if (gameStatus.timeLeft === 5) {
            gameStatus.isOpening = false; // Khóa cược ngay lập tức
            await gameStatus.mainMsg.edit({ embeds: [createMainEmbed('locking')], components: createButtons(true) }).catch(() => {});
        } else if (gameStatus.timeLeft <= 0) {
            clearInterval(gameStatus.timerInterval);
            processResult();
        }
    }, 1200);
}

async function processResult() {
    const d = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    const total = d[0] + d[1] + d[2];
    const result = total >= 11 ? 'tai' : 'xiu';
    const isJackpot = (d[0] === d[1] && d[1] === d[2]) && (d[0] === 1 || d[0] === 6);

    const resultEmbed = new EmbedBuilder()
        .setTitle(result === 'tai' ? "🔴 KẾT QUẢ: TÀI" : "⚪ KẾT QUẢ: XỈU")
        .setColor(result === 'tai' ? '#ED4245' : '#5865F2')
        .setDescription(
            `📊 **Phiên #${sessionID.toString()}**\n` +
            `──────────────────────────\n` +
            `**Kết quả lần lượt là:**\n` +
            `🎲 **Xí ngầu 1:** \`${d[0]}\` 🍓\n` +
            `🎲 **Xí ngầu 2:** \`${d[1]}\` 🍓\n` +
            `🎲 **Xí ngầu 3:** \`${d[2]}\` 🍓\n` +
            `🏁 **Tổng điểm:** \`${total}.0\`\n` +
            `──────────────────────────`
        );

    for (let [uId, bet] of gameStatus.currentBets) {
        const betAmount = result === 'tai' ? bet.tai : bet.xiu;
        const loseAmount = result === 'tai' ? bet.xiu : bet.tai;
        const user = await client.users.fetch(uId);

        if (betAmount > 0) {
            let prize = isJackpot ? (betAmount * 5) : (betAmount * 1.95);
            updateBalance(uId, prize);
            const winMsg = new EmbedBuilder().setTitle("🥳 THẮNG RỒI! 🥳").setColor('#2ecc71')
                .setDescription(`Chúc mừng **${user.username}**!\n💰 **Thắng:** \`${prize.toLocaleString()}\` xu\n──────────────────\n*CONFIG BY LIGHTSV*`);
            gameStatus.mainMsg.channel.send({ content: `<@${uId}>`, embeds: [winMsg] });
        } else if (loseAmount > 0) {
            const loseMsg = new EmbedBuilder().setTitle("😤 THUA RỒI! 😤").setColor('#e74c3c')
                .setDescription(`Đen thôi đỏ quên đi, **${user.username}**!\n💸 **Thua:** \`${loseAmount.toLocaleString()}\` xu\n──────────────────\n*CONFIG BY LIGHTSV*`);
            gameStatus.mainMsg.channel.send({ content: `<@${uId}>`, embeds: [loseMsg] });
        }
    }

    gameStatus.history.push({ result });
    await gameStatus.mainMsg.edit({ embeds: [resultEmbed] });
    setTimeout(() => startRound(), 10000);
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId === 'show_soicau') {
            const stats = gameStatus.history.slice(-15).map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ');
            return interaction.reply({ content: `📊 **Lịch sử 15 phiên gần nhất:**\n${stats || 'Chưa có dữ liệu'}`, ephemeral: true });
        }

        if (!gameStatus.isOpening) return interaction.reply({ content: '❌ Phiên đã khóa cược!', ephemeral: true });
        
        // Chặn cược 2 đầu
        const userBet = gameStatus.currentBets.get(interaction.user.id);
        if (userBet) {
            if (interaction.customId === 'bet_tai' && userBet.xiu > 0) return interaction.reply({ content: '❌ Bạn đã đặt **XỈU**, không thể đặt **TÀI** phiên này!', ephemeral: true });
            if (interaction.customId === 'bet_xiu' && userBet.tai > 0) return interaction.reply({ content: '❌ Bạn đã đặt **TÀI**, không thể đặt **XỈU** phiên này!', ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId(`modal_${interaction.customId}`).setTitle('NHẬP TIỀN CƯỢC');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('money_input').setLabel("Số tiền cược (Tối thiểu 1,000)").setStyle(TextInputStyle.Short).setPlaceholder('10000').setRequired(true)
        ));
        await interaction.showModal(modal).catch(() => {});
    }

    if (interaction.isModalSubmit()) {
        const amount = parseInt(interaction.fields.getTextInputValue('money_input').replace(/,/g, ''));
        if (isNaN(amount) || amount < 1000) return interaction.reply({ content: '❌ Tiền cược không hợp lệ!', ephemeral: true });
        if (getBalance(interaction.user.id) < amount) return interaction.reply({ content: '💸 Số dư không đủ!', ephemeral: true });

        updateBalance(interaction.user.id, -amount);
        const type = interaction.customId === 'modal_bet_tai' ? 'tai' : 'xiu';
        let uBet = gameStatus.currentBets.get(interaction.user.id) || { tai: 0, xiu: 0 };
        
        if (type === 'tai') { uBet.tai += amount; gameStatus.totalTai += amount; } 
        else { uBet.xiu += amount; gameStatus.totalXiu += amount; }
        
        gameStatus.currentBets.set(interaction.user.id, uBet);
        return interaction.reply({ content: `✅ Bạn đã cược thêm **${amount.toLocaleString()}** vào cửa **${type.toUpperCase()}**`, ephemeral: true });
    }
});

client.once('ready', () => { console.log(`🚀 BOT TÀI XỈU ULTIMATE ĐÃ SẴN SÀNG!`); startRound(); });
client.login('TOKEN_CỦA_BẠN');

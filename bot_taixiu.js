const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const CHANNEL_ID = '1475439630274007121';
let sessionID = 934044n; // ID phiên bắt đầu
let gameStatus = {
    isOpening: false,
    timeLeft: 40,
    history: [], 
    currentBets: new Map(), 
    totalTai: 0,
    totalXiu: 0,
    mainMsg: null
};

// Hệ thống ví giả lập
const userBalances = new Map();
const getBalance = (id) => userBalances.get(id) || 10000000;
const updateBalance = (id, amt) => userBalances.set(id, getBalance(id) + amt);

// Hàm tạo bảng Soi Cầu chi tiết
function generateDetailedSoiCau() {
    if (gameStatus.history.length === 0) return "📊 Hiện chưa có dữ liệu phiên.";
    const last20 = gameStatus.history.slice(-20);
    const icons = last20.map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ');
    const countTai = gameStatus.history.filter(h => h.result === 'tai').length;
    const countXiu = gameStatus.history.filter(h => h.result === 'xiu').length;
    return `📑 **BẢNG SOI CẦU CHI TIẾT**\n────────────────────\n${icons}\n────────────────────\n📊 Thống kê: 🔴 Tài \`${countTai}\` | ⚪ Xỉu \`${countXiu}\``;
}

// Embed Giao diện chính - Sạch sẽ & Không lỗi ảnh
function createMainEmbed(status = 'playing') {
    const timeEmoji = gameStatus.timeLeft <= 10 ? '🧨' : '⏳';
    return new EmbedBuilder()
        .setAuthor({ name: `💎 TÀI XỈU CASINO - PHIÊN #${sessionID.toString()}`, iconURL: 'https://cdn-icons-png.flaticon.com/512/1055/1055823.png' })
        .setColor(status === 'playing' ? '#f1c40f' : '#e74c3c')
        .setDescription(
            `### ${timeEmoji} THỜI GIAN CÒN LẠI: \`${gameStatus.timeLeft}S\`\n` +
            `────────────────────\n` +
            `**🔴 TỔNG TÀI:** \`${gameStatus.totalTai.toLocaleString()}\` xu\n` +
            `**⚪ TỔNG XỈU:** \`${gameStatus.totalXiu.toLocaleString()}\` xu\n` +
            `────────────────────\n` +
            `**📊 SOI CẦU GẦN NHẤT:**\n` +
            `\`${gameStatus.history.slice(-8).map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ') || 'Chưa có dữ liệu'}\`\n` +
            `────────────────────`
        )
        .setFooter({ text: '💡 Bấm nút để đặt cược hoặc xem soi cầu' });
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
    
    gameStatus.isOpening = true;
    gameStatus.timeLeft = 40; 
    gameStatus.totalTai = 0;
    gameStatus.totalXiu = 0;
    gameStatus.currentBets.clear();
    sessionID++;

    gameStatus.mainMsg = await channel.send({ embeds: [createMainEmbed()], components: createButtons() });

    const timer = setInterval(async () => {
        gameStatus.timeLeft--;
        if (gameStatus.timeLeft > 5) {
            await gameStatus.mainMsg.edit({ embeds: [createMainEmbed()] }).catch(() => {});
        } else if (gameStatus.timeLeft === 5) {
            gameStatus.isOpening = false;
            await gameStatus.mainMsg.edit({ embeds: [createMainEmbed('locking')], components: createButtons(true) }).catch(() => {});
        } else if (gameStatus.timeLeft <= 0) {
            clearInterval(timer);
            processResult();
        }
    }, 1000); 
}

// Xử lý Kết Quả Siêu Chi Tiết (Theo mẫu bạn gửi)
async function processResult() {
    const d = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    const total = d[0] + d[1] + d[2];
    const result = total >= 11 ? 'tai' : 'xiu';
    const isJackpot = (d[0] === d[1] && d[1] === d[2]) && (d[0] === 1 || d[0] === 6);

    // Giai đoạn lắc bát
    const openingEmbed = new EmbedBuilder()
        .setTitle("🎲 ĐANG MỞ BÁT...")
        .setColor('#f1c40f')
        .setDescription("```\n    _______    \n   /       \\   \n  |  ? ? ?  |  \n   \\_______/   \n```\n*Đang nặn xí ngầu, vui lòng đợi...*");
    
    await gameStatus.mainMsg.edit({ embeds: [openingEmbed], components: [] });

    setTimeout(async () => {
        // Bảng kết quả tổng quát
        const resultEmbed = new EmbedBuilder()
            .setTitle(result === 'tai' ? "🔴 KẾT QUẢ: TÀI" : "⚪ KẾT QUẢ: XỈU")
            .setColor(result === 'tai' ? '#ED4245' : '#5865F2')
            .setDescription(
                `📊 **Phiên #${sessionID.toString()}**\n` +
                `────────────────────\n` +
                `**Bạn đã tung xí ngầu**\n` +
                `**Kết quả lần lượt là:**\n` +
                `🎲 **Xí ngầu 1:** \`${d[0]}\` 🍓\n` +
                `🎲 **Xí ngầu 2:** \`${d[1]}\` 🍓\n` +
                `🎲 **Xí ngầu 3:** \`${d[2]}\` 🍓\n` +
                `🏁 **Tổng điểm xí ngầu:** \`${total}.0\`\n` +
                `────────────────────`
            );

        // Thông báo Thắng/Thua cho từng người
        for (let [uId, bet] of gameStatus.currentBets) {
            const betAmount = result === 'tai' ? bet.tai : bet.xiu;
            const loseAmount = result === 'tai' ? bet.xiu : bet.tai;
            const user = await client.users.fetch(uId);

            if (betAmount > 0) {
                let prize = isJackpot ? (betAmount * 5) : (betAmount * 1.95);
                updateBalance(uId, prize);
                
                const winEmbed = new EmbedBuilder()
                    .setTitle("🥳 Thắng Rồi! 🥳")
                    .setColor('#2ecc71')
                    .setDescription(`Chúc mừng **${user.username}**!\nHúp trọn phiên này rồi.\n────────────────────\n💰 **Bạn Thắng:** \`${prize.toLocaleString()}\` xu\n────────────────────\n*CONFIG BY LIGHTSV*`);
                
                gameStatus.mainMsg.channel.send({ content: `<@${uId}>`, embeds: [winEmbed] });
            } else if (loseAmount > 0) {
                const loseEmbed = new EmbedBuilder()
                    .setTitle("😤 Thua Rồi! 😤")
                    .setColor('#e74c3c')
                    .setDescription(`Hơi đen cho **${user.username}**, nhưng không sao.\nLàm thêm một ván nữa nào.\n────────────────────\n💸 **Bạn Thua:** \`${loseAmount.toLocaleString()}\` xu\n────────────────────\n*CONFIG BY LIGHTSV*`);

                gameStatus.mainMsg.channel.send({ content: `<@${uId}>`, embeds: [loseEmbed] });
            }
        }

        gameStatus.history.push({ result });
        if (gameStatus.history.length > 50) gameStatus.history.shift();
        
        await gameStatus.mainMsg.edit({ embeds: [resultEmbed] });
        setTimeout(() => startRound(), 12000); 
    }, 4000);
}

// Xử lý Interaction & Modal chuyên nghiệp
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId === 'show_soicau') return interaction.reply({ content: generateDetailedSoicau(), ephemeral: true });
        if (!gameStatus.isOpening) return interaction.reply({ content: '❌ Phiên đã khóa cược!', ephemeral: true });
        
        const modal = new ModalBuilder().setCustomId(`modal_${interaction.customId}`).setTitle('NHẬP TIỀN CƯỢC');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('money_input').setLabel("Số tiền muốn cược (Tối thiểu 1,000)").setStyle(TextInputStyle.Short).setPlaceholder('Ví dụ: 2000').setRequired(true)
        ));
        await interaction.showModal(modal).catch(() => {});
    }

    if (interaction.isModalSubmit()) {
        const amount = parseInt(interaction.fields.getTextInputValue('money_input').replace(/,/g, ''));
        if (isNaN(amount) || amount < 1000) return interaction.reply({ content: '❌ Tiền không hợp lệ!', ephemeral: true });
        if (getBalance(interaction.user.id) < amount) return interaction.reply({ content: '💸 Không đủ số dư!', ephemeral: true });

        updateBalance(interaction.user.id, -amount);
        const type = interaction.customId === 'modal_bet_tai' ? 'tai' : 'xiu';
        let uBet = gameStatus.currentBets.get(interaction.user.id) || { tai: 0, xiu: 0 };
        if (type === 'tai') { uBet.tai += amount; gameStatus.totalTai += amount; } 
        else { uBet.xiu += amount; gameStatus.totalXiu += amount; }
        gameStatus.currentBets.set(interaction.user.id, uBet);
        
        return interaction.reply({ content: `✅ Đã cược **${amount.toLocaleString()}** vào **${type.toUpperCase()}**`, ephemeral: true });
    }
});

client.once('ready', () => { console.log(`✅ [FINAL] Bot Tài Xỉu đã sẵn sàng!`); startRound(); });
client.login(process.env.DISCORD_TOKEN_TAIXIU);

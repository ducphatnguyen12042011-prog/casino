const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// --- CẤU HÌNH CHUẨN ---
const CHANNEL_ID = '1475439630274007121';
const TIME_BET = 300; // 5 phút cược (300 giây)
const TIME_WAIT = 120; // 2 phút chờ trả thưởng & nghỉ (Tổng cộng 7 phút/phiên)

let game = {
    session: 934060n,
    isOpening: false,
    timeLeft: 0,
    totalTai: 0,
    totalXiu: 0,
    history: [],
    bets: new Map(),
    mainMsg: null,
    timer: null,
    isProcessing: false // Khóa bảo vệ cực mạnh chống chồng phiên
};

const balances = new Map();
const getBalance = (id) => balances.get(id) || 10000000;
const updateBalance = (id, amt) => balances.set(id, getBalance(id) + amt);

const createEmbed = (statusType) => {
    const min = Math.floor(game.timeLeft / 60);
    const sec = game.timeLeft % 60;
    const timeStr = `${min}:${sec < 10 ? '0' : ''}${sec}`;

    let statusTxt = "🟢 ĐANG MỞ CƯỢC";
    let color = 0x2ed573;

    if (game.timeLeft <= 5) { // Đóng cược sau 5 giây cuối
        statusTxt = "🔒 ĐÃ ĐÓNG CỬA";
        color = 0x576574;
    } else if (game.timeLeft <= 15) {
        statusTxt = "⏳ SẮP KHÓA CƯỢC";
        color = 0xfeca57;
    }

    return new EmbedBuilder()
        .setAuthor({ name: "CASINO VERDICT - HỆ THỐNG TỰ ĐỘNG", iconURL: "https://i.imgur.com/8QO7Z6u.png" })
        .setTitle(`💎 PHIÊN TÀI XỈU: #${game.session.toString()}`)
        .setColor(color)
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `⏰ **THỜI GIAN CÒN LẠI:** \` ${timeStr} \`\n` +
            `📢 **TRẠNG THÁI:** ${statusTxt}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔴 **TỔNG TÀI:** \`${game.totalTai.toLocaleString()}\` xu\n` +
            `⚪ **TỔNG XỈU:** \`${game.totalXiu.toLocaleString()}\` xu\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📊 **SOI CẦU:** ${game.history.slice(-10).map(h => h === 'tai' ? '🔴' : '⚪').join(' ') || 'Chưa có dữ liệu'}`
        )
        .setTimestamp();
};

async function startSession() {
    if (game.isProcessing) return;

    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel) return;

    // Clear bộ đếm cũ triệt để để tránh dừng giây đột ngột
    if (game.timer) {
        clearInterval(game.timer);
        game.timer = null;
    }

    // Reset dữ liệu phiên mới
    game.isOpening = true;
    game.timeLeft = TIME_BET;
    game.totalTai = 0;
    game.totalXiu = 0;
    game.bets.clear();
    game.session++;

    game.mainMsg = await channel.send({ 
        embeds: [createEmbed('open')], 
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bet_tai_${game.session}`).setLabel('TÀI').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`bet_xiu_${game.session}`).setLabel('XỈU').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`info_${game.session}`).setLabel('LỊCH SỬ').setStyle(ButtonStyle.Secondary)
        )]
    });

    game.timer = setInterval(async () => {
        game.timeLeft--;

        if (game.timeLeft <= 0) {
            clearInterval(game.timer);
            game.isOpening = false;
            game.isProcessing = true; // Khóa để xử lý kết quả
            await handleFinish();
        } else {
            // Đóng cược sau 5 giây cuối
            if (game.timeLeft <= 5 && game.isOpening) game.isOpening = false;

            // Cập nhật mỗi 2 giây để mượt mà và tránh Rate Limit
            if (game.timeLeft % 2 === 0) {
                await game.mainMsg.edit({ 
                    embeds: [createEmbed(game.timeLeft <= 5 ? 'closed' : 'open')],
                    components: [new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`bet_tai_${game.session}`).setLabel('TÀI').setStyle(ButtonStyle.Danger).setDisabled(!game.isOpening),
                        new ButtonBuilder().setCustomId(`bet_xiu_${game.session}`).setLabel('XỈU').setStyle(ButtonStyle.Primary).setDisabled(!game.isOpening),
                        new ButtonBuilder().setCustomId(`info_${game.session}`).setLabel('LỊCH SỬ').setStyle(ButtonStyle.Secondary)
                    )]
                }).catch(() => {});
            }
        }
    }, 1000);
}

async function handleFinish() {
    const dice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    const total = dice[0] + dice[1] + dice[2];
    const result = total >= 11 ? 'tai' : 'xiu';

    const resultEmbed = new EmbedBuilder()
        .setTitle(`🏁 KẾT QUẢ PHIÊN #${game.session}`)
        .setColor(result === 'tai' ? 0xff4757 : 0x2ecc71)
        .setDescription(`🎲 Kết quả: **${dice.join(' - ')}** => **${result.toUpperCase()}** (${total} điểm)`);

    await game.mainMsg.edit({ embeds: [resultEmbed], components: [] });

    // Trả thưởng
    for (let [uId, b] of game.bets) {
        if (b.choice === result) {
            updateBalance(uId, b.amount * 1.95);
            client.users.send(uId, `✅ Thắng phiên #${game.session}: +${(b.amount * 1.95).toLocaleString()} xu`).catch(() => {});
        }
    }

    game.history.push(result);

    // Đợi 2 phút (TIME_WAIT) mới có phiên mới (Tổng cộng 7 phút)
    setTimeout(() => {
        game.isProcessing = false;
        startSession();
    }, TIME_WAIT * 1000);
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        const [type, side, sessId] = interaction.customId.split('_');
        if (type === 'info') return interaction.reply({ content: `📊 Cầu: ${game.history.join(' ')}`, ephemeral: true });
        
        if (!game.isOpening || sessId !== game.session.toString()) {
            return interaction.reply({ content: "❌ Phiên đã đóng cược!", ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId(`modal_${side}_${sessId}`).setTitle('VÀO TIỀN');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('amt').setLabel('Số tiền cược').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true }); // Fix lỗi Modal
        const [_, side, sessId] = interaction.customId.split('_');
        const amount = parseInt(interaction.fields.getTextInputValue('amt').replace(/,/g, ''));

        if (isNaN(amount) || amount < 1000) return interaction.editReply("❌ Tối thiểu 1,000 xu!");
        if (getBalance(interaction.user.id) < amount) return interaction.editReply("❌ Không đủ số dư!");

        updateBalance(interaction.user.id, -amount);
        game.bets.set(interaction.user.id, { choice: side, amount });
        if (side === 'tai') game.totalTai += amount; else game.totalXiu += amount;

        await interaction.editReply(`✅ Cược **${amount.toLocaleString()}** vào **${side.toUpperCase()}** thành công!`);
    }
});

client.once('ready', () => { startSession(); });
client.login(process.env.BOT_TOKEN);

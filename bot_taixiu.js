const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// --- CẤU HÌNH ---
const CHANNEL_ID = '1475439630274007121';
const TIME_BET = 300;  // 5 phút đặt cược
const TIME_WAIT = 120; // 2 phút chờ kết quả & nghỉ => Tổng 7 phút

let game = {
    session: 934075,
    timeLeft: 0,
    status: 'waiting', // 'playing', 'ending'
    totalTai: 0,
    totalXiu: 0,
    history: [],
    bets: new Map(),
    mainMsg: null,
    timer: null
};

const balances = new Map();
const getBalance = (id) => balances.get(id) || 10000000;
const updateBalance = (id, amt) => balances.set(id, getBalance(id) + amt);

// --- HELPER: GIAO DIỆN ---
function getEmbed() {
    const min = Math.floor(game.timeLeft / 60);
    const sec = game.timeLeft % 60;
    const timeStr = `${min}:${sec < 10 ? '0' : ''}${sec}`;

    let color = 0x2ed573;
    let statusTxt = "🟢 ĐANG MỞ CƯỢC";

    if (game.timeLeft <= 10) {
        color = 0xff4757;
        statusTxt = "🚨 SẮP KHÓA CỬA";
    }

    return new EmbedBuilder()
        .setAuthor({ name: "CASINO SYSTEM - AUTO 7 MINS", iconURL: "https://i.imgur.com/8QO7Z6u.png" })
        .setTitle(`💎 PHIÊN TÀI XỈU: #${game.session}`)
        .setColor(color)
        .addFields(
            { name: "⏰ THỜI GIAN", value: `\` ${timeStr} \``, inline: true },
            { name: "📢 TRẠNG THÁI", value: `**${statusTxt}**`, inline: true },
            { name: "📊 SOI CẦU (10)", value: game.history.slice(-10).map(h => h === 'tai' ? '🔴' : '⚪').join(' ') || '...' }
        )
        .setDescription(`🔴 **TỔNG TÀI:** \`${game.totalTai.toLocaleString()}\` xu\n⚪ **TỔNG XỈU:** \`${game.totalXiu.toLocaleString()}\` xu`)
        .setFooter({ text: "Hệ thống tự động làm mới mỗi 5 giây để tránh lag." })
        .setTimestamp();
}

function getButtons(isDisabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bet_tai_${game.session}`).setLabel('ĐẶT TÀI').setStyle(ButtonStyle.Danger).setDisabled(isDisabled),
        new ButtonBuilder().setCustomId(`bet_xiu_${game.session}`).setLabel('ĐẶT XỈU').setStyle(ButtonStyle.Primary).setDisabled(isDisabled),
        new ButtonBuilder().setCustomId(`refresh_${game.session}`).setLabel('CẬP NHẬT').setStyle(ButtonStyle.Secondary)
    );
}

// --- LUỒNG VẬN HÀNH ---
async function startNewSession() {
    if (game.timer) clearInterval(game.timer);
    
    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel) return console.error("Không tìm thấy kênh!");

    game.status = 'playing';
    game.timeLeft = TIME_BET;
    game.totalTai = 0;
    game.totalXiu = 0;
    game.bets.clear();
    game.session++;

    game.mainMsg = await channel.send({ embeds: [getEmbed()], components: [getButtons()] });

    game.timer = setInterval(async () => {
        game.timeLeft -= 5; // Trừ mỗi lần 5 giây để giảm tải cho Bot

        if (game.timeLeft <= 0) {
            clearInterval(game.timer);
            await processResult();
        } else {
            // Chỉ cập nhật tin nhắn mỗi 5 giây (Tránh Rate Limit)
            await game.mainMsg.edit({ embeds: [getEmbed()], components: [getButtons(game.timeLeft <= 5)] }).catch(() => {});
        }
    }, 5000);
}

async function processResult() {
    game.status = 'ending';
    const dice = [1, 2, 3].map(() => Math.floor(Math.random() * 6) + 1);
    const total = dice.reduce((a, b) => a + b, 0);
    const result = total >= 11 ? 'tai' : 'xiu';

    const resEmbed = new EmbedBuilder()
        .setTitle(`🏁 KẾT QUẢ PHIÊN #${game.session}`)
        .setColor(result === 'tai' ? 0xff4757 : 0x2ecc71)
        .addFields(
            { name: "🎲 Xúc xắc", value: `**${dice.join(' - ')}** (Tổng: ${total})`, inline: true },
            { name: "Kết quả", value: result.toUpperCase(), inline: true }
        )
        .setFooter({ text: `Phiên mới sẽ bắt đầu sau ${TIME_WAIT} giây...` });

    await game.mainMsg.edit({ embeds: [resEmbed], components: [] }).catch(() => {});

    // Trả thưởng
    game.bets.forEach((bet, userId) => {
        if (bet.side === result) {
            const winAmt = Math.floor(bet.amount * 1.95);
            updateBalance(userId, winAmt);
            client.users.send(userId, `✅ Chúc mừng! Bạn thắng **+${winAmt.toLocaleString()}** xu ở phiên #${game.session}`).catch(() => {});
        }
    });

    game.history.push(result);
    
    // Đợi 2 phút (TIME_WAIT) rồi mới sang phiên mới
    setTimeout(startNewSession, TIME_WAIT * 1000);
}

// --- XỬ LÝ TƯƠNG TÁC ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        const [type, side, sessId] = i.customId.split('_');
        
        if (type === 'refresh') return i.reply({ content: "Đã cập nhật dữ liệu mới nhất!", ephemeral: true });

        if (game.status !== 'playing' || sessId !== game.session.toString() || game.timeLeft <= 5) {
            return i.reply({ content: "❌ Phiên này đã đóng hoặc đang xử lý!", ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId(`modal_${side}_${sessId}`).setTitle(`Đặt cược ${side.toUpperCase()}`);
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('amt').setLabel('Số tiền cược (Min 1,000)').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await i.showModal(modal);
    }

    if (i.isModalSubmit()) {
        const [_, side, sessId] = i.customId.split('_');
        const amount = parseInt(i.fields.getTextInputValue('amt').replace(/\D/g, ''));

        if (isNaN(amount) || amount < 1000) return i.reply({ content: "❌ Tiền cược không hợp lệ!", ephemeral: true });
        if (getBalance(i.user.id) < amount) return i.reply({ content: "❌ Bạn không đủ tiền!", ephemeral: true });
        if (game.timeLeft <= 5) return i.reply({ content: "❌ Đã hết thời gian cược!", ephemeral: true });

        updateBalance(i.user.id, -amount);
        
        // Cộng dồn cược nếu người chơi đặt nhiều lần
        const oldBet = game.bets.get(i.user.id) || { amount: 0, side: side };
        if (oldBet.side !== side) return i.reply({ content: "❌ Bạn không thể đặt cả hai cửa!", ephemeral: true });

        game.bets.set(i.user.id, { side, amount: oldBet.amount + amount });
        if (side === 'tai') game.totalTai += amount; else game.totalXiu += amount;

        await i.reply({ content: `✅ Đã đặt thêm **${amount.toLocaleString()}** xu vào **${side.toUpperCase()}**`, ephemeral: true });
    }
});

client.once('ready', () => {
    console.log(`✅ Bot ${client.user.tag} sẵn sàng. Chu kỳ 7 phút bắt đầu.`);
    startNewSession();
});

client.login("YOUR_TOKEN_HERE");

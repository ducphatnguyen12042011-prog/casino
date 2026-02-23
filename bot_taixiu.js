const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// --- CẤU HÌNH CỐ ĐỊNH ---
const CHANNEL_ID = '1475439630274007121';
const TIME_BET = 300;  // 5 phút cược (300 giây)
const TIME_WAIT = 120; // 2 phút nghỉ giữa 2 phiên (120 giây) -> Tổng 7 phút

let game = {
    session: 934075n,
    timeLeft: 0,
    isOpening: false,
    totalTai: 0,
    totalXiu: 0,
    history: [],
    bets: new Map(),
    mainMsg: null,
    timer: null,
    status: 'waiting' // 'playing', 'ending', 'waiting'
};

const balances = new Map();
const getBalance = (id) => balances.get(id) || 10000000;
const updateBalance = (id, amt) => balances.set(id, getBalance(id) + amt);

// --- HÀM TẠO GIAO DIỆN ---
function getEmbed() {
    const min = Math.floor(game.timeLeft / 60);
    const sec = game.timeLeft % 60;
    const timeStr = `${min}:${sec < 10 ? '0' : ''}${sec}`;

    let color = 0x2ed573; // Xanh
    let statusTxt = "🟢 ĐANG MỞ CƯỢC";

    if (game.timeLeft <= 5) {
        color = 0x576574; // Xám
        statusTxt = "🔒 ĐÃ ĐÓNG CỬA (ĐANG CHỜ KẾT QUẢ)";
    } else if (game.timeLeft <= 15) {
        color = 0xfeca57; // Vàng
        statusTxt = "⏳ SẮP KHÓA CƯỢC";
    }

    return new EmbedBuilder()
        .setAuthor({ name: "CASINO VERDICT - PHIÊN BẢN FIX CUỐI", iconURL: "https://i.imgur.com/8QO7Z6u.png" })
        .setTitle(`💎 PHIÊN TÀI XỈU: #${game.session.toString()}`)
        .setColor(color)
        .addFields(
            { name: "⏰ THỜI GIAN", value: `\` ${timeStr} \` (Lùi từng giây)`, inline: true },
            { name: "📢 TRẠNG THÁI", value: statusTxt, inline: true },
            { name: "📊 SOI CẦU", value: game.history.slice(-10).map(h => h === 'tai' ? '🔴' : '⚪').join(' ') || 'Chưa có dữ liệu' }
        )
        .setDescription(`🔴 **TỔNG TÀI:** \`${game.totalTai.toLocaleString()}\` xu\n⚪ **TỔNG XỈU:** \`${game.totalXiu.toLocaleString()}\` xu`)
        .setFooter({ text: "Hệ thống tự động trả thưởng sau khi hết thời gian." })
        .setTimestamp();
}

function getButtons() {
    // Khóa nút khi còn 5 giây hoặc khi đang xử lý
    const isDisabled = game.timeLeft <= 5 || game.status !== 'playing';
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bet_tai_${game.session}`).setLabel('ĐẶT TÀI').setStyle(ButtonStyle.Danger).setDisabled(isDisabled),
        new ButtonBuilder().setCustomId(`bet_xiu_${game.session}`).setLabel('ĐẶT XỈU').setStyle(ButtonStyle.Primary).setDisabled(isDisabled),
        new ButtonBuilder().setCustomId(`history_${game.session}`).setLabel('SOI CẦU').setStyle(ButtonStyle.Secondary)
    );
}

// --- LUỒNG VẬN HÀNH CHÍNH ---
async function startNewSession() {
    // 1. Xóa sạch bộ đếm cũ để không bao giờ bị nhảy giây
    if (game.timer) clearInterval(game.timer);
    
    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel) return;

    // 2. Khởi tạo dữ liệu phiên mới
    game.status = 'playing';
    game.isOpening = true;
    game.timeLeft = TIME_BET;
    game.totalTai = 0;
    game.totalXiu = 0;
    game.bets.clear();
    game.session++;

    // 3. Gửi tin nhắn mới hoàn toàn để không bị chồng phiên cũ
    game.mainMsg = await channel.send({ embeds: [getEmbed()], components: [getButtons()] });

    // 4. Vòng lặp đếm giây
    game.timer = setInterval(async () => {
        game.timeLeft--;

        if (game.timeLeft <= 0) {
            clearInterval(game.timer);
            game.isOpening = false;
            game.status = 'ending';
            await processResult();
        } else {
            // Tự động đóng cược khi còn 5 giây
            if (game.timeLeft === 5) game.isOpening = false;

            // Cập nhật lùi từng giây
            await game.mainMsg.edit({ 
                embeds: [getEmbed()], 
                components: [getButtons()] 
            }).catch(() => {});
        }
    }, 1000);
}

async function processResult() {
    const dice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    const total = dice[0] + dice[1] + dice[2];
    const result = total >= 11 ? 'tai' : 'xiu';

    const resEmbed = new EmbedBuilder()
        .setTitle(`🏁 KẾT QUẢ PHIÊN #${game.session}`)
        .setColor(result === 'tai' ? 0xff4757 : 0x2ecc71)
        .setDescription(`🎲 Kết quả: **${dice.join(' - ')}**\n🏁 Tổng: **${total}** điểm => **${result.toUpperCase()}**`);

    await game.mainMsg.edit({ embeds: [resEmbed], components: [] }).catch(() => {});

    // Trả thưởng
    for (let [uId, b] of game.bets) {
        if (b.side === result) {
            const winAmt = b.amount * 1.95;
            updateBalance(uId, winAmt);
            client.users.send(uId, `🎉 Bạn đã thắng phiên #${game.session}: **+${winAmt.toLocaleString()}** xu!`).catch(() => {});
        }
    }
    game.history.push(result);
    game.status = 'waiting';

    // 5. ĐỢI ĐÚNG 2 PHÚT MỚI BẮT ĐẦU PHIÊN MỚI (TỔNG 7 PHÚT)
    console.log(`⏱️ Phiên #${game.session} kết thúc. Nghỉ 120s...`);
    setTimeout(startNewSession, TIME_WAIT * 1000);
}

// --- XỬ LÝ TƯƠNG TÁC ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        const [type, side, sessId] = i.customId.split('_');
        if (type === 'history') return i.reply({ content: `📊 Lịch sử 15 phiên: ${game.history.slice(-15).join(', ')}`, ephemeral: true });
        
        // Kiểm tra logic cược
        if (game.status !== 'playing' || sessId !== game.session.toString() || game.timeLeft <= 5) {
            return i.reply({ content: "❌ Phiên này đã đóng hoặc đã kết thúc kết quả!", ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId(`modal_${side}_${sessId}`).setTitle('VÀO TIỀN CƯỢC');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('amt').setLabel('Số tiền muốn đặt').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await i.showModal(modal);
    }

    if (i.isModalSubmit()) {
        await i.deferReply({ ephemeral: true }); // Chống lỗi "Interaction Failed"
        const [_, side, sessId] = i.customId.split('_');
        const amount = parseInt(i.fields.getTextInputValue('amt').replace(/,/g, ''));

        if (isNaN(amount) || amount < 1000) return i.editReply("❌ Số tiền không hợp lệ (Tối thiểu 1,000)!");
        if (getBalance(i.user.id) < amount) return i.editReply("❌ Bạn không đủ số dư!");
        if (game.timeLeft <= 5) return i.editReply("❌ Quá muộn! Phiên đã khóa cược.");

        updateBalance(i.user.id, -amount);
        game.bets.set(i.user.id, { side, amount });
        if (side === 'tai') game.totalTai += amount; else game.totalXiu += amount;

        await i.editReply(`✅ Đã đặt **${amount.toLocaleString()}** xu vào **${side.toUpperCase()}** (Phiên #${sessId})`);
    }
});

client.once('ready', () => { 
    console.log(`✅ Bot ${client.user.tag} Online. Bắt đầu chu kỳ 7 phút/phiên.`);
    startNewSession(); 
});
client.login(process.env.BOT_TOKEN);

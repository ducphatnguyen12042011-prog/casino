const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// --- CẤU HÌNH ---
const PREFIX = '!';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let game = {
    session: 1,
    status: 'off', // 'off', 'playing', 'rolling'
    totalTai: 0,
    totalXiu: 0,
    history: [], // Lưu dạng { result: 'Tài', total: 11 }
    bets: new Map(),
};

const balances = new Map();
const getBalance = (id) => balances.get(id) || 10000000;
const updateBalance = (id, amt) => balances.set(id, getBalance(id) + amt);

// --- HELPER: HIỂN THỊ CẦU ---
function formatHistory() {
    if (game.history.length === 0) return "Chưa có dữ liệu";
    return game.history.slice(-10).map(h => {
        const icon = h.result === 'Tài' ? '🔴' : '⚪';
        return `${icon}\n${h.total}`;
    }).join('  |  ');
}

// --- LỆNH !TX ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const command = message.content.slice(PREFIX.length).toLowerCase();

    if (command === 'tx') {
        if (game.status !== 'off') return message.reply("⚠️ Một phiên đang diễn ra, hãy đặt cược ngay!");

        game.status = 'playing';
        game.totalTai = 0;
        game.totalXiu = 0;
        game.bets.clear();

        const embed = new EmbedBuilder()
            .setAuthor({ name: "CASINO VERDICT - ĐẶT CƯỢC" })
            .setTitle(`💎 PHIÊN TÀI XỈU: #${game.session}`)
            .setColor(0x2ed573)
            .setDescription(`🔴 **TỔNG TÀI:** \`${game.totalTai.toLocaleString()}\` xu\n⚪ **TỔNG XỈU:** \`${game.totalXiu.toLocaleString()}\` xu`)
            .addFields({ name: "📊 SOI CẦU", value: formatHistory() })
            .setFooter({ text: "Bạn có 30 giây để đặt cược trước khi tung xúc xắc!" });

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bet_tai').setLabel('ĐẶT TÀI').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('bet_xiu').setLabel('ĐẶT XỈU').setStyle(ButtonStyle.Primary)
        );

        const mainMsg = await message.channel.send({ embeds: [embed], components: [buttons] });

        // Đợi 30 giây để mọi người đặt cược
        await sleep(30000);

        // --- TUNG XÚC XẮC ---
        game.status = 'rolling';
        const dice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
        const total = dice[0] + dice[1] + dice[2];
        const result = total >= 11 ? 'Tài' : 'Xỉu';

        // Tìm người ăn nhiều nhất
        let winnerTxt = "Không ai cả";
        let maxWin = 0;
        game.bets.forEach((bet, id) => {
            if (bet.side === (total >= 11 ? 'tai' : 'xiu')) {
                if (bet.amount > maxWin) {
                    maxWin = bet.amount;
                    winnerTxt = `<@${id}>`;
                }
                updateBalance(id, Math.floor(bet.amount * 1.95));
            }
        });

        // Embed kết quả theo ảnh mẫu
        const resEmbed = new EmbedBuilder()
            .setTitle("🎲 Kết quả phiên tài xỉu 🟡")
            .setDescription(`Phiên số #${game.session}`)
            .setColor(total >= 11 ? 0xff0000 : 0x2ecc71)
            .setThumbnail(total >= 11 ? "https://i.imgur.com/8QO7Z6u.png" : "https://i.imgur.com/8QO7Z6u.png") // Thay bằng ảnh xúc xắc nếu có
            .addFields(
                { name: `🎲 Xúc xắc 1`, value: `**${dice[0]}**`, inline: true },
                { name: `🎲 Xúc xắc 2`, value: `**${dice[1]}**`, inline: true },
                { name: `🎲 Xúc xắc 3`, value: `**${dice[2]}**`, inline: true },
                { name: "🎯 Tổng số điểm", value: `**${total}**`, inline: false },
                { name: "📝 Kết quả", value: `**${result}**`, inline: false },
                { name: "📈 Ăn nhiều nhất", value: winnerTxt, inline: false }
            );

        await mainMsg.edit({ components: [] }); // Khóa nút
        await message.channel.send({ embeds: [resEmbed] });

        // Lưu lịch sử và kết thúc
        game.history.push({ result, total });
        game.session++;
        game.status = 'off';
    }
});

// --- XỬ LÝ TƯƠNG TÁC (BUTTON & MODAL) ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        if (game.status !== 'playing') return i.reply({ content: "Hết thời gian đặt cược!", ephemeral: true });

        const side = i.customId.split('_')[1];
        const modal = new ModalBuilder().setCustomId(`modal_${side}`).setTitle(`VÀO TIỀN ${side.toUpperCase()}`);
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('amt').setLabel('Số tiền cược').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await i.showModal(modal);
    }

    if (i.isModalSubmit()) {
        const side = i.customId.split('_')[1];
        const amount = parseInt(i.fields.getTextInputValue('amt').replace(/\D/g, ''));

        if (isNaN(amount) || amount < 1000) return i.reply({ content: "Tiền không hợp lệ!", ephemeral: true });
        if (getBalance(i.user.id) < amount) return i.reply({ content: "Bạn không đủ số dư!", ephemeral: true });

        updateBalance(i.user.id, -amount);
        const currentBet = game.bets.get(i.user.id) || { amount: 0, side: side };
        
        if (currentBet.side !== side) return i.reply({ content: "Bạn không thể đặt 2 cửa!", ephemeral: true });

        game.bets.set(i.user.id, { side, amount: currentBet.amount + amount });
        if (side === 'tai') game.totalTai += amount; else game.totalXiu += amount;

        await i.reply({ content: `✅ Đã đặt **${amount.toLocaleString()}** xu vào **${side.toUpperCase()}**`, ephemeral: true });
    }
});

client.once('ready', () => console.log(`✅ Bot ${client.user.tag} đã sẵn sàng!`));
client.login("TOKEN_CỦA_BẠN");

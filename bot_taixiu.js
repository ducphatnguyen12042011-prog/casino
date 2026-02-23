const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// Lấy thông tin từ Railway Variables
const CONFIG = {
    CHANNEL_ID: process.env.CHANNEL_ID,
    TOKEN: process.env.BOT_TOKEN,
    JACKPOT_START: 50000000
};

let game = {
    session: 934047n,
    isOpening: false,
    timeLeft: 40,
    totalTai: 0,
    totalXiu: 0,
    jackpot: CONFIG.JACKPOT_START,
    history: [],
    bets: new Map(),
    mainMsg: null,
    timer: null
};

const balances = new Map();
const getMoney = (id) => balances.get(id) || 10000000;
const addMoney = (id, amt) => balances.set(id, getMoney(id) + amt);

// Embed giao diện cực nét
function buildMainEmbed(status = 'playing') {
    const timeEmoji = game.timeLeft <= 10 ? '🧨' : '⏳';
    const statusText = status === 'playing' ? '🟢 ĐANG NHẬN CƯỢC' : '🔒 ĐÃ KHÓA CƯỢC';
    
    return new EmbedBuilder()
        .setAuthor({ name: `💎 TÀI XỈU CASINO - PHIÊN #${game.session.toString()}`, iconURL: 'https://cdn-icons-png.flaticon.com/512/1055/1055823.png' })
        .setColor(status === 'playing' ? '#f1c40f' : '#e74c3c')
        .setDescription(
            `### ${timeEmoji} THỜI GIAN: \`${game.timeLeft}S\`\n` +
            `> **TRẠNG THÁI:** ${statusText}\n\n` +
            `🏆 **HŨ RỒNG HIỆN TẠI** 🏆\n` +
            `**💰 ${game.jackpot.toLocaleString()} xu**\n` +
            `──────────────────────────\n` +
            `🔴 **TỔNG TÀI:** \`${game.totalTai.toLocaleString()}\` xu\n` +
            `⚪ **TỔNG XỈU:** \`${game.totalXiu.toLocaleString()}\` xu\n` +
            `──────────────────────────\n` +
            `**📊 SOI CẦU CHI TIẾT:**\n` +
            `📜 **Lịch sử:** ${game.history.slice(-8).map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ') || '...'}\n` +
            `📈 **Thống kê:** 🔴 \`${game.history.filter(h=>h.result==='tai').length}\` | ⚪ \`${game.history.filter(h=>h.result==='xiu').length}\`\n` +
            `──────────────────────────`
        );
}

function buildButtons(disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bet_tai').setLabel('ĐẶT TÀI').setStyle(ButtonStyle.Danger).setDisabled(disabled),
        new ButtonBuilder().setCustomId('bet_xiu').setLabel('ĐẶT XỈU').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('soicau').setLabel('📊 SOI CẦU').setStyle(ButtonStyle.Secondary)
    )];
}

async function startRound() {
    const channel = client.channels.cache.get(CONFIG.CHANNEL_ID);
    if (!channel) return console.error("❌ Lỗi: ID Kênh không hợp lệ trên Railway!");

    if (game.timer) clearInterval(game.timer);
    game.isOpening = true;
    game.timeLeft = 40;
    game.totalTai = 0;
    game.totalXiu = 0;
    game.bets.clear();
    game.session++;

    game.mainMsg = await channel.send({ embeds: [buildMainEmbed()], components: buildButtons() });

    game.timer = setInterval(async () => {
        game.timeLeft -= 2;
        if (game.timeLeft > 5) {
            await game.mainMsg.edit({ embeds: [buildMainEmbed()] }).catch(() => {});
        } else if (game.timeLeft <= 5 && game.timeLeft > 0) {
            game.isOpening = false;
            await game.mainMsg.edit({ embeds: [buildMainEmbed('locked')], components: buildButtons(true) }).catch(() => {});
        } else if (game.timeLeft <= 0) {
            clearInterval(game.timer);
            endRound();
        }
    }, 2000); // 2s để chống Rate Limit trên Railway
}

async function endRound() {
    const dice = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1];
    const total = dice[0] + dice[1] + dice[2];
    const result = total >= 11 ? 'tai' : 'xiu';

    const resultEmbed = new EmbedBuilder()
        .setTitle(result === 'tai' ? "🔴 KẾT QUẢ: TÀI" : "⚪ KẾT QUẢ: XỈU")
        .setColor(result === 'tai' ? '#ED4245' : '#5865F2')
        .setDescription(`📊 **Phiên #${game.session}**\n──────────────────\n🎲 **Xí ngầu:** \`${dice[0]} - ${dice[1]} - ${dice[2]}\`\n🏁 **Tổng:** \`${total}.0\`\n──────────────────`);

    for (let [uId, data] of game.bets) {
        if (data.side === result) {
            const win = data.amount * 1.95;
            addMoney(uId, win);
            game.mainMsg.channel.send({ content: `🥳 **${(await client.users.fetch(uId)).username}** thắng \`${win.toLocaleString()}\` xu!` });
        } else {
            game.mainMsg.channel.send({ content: `😤 **${(await client.users.fetch(uId)).username}** thua \`${data.amount.toLocaleString()}\` xu!` });
        }
    }

    game.history.push({ result });
    await game.mainMsg.edit({ embeds: [resultEmbed], components: [] });
    setTimeout(() => startRound(), 10000);
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId === 'soicau') {
            const hStr = game.history.slice(-15).map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ');
            return interaction.reply({ content: `📊 **LỊCH SỬ:** ${hStr || 'Trống'}`, ephemeral: true });
        }

        if (!game.isOpening) return interaction.reply({ content: '❌ Hết thời gian cược!', ephemeral: true });

        // Chặn cược 2 đầu
        const userBet = game.bets.get(interaction.user.id);
        if (userBet) {
            if (interaction.customId === 'bet_tai' && userBet.side === 'xiu') return interaction.reply({ content: '❌ Đã cược Xỉu!', ephemeral: true });
            if (interaction.customId === 'bet_xiu' && userBet.side === 'tai') return interaction.reply({ content: '❌ Đã cược Tài!', ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId(`modal_${interaction.customId}`).setTitle('NHẬP CƯỢC');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('amt').setLabel("Số tiền").setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true });
        const amount = parseInt(interaction.fields.getTextInputValue('amt').replace(/,/g, ''));
        if (isNaN(amount) || amount < 1000) return interaction.editReply('❌ Tiền không hợp lệ!');

        const side = interaction.customId === 'modal_bet_tai' ? 'tai' : 'xiu';
        let uBet = game.bets.get(interaction.user.id) || { side: side, amount: 0 };
        uBet.amount += amount;
        if (side === 'tai') game.totalTai += amount; else game.totalXiu += amount;
        
        game.bets.set(interaction.user.id, uBet);
        return interaction.editReply(`✅ Đã cược **${amount.toLocaleString()}** xu vào **${side.toUpperCase()}**`);
    }
});

client.once('ready', () => { 
    console.log('🚀 BOT TÀI XỈU MASTER ONLINE!'); 
    startRound(); 
});

// Khởi động bot bằng Token từ Railway
client.login(CONFIG.TOKEN).catch(e => console.error("❌ Lỗi Token trên Railway:", e.message));

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// THAY ID KÊNH VÀ TOKEN VÀO ĐÂY
const CHANNEL_ID = '1475439630274007121';
const BOT_TOKEN = 'DÁN_TOKEN_MỚI_VÀO_ĐÂY'; 

let sessionID = 934047n; 
let gameStatus = {
    isOpening: false,
    timeLeft: 40,
    history: [], 
    currentBets: new Map(), 
    totalTai: 0,
    totalXiu: 0,
    mainMsg: null,
    gameInterval: null
};

const userBalances = new Map();
const getBalance = (id) => userBalances.get(id) || 10000000;
const updateBalance = (id, amt) => userBalances.set(id, getBalance(id) + amt);

function createMainEmbed(status = 'playing') {
    const timeEmoji = gameStatus.timeLeft <= 10 ? '🧨' : '⏳';
    return new EmbedBuilder()
        .setAuthor({ name: `💎 TÀI XỈU CASINO - PHIÊN #${sessionID.toString()}`, iconURL: 'https://cdn-icons-png.flaticon.com/512/1055/1055823.png' })
        .setColor(status === 'playing' ? '#f1c40f' : '#e74c3c')
        .setDescription(
            `### ${timeEmoji} THỜI GIAN CÒN LẠI: \`${gameStatus.timeLeft}S\`\n` +
            `──────────────────────────\n` +
            `**🔴 TỔNG TÀI:** \`${gameStatus.totalTai.toLocaleString()}\` xu\n` +
            `**⚪ TỔNG XỈU:** \`${gameStatus.totalXiu.toLocaleString()}\` xu\n` +
            `──────────────────────────\n` +
            `**📊 SOI CẦU GẦN NHẤT:**\n` +
            `${gameStatus.history.slice(-8).map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ') || 'Chưa có dữ liệu'}\n` +
            `──────────────────────────`
        );
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
    if (!channel) return console.log("❌ Không tìm thấy kênh!");
    
    if (gameStatus.gameInterval) clearInterval(gameStatus.gameInterval);
    gameStatus.isOpening = true;
    gameStatus.timeLeft = 40; 
    gameStatus.totalTai = 0;
    gameStatus.totalXiu = 0;
    gameStatus.currentBets.clear();
    sessionID++;

    gameStatus.mainMsg = await channel.send({ embeds: [createMainEmbed()], components: createButtons() });

    gameStatus.gameInterval = setInterval(async () => {
        gameStatus.timeLeft -= 2; 
        if (gameStatus.timeLeft > 5) {
            await gameStatus.mainMsg.edit({ embeds: [createMainEmbed()] }).catch(() => {});
        } else if (gameStatus.timeLeft <= 5 && gameStatus.timeLeft > 0) {
            gameStatus.isOpening = false;
            await gameStatus.mainMsg.edit({ embeds: [createMainEmbed('locking')], components: createButtons(true) }).catch(() => {});
        } else if (gameStatus.timeLeft <= 0) {
            clearInterval(gameStatus.gameInterval);
            processResult();
        }
    }, 2000); 
}

async function processResult() {
    const d = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    const total = d[0] + d[1] + d[2];
    const result = total >= 11 ? 'tai' : 'xiu';

    const resultEmbed = new EmbedBuilder()
        .setTitle(result === 'tai' ? "🔴 KẾT QUẢ: TÀI" : "⚪ KẾT QUẢ: XỈU")
        .setColor(result === 'tai' ? '#ED4245' : '#5865F2')
        .setDescription(`📊 **Phiên #${sessionID}**\n──────────────────\n🎲 **Kết quả:** \`${d[0]} - ${d[1]} - ${d[2]}\`\n🏁 **Tổng:** \`${total}.0\`\n──────────────────`);

    gameStatus.history.push({ result });
    await gameStatus.mainMsg.edit({ embeds: [resultEmbed], components: [] }).catch(() => {});
    setTimeout(() => startRound(), 10000);
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId === 'show_soicau') {
            return interaction.reply({ content: `📊 Soi cầu: ${gameStatus.history.slice(-10).map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ') || 'Trống'}`, ephemeral: true });
        }
        if (!gameStatus.isOpening) return interaction.reply({ content: '❌ Hết thời gian!', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`modal_${interaction.customId}`).setTitle('VÀO TIỀN');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('money').setLabel("Số tiền cược").setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true });
        const amount = parseInt(interaction.fields.getTextInputValue('money').replace(/,/g, ''));
        if (isNaN(amount) || amount < 1000) return interaction.editReply('❌ Tiền không hợp lệ!');

        const type = interaction.customId === 'modal_bet_tai' ? 'tai' : 'xiu';
        let uBet = gameStatus.currentBets.get(interaction.user.id) || { tai: 0, xiu: 0 };
        
        if (type === 'tai') { uBet.tai += amount; gameStatus.totalTai += amount; } 
        else { uBet.xiu += amount; gameStatus.totalXiu += amount; }
        
        gameStatus.currentBets.set(interaction.user.id, uBet);
        return interaction.editReply(`✅ Đã cược **${amount.toLocaleString()}** vào **${type.toUpperCase()}**`);
    }
});

client.once('ready', () => { 
    console.log(`✅ Bot đã kết nối thành công!`); 
    startRound(); 
});

// Kiểm tra token trước khi login để tránh lỗi Header
if (BOT_TOKEN === 'DÁN_TOKEN_MỚI_VÀO_ĐÂY' || BOT_TOKEN === '') {
    console.error("❌ LỖI: Bạn chưa dán Token mới vào code!");
} else {
    client.login(BOT_TOKEN).catch(err => {
        console.error("❌ LỖI TOKEN: Token không hợp lệ hoặc đã hết hạn!", err.message);
    });
}

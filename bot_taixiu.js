const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const CHANNEL_ID = '1475439630274007121';
let sessionID = 1475439630274007121n;
let jackpot = 50000000;
let gameStatus = {
    isOpening: false,
    timeLeft: 40,
    history: [], 
    currentBets: new Map(), 
    totalTai: 0,
    totalXiu: 0,
    mainMsg: null
};

// Giả lập ví tiền
const userBalances = new Map();
const getBalance = (id) => userBalances.get(id) || 10000000;
const updateBalance = (id, amt) => userBalances.set(id, getBalance(id) + amt);

function createMainEmbed(status = 'playing') {
    const soiCau = gameStatus.history.length === 0 ? "⚪ Chưa có dữ liệu" : gameStatus.history.map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ');
    const embed = new EmbedBuilder()
        .setTitle(`🎰 TÀI XỈU PHIÊN #${sessionID}`)
        .setColor(status === 'playing' ? '#f1c40f' : '#e74c3c')
        .setDescription(`## ⏳ ĐẾM NGƯỢC: ${gameStatus.timeLeft}s\n` + 
                        `💰 **HŨ:** \`${jackpot.toLocaleString()}\` xu\n\n` +
                        `🔴 **TỔNG TÀI:** \`${gameStatus.totalTai.toLocaleString()}\`\n` +
                        `⚪ **TỔNG XỈU:** \`${gameStatus.totalXiu.toLocaleString()}\`\n\n` +
                        `📊 **SOI CẦU:** ${soiCau}`)
        .setFooter({ text: status === 'playing' ? '👉 Bấm nút TÀI/XỈU để nhập tiền cược' : '🛑 Đã khóa cược' });
    if (status === 'playing') embed.setThumbnail('https://i.imgur.com/xHq3n2S.gif');
    return embed;
}

function createButtons(disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bet_tai').setLabel('TÀI').setStyle(ButtonStyle.Danger).setDisabled(disabled),
        new ButtonBuilder().setCustomId('bet_xiu').setLabel('XỈU').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('bal').setLabel('VÍ TIỀN').setStyle(ButtonStyle.Success)
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
        } else if (gameStatus.timeLeft <= 5 && gameStatus.timeLeft > 0) {
            gameStatus.isOpening = false;
            await gameStatus.mainMsg.edit({ embeds: [createMainEmbed('locking')], components: createButtons(true) }).catch(() => {});
        } else if (gameStatus.timeLeft <= 0) {
            clearInterval(timer);
            processResult();
        }
    }, 1000); 
}

async function processResult() {
    const d = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1];
    const total = d[0] + d[1] + d[2];
    const result = total >= 11 ? 'tai' : 'xiu';
    const isJackpot = (d[0] === d[1] && d[1] === d[2]) && (d[0] === 1 || d[0] === 6);
    const resEmbed = new EmbedBuilder().setTitle(`🎲 KẾT QUẢ PHIÊN #${sessionID}`).setColor('#2b2d31');
    
    await gameStatus.mainMsg.edit({ embeds: [resEmbed.setDescription('🎲 **ĐANG NẶN VIÊN 1...**')], components: [] });
    setTimeout(async () => {
        await gameStatus.mainMsg.edit({ embeds: [resEmbed.setDescription(`🎲 **ĐANG NẶN VIÊN 2:** ${d[0]} - ❓`)] });
        setTimeout(async () => {
            await gameStatus.mainMsg.edit({ embeds: [resEmbed.setDescription(`🎲 **ĐANG NẶN VIÊN 3:** ${d[0]} - ${d[1]} - ❓`)] });
            setTimeout(async () => {
                let resultText = `## 🎯 KẾT QUẢ: ${d[0]} - ${d[1]} - ${d[2]} = ${total}\n### CỬA THẮNG: ${result.toUpperCase()}`;
                if (isJackpot) resultText += `\n\n🎊 **NỔ HŨ THÀNH CÔNG!** 🎊`;
                resEmbed.setDescription(resultText).setColor(result === 'tai' ? '#ED4245' : '#5865F2');
                gameStatus.history.push({ result });
                if (gameStatus.history.length > 20) gameStatus.history.shift();

                for (let [uId, bet] of gameStatus.currentBets) {
                    const winAmt = result === 'tai' ? bet.tai : bet.xiu;
                    if (winAmt > 0) {
                        let prize = winAmt * 1.95;
                        if (isJackpot) prize += (jackpot * (winAmt / (result === 'tai' ? gameStatus.totalTai : gameStatus.totalXiu)));
                        updateBalance(uId, prize);
                    }
                }
                if (isJackpot) jackpot = 50000000;
                await gameStatus.mainMsg.edit({ embeds: [resEmbed] });
                setTimeout(() => startRound(), 10000);
            }, 2000);
        }, 2000);
    }, 2000);
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        const uId = interaction.user.id;
        if (interaction.customId === 'bal') return interaction.reply({ content: `💰 Ví: **${getBalance(uId).toLocaleString()} xu**`, ephemeral: true });
        if (!gameStatus.isOpening) return interaction.reply({ content: '❌ Hết thời gian cược!', ephemeral: true });

        // Hiện bảng nhập tiền (Modal)
        const modal = new ModalBuilder().setCustomId(`modal_${interaction.customId}`).setTitle('NHẬP TIỀN CƯỢC');
        const moneyInput = new TextInputBuilder()
            .setCustomId('money_input')
            .setLabel("Số tiền muốn cược (Tối thiểu 1,000)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ví dụ: 10000')
            .setMinLength(4)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(moneyInput));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
        const uId = interaction.user.id;
        const amount = parseInt(interaction.fields.getTextInputValue('money_input'));
        const type = interaction.customId === 'modal_bet_tai' ? 'tai' : 'xiu';

        if (isNaN(amount) || amount < 1000) return interaction.reply({ content: '❌ Số tiền không hợp lệ! Tối thiểu phải là 1,000 xu.', ephemeral: true });
        if (getBalance(uId) < amount) return interaction.reply({ content: '💸 Bạn không đủ số dư!', ephemeral: true });

        updateBalance(uId, -amount);
        jackpot += amount * 0.01; 
        let uBet = gameStatus.currentBets.get(uId) || { tai: 0, xiu: 0 };
        if (type === 'tai') { uBet.tai += amount; gameStatus.totalTai += amount; } 
        else { uBet.xiu += amount; gameStatus.totalXiu += amount; }
        
        gameStatus.currentBets.set(uId, uBet);
        return interaction.reply({ content: `✅ Đã đặt **${amount.toLocaleString()} xu** vào **${type.toUpperCase()}**`, ephemeral: true });
    }
});

client.once('ready', () => { startRound(); });
client.login(process.env.DISCORD_TOKEN_TAIXIU);

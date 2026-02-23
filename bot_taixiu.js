const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Khởi tạo client cho riêng bot Tài Xỉu
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

// --- CẤU HÌNH HỆ THỐNG ---
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

// Hệ thống ví tiền tạm thời (Nếu bạn dùng Prisma, hãy thay thế logic ở đây)
const userBalances = new Map();
const getBalance = (id) => userBalances.get(id) || 1000000;
const updateBalance = (id, amt) => userBalances.set(id, getBalance(id) + amt);

// --- GIAO DIỆN ---
function createMainEmbed(status = 'playing') {
    const soiCau = gameStatus.history.length === 0 ? "⚪ Chưa có dữ liệu" : gameStatus.history.map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ');
    
    return new EmbedBuilder()
        .setTitle(`🎰 TÀI XỈU PHIÊN #${sessionID}`)
        .setColor(status === 'playing' ? '#f1c40f' : '#e74c3c')
        .setDescription(`💰 **HŨ HIỆN TẠI:** 🏆 \`${jackpot.toLocaleString()}\` xu\n\n` +
                        `⏳ **THỜI GIAN:** \`${gameStatus.timeLeft}s\`\n` +
                        `🔴 **TỔNG TÀI:** \`${gameStatus.totalTai.toLocaleString()}\`\n` +
                        `⚪ **TỔNG XỈU:** \`${gameStatus.totalXiu.toLocaleString()}\`\n\n` +
                        `📊 **SOI CẦU:**\n${soiCau}`)
        .setImage(status === 'playing' ? 'https://i.imgur.com/xHq3n2S.gif' : null)
        .setFooter({ text: 'Bấm chọn tiền và chọn cửa để cược!' });
}

function createButtons(disabled = false) {
    const row1 = new ActionRowBuilder().addComponents(
        [1000, 10000, 100000, 500000].map(amt => 
            new ButtonBuilder().setCustomId(`amt_${amt}`).setLabel(`+${amt.toLocaleString()}`).setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        )
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bet_tai').setLabel('ĐẶT TÀI').setStyle(ButtonStyle.Danger).setDisabled(disabled),
        new ButtonBuilder().setCustomId('bet_xiu').setLabel('ĐẶT XỈU').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('clear').setLabel('XÓA').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('bal').setLabel('VÍ TIỀN').setStyle(ButtonStyle.Success)
    );
    return [row1, row2];
}

// --- LOGIC GAME ---
async function startRound() {
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (!channel) return console.log("❌ Không tìm thấy channel Tài Xỉu!");

    gameStatus.isOpening = true;
    gameStatus.timeLeft = 40;
    gameStatus.totalTai = 0;
    gameStatus.totalXiu = 0;
    gameStatus.currentBets.clear();
    sessionID++;

    gameStatus.mainMsg = await channel.send({ 
        embeds: [createMainEmbed()], 
        components: createButtons() 
    });

    const timer = setInterval(async () => {
        gameStatus.timeLeft -= 5;
        if (gameStatus.timeLeft <= 5) {
            clearInterval(timer);
            gameStatus.isOpening = false;
            await processResult();
        } else {
            await gameStatus.mainMsg.edit({ embeds: [createMainEmbed()] }).catch(() => {});
        }
    }, 5000);
}

async function processResult() {
    await gameStatus.mainMsg.edit({ components: createButtons(true) });

    const d = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1];
    const total = d[0] + d[1] + d[2];
    const result = total >= 11 ? 'tai' : 'xiu';
    const isJackpot = d[0] === d[1] && d[1] === d[2] && (d[0] === 1 || d[0] === 6);

    const resEmbed = new EmbedBuilder().setTitle(`🎲 KẾT QUẢ PHIÊN #${sessionID}`).setColor('#2C2F33');
    await gameStatus.mainMsg.edit({ embeds: [resEmbed.setDescription('🎲 **Đang nặn xúc xắc...**')] });

    setTimeout(async () => {
        let resultText = `🎲 **KẾT QUẢ:** ${d[0]} - ${d[1]} - ${d[2]} = **${total}**\n🎯 **CỬA THẮNG:** __${result.toUpperCase()}__`;
        if (isJackpot) resultText += `\n\n🎉 **NỔ HŨ THÀNH CÔNG!** 🎉`;

        resEmbed.setDescription(resultText).setColor(result === 'tai' ? '#ED4245' : '#5865F2');
        gameStatus.history.push({ result });
        if (gameStatus.history.length > 20) gameStatus.history.shift();

        // Trả thưởng
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
    }, 4000);
}

// --- TƯƠNG TÁC ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    const uId = interaction.user.id;
    let uBet = gameStatus.currentBets.get(uId) || { tai: 0, xiu: 0, temp: 0 };

    if (interaction.customId === 'bal') return interaction.reply({ content: `💰 Ví: **${getBalance(uId).toLocaleString()} xu**`, ephemeral: true });
    if (!gameStatus.isOpening) return interaction.reply({ content: '❌ Đã hết thời gian cược!', ephemeral: true });

    if (interaction.customId.startsWith('amt_')) {
        uBet.temp += parseInt(interaction.customId.split('_')[1]);
        gameStatus.currentBets.set(uId, uBet);
        return interaction.reply({ content: `💵 Đang chọn: **${uBet.temp.toLocaleString()}**. Nhấn Đặt Cửa!`, ephemeral: true });
    }

    if (interaction.customId === 'clear') {
        uBet.temp = 0;
        gameStatus.currentBets.set(uId, uBet);
        return interaction.reply({ content: '🧹 Đã xóa tiền chọn.', ephemeral: true });
    }

    if (interaction.customId === 'bet_tai' || interaction.customId === 'bet_xiu') {
        if (uBet.temp <= 0) return interaction.reply({ content: '❌ Bạn chưa chọn số tiền!', ephemeral: true });
        if (getBalance(uId) < uBet.temp) return interaction.reply({ content: '💸 Không đủ tiền!', ephemeral: true });

        updateBalance(uId, -uBet.temp);
        jackpot += uBet.temp * 0.01; 

        if (interaction.customId === 'bet_tai') {
            uBet.tai += uBet.temp;
            gameStatus.totalTai += uBet.temp;
        } else {
            uBet.xiu += uBet.temp;
            gameStatus.totalXiu += uBet.temp;
        }
        
        uBet.temp = 0;
        gameStatus.currentBets.set(uId, uBet);
        return interaction.reply({ content: `✅ Đã cược thành công!`, ephemeral: true });
    }
});

client.once('ready', () => {
    console.log(`✅ Bot Tài Xỉu ONLINE: ${client.user.tag}`);
    startRound();
});

// Sử dụng biến môi trường DISCORD_TOKEN_TAIXIU để tránh lỗi trên Railway
client.login(process.env.DISCORD_TOKEN_TAIXIU);

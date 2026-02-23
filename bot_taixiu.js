const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// --- CẤU HÌNH HỆ THỐNG ---
const CHANNEL_ID = '1475439630274007121'; 
let sessionID = 1475439630274007121n;
let gameStatus = {
    isOpening: false,
    timeLeft: 40,
    history: [], 
    currentBets: new Map(), // userId => {tai: 0, xiu: 0, temp: 0}
    mainMsg: null
};

// Giả lập hệ thống tiền (Bạn có thể thay bằng DB của bạn sau)
const userBalances = new Map();
const getBalance = (id) => userBalances.get(id) || 1000000; // Tặng 1M test
const updateBalance = (id, amt) => userBalances.set(id, getBalance(id) + amt);

// --- HÀM TIỆN ÍCH ---
function getSoiCau() {
    if (gameStatus.history.length === 0) return "⚪ Chưa có dữ liệu phiên.";
    return gameStatus.history.map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ');
}

function createButtons(disabled = false) {
    const row1 = new ActionRowBuilder().addComponents(
        [1000, 10000, 50000, 100000, 500000].map(amt => 
            new ButtonBuilder().setCustomId(`amt_${amt}`).setLabel(`+${amt.toLocaleString()}`).setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        )
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bet_tai').setLabel('ĐẶT TÀI').setStyle(ButtonStyle.Danger).setDisabled(disabled),
        new ButtonBuilder().setCustomId('bet_xiu').setLabel('ĐẶT XỈU').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('clear').setLabel('XÓA').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('refresh').setLabel('LÀM MỚI TIỀN').setStyle(ButtonStyle.Success)
    );
    return [row1, row2];
}

// --- LOGIC GAME CHÍNH ---
async function startRound() {
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (!channel) return console.error("❌ Không tìm thấy Channel!");

    gameStatus.isOpening = true;
    gameStatus.timeLeft = 40;
    gameStatus.currentBets.clear();
    sessionID++;

    const embed = new EmbedBuilder()
        .setTitle(`🎰 TÀI XỈU PHIÊN #${sessionID}`)
        .setColor('#FFD700')
        .setDescription(`⏳ **THỜI GIAN CƯỢC:** \`${gameStatus.timeLeft}s\`\n\n**SOI CẦU:**\n${getSoiCau()}`)
        .addFields({ name: 'Tổng cược phiên này', value: `\`0 xu\`` })
        .setImage('https://i.imgur.com/xHq3n2S.gif') // Ảnh động lắc xúc xắc
        .setFooter({ text: 'Bấm chọn tiền trước khi bấm Đặt Cửa' });

    gameStatus.mainMsg = await channel.send({ embeds: [embed], components: createButtons() });

    const timer = setInterval(async () => {
        gameStatus.timeLeft -= 5;

        if (gameStatus.timeLeft <= 5) {
            clearInterval(timer);
            gameStatus.isOpening = false;
            await processResult();
        } else {
            embed.setDescription(`⏳ **THỜI GIAN CƯỢC:** \`${gameStatus.timeLeft}s\`\n\n**SOI CẦU:**\n${getSoiCau()}`);
            await gameStatus.mainMsg.edit({ embeds: [embed] }).catch(() => {});
        }
    }, 5000);
}

async function processResult() {
    // Khóa nút
    await gameStatus.mainMsg.edit({ components: createButtons(true) });

    const d = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1];
    const total = d[0] + d[1] + d[2];
    const result = total >= 11 ? 'tai' : 'xiu';
    const resultColor = result === 'tai' ? '#ED4245' : '#5865F2';

    // Hiệu ứng nặn
    const resEmbed = new EmbedBuilder().setTitle(`🎲 KẾT QUẢ PHIÊN #${sessionID}`).setColor('#2C2F33');
    
    await gameStatus.mainMsg.edit({ embeds: [resEmbed.setDescription('🎲 **Đang nặn:** ❓ - ❓ - ❓')] });
    
    setTimeout(async () => {
        const finalDesc = `🎲 **KẾT QUẢ:** ${d[0]} - ${d[1]} - ${d[2]} = **${total}**\n🎯 **CỬA THẮNG:** __${result.toUpperCase()}__`;
        resEmbed.setDescription(finalDesc).setColor(resultColor);
        gameStatus.history.push({ result });
        if (gameStatus.history.length > 15) gameStatus.history.shift();

        // Trả thưởng & Thông báo người thắng
        let winners = [];
        for (let [uId, bet] of gameStatus.currentBets) {
            const winAmt = result === 'tai' ? bet.tai : bet.xiu;
            if (winAmt > 0) {
                updateBalance(uId, winAmt * 1.95);
                winners.push(`<@${uId}> +${(winAmt * 0.95).toLocaleString()}`);
            }
        }

        if (winners.length > 0) resEmbed.addFields({ name: '🎉 Người thắng', value: winners.join('\n').slice(0, 1024) });
        
        await gameStatus.mainMsg.edit({ embeds: [resEmbed] });

        // Chờ 10s rồi qua phiên mới
        setTimeout(() => startRound(), 10000);
    }, 4000);
}

// --- XỬ LÝ NÚT BẤM ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    const uId = interaction.user.id;
    let uBet = gameStatus.currentBets.get(uId) || { tai: 0, xiu: 0, temp: 0 };

    if (interaction.customId === 'refresh') {
        return interaction.reply({ content: `💰 Số dư của bạn: **${getBalance(uId).toLocaleString()} xu**`, ephemeral: true });
    }

    if (!gameStatus.isOpening) return interaction.reply({ content: '❌ Phiên đã đóng cược!', ephemeral: true });

    if (interaction.customId.startsWith('amt_')) {
        uBet.temp += parseInt(interaction.customId.split('_')[1]);
        gameStatus.currentBets.set(uId, uBet);
        return interaction.reply({ content: `💵 Đã chọn: **${uBet.temp.toLocaleString()}**. Bấm ĐẶT TÀI hoặc XỈU để chốt.`, ephemeral: true });
    }

    if (interaction.customId === 'clear') {
        uBet.temp = 0;
        gameStatus.currentBets.set(uId, uBet);
        return interaction.reply({ content: '🧹 Đã xóa số tiền đang chọn.', ephemeral: true });
    }

    if (interaction.customId === 'bet_tai' || interaction.customId === 'bet_xiu') {
        if (uBet.temp <= 0) return interaction.reply({ content: '❌ Bạn chưa chọn số tiền!', ephemeral: true });
        if (getBalance(uId) < uBet.temp) return interaction.reply({ content: '💸 Bạn không đủ tiền!', ephemeral: true });

        updateBalance(uId, -uBet.temp);
        if (interaction.customId === 'bet_tai') uBet.tai += uBet.temp;
        else uBet.xiu += uBet.temp;
        
        const amountBet = uBet.temp;
        uBet.temp = 0;
        gameStatus.currentBets.set(uId, uBet);

        return interaction.reply({ content: `✅ Chốt cược **${amountBet.toLocaleString()} xu** vào **${interaction.customId === 'bet_tai' ? 'TÀI' : 'XỈU'}**`, ephemeral: true });
    }
});

// --- KHỞI CHẠY ---
client.once('ready', () => {
    console.log(`✅ ${client.user.tag} ONLINE!`);
    startRound(); // Tự động chạy ngay khi bật bot
});

client.login('TOKEN_CỦA_BẠN_Ở_ĐÂY');

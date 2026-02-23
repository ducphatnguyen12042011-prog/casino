const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getBalance, updateBalance } = require('./shared/economy');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// Cấu hình hệ thống
let gameStatus = {
    isOpening: false,
    timeLeft: 0,
    sessionID: 1475439630274007121n,
    history: [], // Lưu kết quả: {total, result}
    currentBets: new Map(), // userId => {tai: 0, xiu: 0}
    mainMsg: null
};

// 1. Hàm vẽ bảng soi cầu siêu cấp
function generateSoiCau() {
    if (gameStatus.history.length === 0) return "Chưa có dữ liệu phiên.";
    
    const icons = gameStatus.history.map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ');
    const countTai = gameStatus.history.filter(h => h.result === 'tai').length;
    const countXiu = gameStatus.history.filter(h => h.result === 'xiu').length;
    const tiLeTai = ((countTai / gameStatus.history.length) * 100).toFixed(0);

    return `📊 **Lịch sử 20 phiên:**\n${icons}\n\n📈 **Thống kê:** Tài: \`${countTai}\` | Xỉu: \`${countXiu}\` (Tỉ lệ Tài: \`${tiLeTai}%\`)`;
}

// 2. Tạo hàng nút bấm
function createGameButtons(isDisabled = false) {
    const row1 = new ActionRowBuilder().addComponents(
        [1000, 5000, 10000, 50000, 100000].map(amt => 
            new ButtonBuilder().setCustomId(`amt_${amt}`).setLabel(`+${amt.toLocaleString()}`).setStyle(ButtonStyle.Secondary).setDisabled(isDisabled)
        )
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bet_tai').setLabel('ĐẶT TÀI').setStyle(ButtonStyle.Danger).setDisabled(isDisabled),
        new ButtonBuilder().setCustomId('bet_xiu').setLabel('ĐẶT XỈU').setStyle(ButtonStyle.Primary).setDisabled(isDisabled),
        new ButtonBuilder().setCustomId('clear').setLabel('XÓA CƯỢC').setStyle(ButtonStyle.Secondary).setDisabled(isDisabled),
        new ButtonBuilder().setCustomId('soicau').setLabel('SOI CẦU').setStyle(ButtonStyle.Success)
    );

    return [row1, row2];
}

// 3. Logic nặn xúc xắc và trả thưởng
async function resolveGame() {
    const d = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1];
    const total = d[0] + d[1] + d[2];
    const result = total >= 11 ? 'tai' : 'xiu';

    // Lưu lịch sử
    gameStatus.history.push({ total, result });
    if (gameStatus.history.length > 20) gameStatus.history.shift();

    // Hiệu ứng nặn
    const embed = new EmbedBuilder().setTitle(`🎲 PHIÊN #${gameStatus.sessionID} - KẾT QUẢ`).setColor('#f1c40f');
    
    await gameStatus.mainMsg.edit({ embeds: [embed.setDescription('🎲 Đang lắc... 🕒')], components: [] });
    
    setTimeout(async () => {
        await gameStatus.mainMsg.edit({ embeds: [embed.setDescription(`🎲 Kết quả: **${d[0]} - ${d[1]} - ${d[2]}**\n\n🎯 Tổng: **${total}** => **${result.toUpperCase()}**`)] });
        
        // Trả thưởng
        for (let [userId, bet] of gameStatus.currentBets) {
            const betAmount = result === 'tai' ? bet.tai : bet.xiu;
            if (betAmount > 0) {
                await updateBalance(userId, betAmount * 1.95); // Thắng x1.95
            }
        }
        
        gameStatus.sessionID++;
        setTimeout(() => startNewRound(gameStatus.mainMsg.channel), 5000); // Nghỉ 5s rồi sang phiên mới
    }, 3000);
}

// 4. Bắt đầu phiên mới
async function startNewRound(channel) {
    gameStatus.isOpening = true;
    gameStatus.timeLeft = 40;
    gameStatus.currentBets.clear();

    const embed = new EmbedBuilder()
        .setTitle(`🎮 TÀI XỈU ONLINE - PHIÊN #${gameStatus.sessionID}`)
        .setColor('#2f3136')
        .setDescription(`🕒 Thời gian cược: **${gameStatus.timeLeft}s**\n\n${generateSoiCau()}`)
        .setFooter({ text: 'Hệ thống tự động khóa cược khi còn 5 giây' });

    gameStatus.mainMsg = await channel.send({ embeds: [embed], components: createGameButtons() });

    const timer = setInterval(async () => {
        gameStatus.timeLeft -= 5;
        if (gameStatus.timeLeft <= 5) {
            gameStatus.isOpening = false;
            clearInterval(timer);
            await gameStatus.mainMsg.edit({ 
                embeds: [embed.setDescription(`🛑 **ĐÃ KHÓA CƯỢC**\nĐang chờ kết quả...`).setColor('#e74c3c')],
                components: createGameButtons(true) 
            });
            resolveGame();
        } else {
            await gameStatus.mainMsg.edit({ embeds: [embed.setDescription(`🕒 Thời gian cược: **${gameStatus.timeLeft}s**\n\n${generateSoiCau()}`)] });
        }
    }, 5000);
}

// 5. Xử lý tương tác nút bấm
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    if (interaction.customId === 'soicau') {
        return interaction.reply({ content: generateSoiCau(), ephemeral: true });
    }

    if (!gameStatus.isOpening) return interaction.reply({ content: "Phiên đã đóng hoặc đang nặn!", ephemeral: true });

    let userBet = gameStatus.currentBets.get(userId) || { tai: 0, xiu: 0, temp: 0 };

    if (interaction.customId.startsWith('amt_')) {
        const val = parseInt(interaction.customId.split('_')[1]);
        userBet.temp += val;
        gameStatus.currentBets.set(userId, userBet);
        return interaction.reply({ content: `💵 Đang chọn: **${userBet.temp.toLocaleString()}**. Bấm ĐẶT TÀI/XỈU để chốt.`, ephemeral: true });
    }

    if (interaction.customId === 'bet_tai' || interaction.customId === 'bet_xiu') {
        if (userBet.temp <= 0) return interaction.reply({ content: "Vui lòng chọn số tiền trước!", ephemeral: true });
        
        const bal = await getBalance(userId);
        if (bal < userBet.temp) return interaction.reply({ content: "Bạn không đủ số dư!", ephemeral: true });

        await updateBalance(userId, -userBet.temp);
        if (interaction.customId === 'bet_tai') userBet.tai += userBet.temp;
        else userBet.xiu += userBet.temp;
        
        const totalBet = userBet.tai + userBet.xiu;
        userBet.temp = 0; // Reset tiền tạm
        gameStatus.currentBets.set(userId, userBet);
        
        return interaction.reply({ content: `✅ Đã đặt cược thành công! Tổng cược phiên này: **${totalBet.toLocaleString()}**`, ephemeral: true });
    }

    if (interaction.customId === 'clear') {
        userBet.temp = 0;
        gameStatus.currentBets.set(userId, userBet);
        return interaction.reply({ content: "Đã xóa số tiền đang chọn.", ephemeral: true });
    }
});

client.on('messageCreate', m => {
    if (m.content === '!taixiu start' && !gameStatus.mainMsg) startNewRound(m.channel);
});

client.login(process.env.DISCORD_TOKEN);

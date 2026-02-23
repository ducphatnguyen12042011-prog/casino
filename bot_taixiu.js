const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const CHANNEL_ID = '1475439630274007121';
let sessionID = 934042n; 
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

// Hệ thống ví tiền (Kết nối Database nếu cần tại đây)
const userBalances = new Map();
const getBalance = (id) => userBalances.get(id) || 10000000;
const updateBalance = (id, amt) => userBalances.set(id, getBalance(id) + amt);

// Hàm Soi Cầu Pro
function getSoiCauInfo() {
    if (gameStatus.history.length === 0) return "⚪ `Chưa có dữ liệu.`";
    const icons = gameStatus.history.slice(-15).map(h => h.result === 'tai' ? '🔴' : '⚪').join(' ');
    const countTai = gameStatus.history.filter(h => h.result === 'tai').length;
    const countXiu = gameStatus.history.filter(h => h.result === 'xiu').length;
    return `📜 **Lịch sử:** ${icons}\n📊 **Thống kê:** 🔴 \`${countTai}\` | ⚪ \`${countXiu}\``;
}

// Tạo Embed Giao Diện Chính
function createMainEmbed(status = 'playing') {
    const embed = new EmbedBuilder()
        .setAuthor({ name: `💎 TÀI XỈU CASINO - PHIÊN #${sessionID.toString()}`, iconURL: 'https://i.imgur.com/8fXU8G9.png' })
        .setTitle(status === 'playing' ? `⏳ THỜI GIAN CÒN LẠI: ${gameStatus.timeLeft}S` : `🛑 ĐÃ KHÓA CƯỢC - ĐANG MỞ BÁT`)
        .setColor(status === 'playing' ? '#f1c40f' : '#e74c3c')
        .setDescription(`>>> 💰 **HŨ RỒNG HIỆN TẠI** 💰\n🏆 **${jackpot.toLocaleString()}** xu`)
        .addFields(
            { name: '🔴 TỔNG TÀI', value: `\`${gameStatus.totalTai.toLocaleString()}\` xu`, inline: true },
            { name: '⚪ TỔNG XỈU', value: `\`${gameStatus.totalXiu.toLocaleString()}\` xu`, inline: true },
            { name: '📈 SOI CẦU CHI TIẾT', value: getSoiCauInfo(), inline: false }
        )
        .setFooter({ text: '💡 Nhấn nút bên dưới để vào tiền cược (Tối thiểu 1,000)' })
        .setTimestamp();

    if (status === 'playing') embed.setImage('https://i.imgur.com/xHq3n2S.gif'); 
    return embed;
}

function createButtons(disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bet_tai').setLabel('ĐẶT TÀI').setStyle(ButtonStyle.Danger).setDisabled(disabled),
        new ButtonBuilder().setCustomId('bet_xiu').setLabel('ĐẶT XỈU').setStyle(ButtonStyle.Primary).setDisabled(disabled)
    )];
}

// Bắt đầu phiên mới tự động
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
        } else if (gameStatus.timeLeft === 5) {
            gameStatus.isOpening = false; // Khóa cược khi còn 5 giây
            await gameStatus.mainMsg.edit({ embeds: [createMainEmbed('locking')], components: createButtons(true) }).catch(() => {});
        } else if (gameStatus.timeLeft <= 0) {
            clearInterval(timer);
            processResult();
        }
    }, 1000); 
}

// Xử lý nặn xúc xắc và trả thưởng Jackpot
async function processResult() {
    const d = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1];
    const total = d[0] + d[1] + d[2];
    const result = total >= 11 ? 'tai' : 'xiu';
    const isJackpot = (d[0] === d[1] && d[1] === d[2]) && (d[0] === 1 || d[0] === 6);

    const resEmbed = new EmbedBuilder().setTitle(`🎲 KẾT QUẢ PHIÊN #${sessionID}`).setColor('#2b2d31');
    
    // Hiệu ứng nặn Live kịch tính
    await gameStatus.mainMsg.edit({ embeds: [resEmbed.setDescription('🎲 **Đang lắc đều tay...**')], components: [] });
    
    setTimeout(async () => {
        await gameStatus.mainMsg.edit({ embeds: [resEmbed.setDescription(`🎲 **Nặn viên 1:** \`${d[0]}\` - ❓ - ❓`)] });
        setTimeout(async () => {
            await gameStatus.mainMsg.edit({ embeds: [resEmbed.setDescription(`🎲 **Nặn viên 2:** \`${d[0]}\` - \`${d[1]}\` - ❓`)] });
            setTimeout(async () => {
                let resultText = `## 🎯 KẾT QUẢ: ${d[0]} - ${d[1]} - ${d[2]} = **${total}**\n### CỬA THẮNG: __${result.toUpperCase()}__`;
                
                if (isJackpot) resultText += `\n\n🎊 **JACKPOT: Nổ hũ thành công! Người thắng nhận x5 cược!** 🎊`;

                resEmbed.setDescription(resultText).setColor(result === 'tai' ? '#ED4245' : '#5865F2');
                gameStatus.history.push({ result });
                if (gameStatus.history.length > 20) gameStatus.history.shift();

                // Trả thưởng (Jackpot x5)
                for (let [uId, bet] of gameStatus.currentBets) {
                    const betAmount = result === 'tai' ? bet.tai : bet.xiu;
                    if (betAmount > 0) {
                        let prize = isJackpot ? (betAmount * 5) : (betAmount * 1.95);
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

// Xử lý Modal nhập liệu cược
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (!gameStatus.isOpening) return interaction.reply({ content: '❌ Phiên đã khóa cược, vui lòng đợi phiên sau!', ephemeral: true });
        
        const modal = new ModalBuilder().setCustomId(`modal_${interaction.customId}`).setTitle('VÀO TIỀN CƯỢC');
        const moneyInput = new TextInputBuilder()
            .setCustomId('money_input')
            .setLabel("Số tiền muốn cược (Tối thiểu 1,000)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ví dụ: 50000')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(moneyInput));
        await interaction.showModal(modal).catch(() => {});
    }

    if (interaction.isModalSubmit()) {
        const uId = interaction.user.id;
        const amountRaw = interaction.fields.getTextInputValue('money_input').replace(/,/g, '');
        const amount = parseInt(amountRaw);
        const type = interaction.customId === 'modal_bet_tai' ? 'tai' : 'xiu';

        if (isNaN(amount) || amount < 1000) return interaction.reply({ content: '❌ Số tiền không hợp lệ! Vui lòng nhập tối thiểu 1,000.', ephemeral: true });
        if (getBalance(uId) < amount) return interaction.reply({ content: `💸 Không đủ xu! Bạn đang có: **${getBalance(uId).toLocaleString()}** xu.`, ephemeral: true });

        updateBalance(uId, -amount);
        jackpot += amount * 0.01; // Tăng hũ 1% giá trị cược
        
        let uBet = gameStatus.currentBets.get(uId) || { tai: 0, xiu: 0 };
        if (type === 'tai') { uBet.tai += amount; gameStatus.totalTai += amount; } 
        else { uBet.xiu += amount; gameStatus.totalXiu += amount; }
        
        gameStatus.currentBets.set(uId, uBet);
        return interaction.reply({ content: `✅ Đã cược thành công **${amount.toLocaleString()}** xu vào **${type.toUpperCase()}**!`, ephemeral: true });
    }
});

client.once('ready', () => { 
    console.log(`✅ [PRO MAX] Bot Tài Xỉu đã sẵn sàng chiến đấu!`);
    startRound(); 
});

client.login(process.env.DISCORD_TOKEN_TAIXIU);

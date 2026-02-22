const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { getBalance, updateBalance } = require('./shared/economy');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

// Biến lưu trữ lịch sử soi cầu (tạm thời trong bộ nhớ)
let history = []; 

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!taixiu')) return;

    const args = msg.content.split(' ');
    
    // Tính năng soi cầu: !taixiu check
    if (args[1] === 'check' || args[1] === 'soicau') {
        const historyText = history.length > 0 
            ? history.map(r => r === 'tai' ? '🔴' : '⚪').join(' ') 
            : "Chưa có dữ liệu phiên nào.";
        
        const embedSoiCau = new EmbedBuilder()
            .setTitle("📊 Bảng Soi Cầu (10 phiên gần nhất)")
            .setDescription(historyText)
            .addFields({ name: 'Chú thích', value: '🔴: Tài | ⚪: Xỉu' })
            .setColor('#f1c40f');
            
        return msg.reply({ embeds: [embedSoiCau] });
    }

    const bet = parseInt(args[1]);
    const choice = args[2]?.toLowerCase();

    if (isNaN(bet) || bet <= 0 || !['tai', 'xiu'].includes(choice)) {
        return msg.reply("❌ **Cú pháp:** `!taixiu [tiền] [tai/xiu]` hoặc `!taixiu soicau` để xem lịch sử.");
    }

    const balance = await getBalance(msg.author.id);
    if (balance < bet) return msg.reply("💸 Bạn không đủ tiền để tham gia ván này!");

    // Trừ tiền cược
    await updateBalance(msg.author.id, -bet);

    // Lắc xúc xắc (3 viên 1-6)
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const d3 = Math.floor(Math.random() * 6) + 1;
    const total = d1 + d2 + d3;
    const result = total >= 11 ? 'tai' : 'xiu';

    // Cập nhật lịch sử (giữ 10 kết quả gần nhất)
    history.push(result);
    if (history.length > 10) history.shift();

    // Xử lý thắng thua
    const isWin = choice === result;
    const color = isWin ? '#2ecc71' : '#e74c3c'; // Xanh nếu thắng, Đỏ nếu thua
    const winAmount = bet * 2;

    if (isWin) {
        await updateBalance(msg.author.id, winAmount);
    }

    // Tạo Embed kết quả
    const resultEmbed = new EmbedBuilder()
        .setTitle(isWin ? '🎉 BẠN ĐÃ THẮNG!' : '💀 BẠN ĐÃ THUA!')
        .setColor(color)
        .addFields(
            { name: '🎲 Xúc xắc', value: `${d1} + ${d2} + ${d3} = **${total}**`, inline: true },
            { name: '🎯 Kết quả', value: result.toUpperCase(), inline: true },
            { name: '💰 Biến động', value: isWin ? `+${winAmount.toLocaleString()} xu` : `-${bet.toLocaleString()} xu`, inline: true }
        )
        .setFooter({ text: `Người chơi: ${msg.author.username} | Gõ !taixiu soicau để xem cầu` })
        .setTimestamp();

    msg.reply({ embeds: [resultEmbed] });
});

client.login(process.env.DISCORD_TOKEN_TAIXIU);

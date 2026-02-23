const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cron = require('node-cron');

const prisma = new PrismaClient();
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// --- CẤU HÌNH BIẾN MÔI TRƯỜNG ---
const FB_API_KEY = process.env.FOOTBALL_API_KEY;
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const CHANNEL_ID = '1474793205299155135'; // Kênh live & đặt cược

// Lưu trữ bộ nhớ đệm cho Admin chỉnh cầu (Map: matchId -> side_will_win)
const adminOverride = new Map();

// --- 1. GIAO DIỆN EMBED ĐẸP (GIỐNG HÌNH) ---
const createMatchEmbed = (m, status = "🟢 ĐANG MỞ CƯỢC", color = 0x2ecc71) => {
    return new EmbedBuilder()
        .setAuthor({ name: m.league, iconURL: 'https://i.imgur.com/8QO7Z6u.png' })
        .setTitle(`🏟️ ${m.homeTeam} vs ${m.awayTeam}`)
        .setThumbnail(m.homeLogo || 'https://i.imgur.com/VpT6zS2.png')
        .setColor(color)
        .setDescription(
            `📊 **Tỉ số:** \` ${m.score || '0 - 0'} \`\n` +
            `⏰ **Khởi tranh:** ${m.startTimeDisplay}\n` +
            `---------------------------\n` +
            `🔹 **KÈO CHẤP (Handicap)**\n` +
            `└ Chủ (${m.homeShort}): \`${m.hcapHome}\` | Khách: \`${m.hcapAway}\`\n\n` +
            `🔸 **KÈO TÀI XỈU (O/U)**\n` +
            `└ Tài: \`>${m.ouLine}\` | Xỉu: \`<${m.ouLine}\`\n` +
            `---------------------------\n` +
            `📢 **Trạng thái:** ${status}`
        )
        .setFooter({ text: `Verdict Betting System • ID: ${m.matchId} • ${new Date().toLocaleTimeString('vi-VN')}` });
};

const createButtons = (m, disabled = false) => {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bet_home_${m.matchId}`).setLabel(`Chủ: ${m.homeShort}`).setStyle(ButtonStyle.Primary).setDisabled(disabled),
            new ButtonBuilder().setCustomId(`bet_away_${m.matchId}`).setLabel(`Khách: ${m.awayShort}`).setStyle(ButtonStyle.Danger).setDisabled(disabled)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bet_over_${m.matchId}`).setLabel('Đặt Tài (Over)').setStyle(ButtonStyle.Success).setDisabled(disabled),
            new ButtonBuilder().setCustomId(`bet_under_${m.matchId}`).setLabel('Đặt Xỉu (Under)').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        )
    ];
};

// --- 2. TỰ ĐỘNG ĐĂNG TRẬN & KHÓA CƯỢC ---
// Tự động quét trận đấu mỗi 30 phút
cron.schedule('*/30 * * * *', async () => {
    try {
        // Fetch từ API Football-Data (ví dụ lấy giải PL - 2021)
        const response = await axios.get('https://api.football-data.org/v4/matches', {
            headers: { 'X-Auth-Token': FB_API_KEY }
        });
        
        const matches = response.data.matches.filter(m => m.status === 'TIMED');
        const channel = await client.channels.fetch(CHANNEL_ID);

        for (const m of matches) {
            const startTime = new Date(m.utcDate);
            const now = new Date();
            const diffMs = startTime - now;
            const diffMins = Math.floor(diffMs / 60000);

            // Gửi trận nếu còn hơn 30p mới bắt đầu
            if (diffMins > 30 && diffMins < 300) {
                const matchData = {
                    matchId: m.id.toString(),
                    league: m.competition.name,
                    homeTeam: m.homeTeam.name,
                    homeShort: m.homeTeam.shortName || m.homeTeam.name,
                    awayTeam: m.awayTeam.name,
                    awayShort: m.awayTeam.shortName || m.awayTeam.name,
                    startTimeDisplay: startTime.toLocaleString('vi-VN'),
                    hcapHome: "+0.5", // Logic: Bạn cần kết hợp thêm Odds API ở đây để lấy hcap thật
                    hcapAway: "-0.5",
                    ouLine: "2.5"
                };

                const msg = await channel.send({ 
                    embeds: [createMatchEmbed(matchData)], 
                    components: createButtons(matchData) 
                });

                // Lên lịch khóa cược trước 5 phút
                setTimeout(async () => {
                    const lockEmbed = createMatchEmbed(matchData, "🔴 ĐÃ KHÓA CƯỢC", 0xff0000);
                    await msg.edit({ embeds: [lockEmbed], components: createButtons(matchData, true) });
                }, diffMs - (5 * 60000));
            }
        }
    } catch (e) { console.error("Lỗi Auto-Fetch:", e); }
});

// --- 3. LỆNH CHỈNH CẦU (ADMIN ONLY) ---
// Cách dùng: !chinhcau [matchId] [home/away/over/under]
client.on('messageCreate', async (msg) => {
    if (msg.content.startsWith('!chinhcau') && msg.member.permissions.has('Administrator')) {
        const args = msg.content.split(' ');
        if (args.length < 3) return msg.reply("Sử dụng: `!chinhcau [ID] [home/away/over/under]`");
        
        const matchId = args[1];
        const side = args[2].toLowerCase();
        
        adminOverride.set(matchId, side);
        msg.reply(`✅ Đã chỉnh cầu trận **#${matchId}**. Cửa **${side.toUpperCase()}** chắc chắn thắng!`);
    }
});

// --- 4. QUYẾT TOÁN CÓ CAN THIỆP ADMIN ---
async function settlePremium(matchId, realHome, realAway) {
    const bets = await prisma.bet.findMany({ where: { matchId, status: 'PENDING' } });
    const forceWinSide = adminOverride.get(matchId);

    for (const bet of bets) {
        let isWin = false;
        
        if (forceWinSide) {
            // Nếu admin đã chỉnh cầu
            if (bet.side === forceWinSide) isWin = true;
        } else {
            // Logic tính toán thật (ví dụ kèo chấp 0.5)
            const diff = realHome - realAway;
            if (bet.side === 'home' && diff > 0) isWin = true;
            if (bet.side === 'away' && diff < 0) isWin = true;
            // ... thêm logic O/U ...
        }

        if (isWin) {
            const winAmt = Math.floor(bet.amount * 1.95);
            await prisma.user.update({ where: { id: bet.userId }, data: { coins: { increment: winAmt } } });
            await prisma.bet.update({ where: { id: bet.id }, data: { status: 'WIN' } });
            
            // Gửi thông báo thắng vào DM
            const user = await client.users.fetch(bet.userId);
            await user.send(`🎊 Chúc mừng! Bạn thắng cược trận **#${matchId}**, nhận được **${winAmt.toLocaleString()}** xu!`).catch(() => {});
        } else {
            await prisma.bet.update({ where: { id: bet.id }, data: { status: 'LOSS' } });
        }
    }
    adminOverride.delete(matchId); // Xóa cầu sau khi xong
}

// --- XỬ LÝ ĐẶT CƯỢC (MODAL) ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        const [_, side, matchId] = interaction.customId.split('_');
        const modal = new ModalBuilder().setCustomId(`modal_${side}_${matchId}`).setTitle(`🎫 ĐẶT CƯỢC: ${side.toUpperCase()}`);
        const input = new TextInputBuilder().setCustomId('amount').setLabel('SỐ TIỀN CƯỢC').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
        const [_, side, matchId] = interaction.customId.split('_');
        const amount = parseInt(interaction.fields.getTextInputValue('amount').replace(/\D/g, ''));
        if (isNaN(amount) || amount < 10000) return interaction.reply({ content: "❌ Tối thiểu 10,000 xu!", ephemeral: true });

        const user = await prisma.user.findUnique({ where: { id: interaction.user.id } });
        if (!user || user.coins < amount) return interaction.reply({ content: "❌ Không đủ tiền!", ephemeral: true });

        await prisma.$transaction([
            prisma.user.update({ where: { id: interaction.user.id }, data: { coins: { decrement: amount } } }),
            prisma.bet.create({ data: { userId: interaction.user.id, matchId, side, amount, status: 'PENDING' } })
        ]);

        await interaction.reply({ content: `✅ Đã nhận cược! Check DM nhận vé.`, ephemeral: true });
        // (Hàm gửi vé DM giữ nguyên như bản trước)
    }
});

client.login(TOKEN);
});

client.login(TOKEN);

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cron = require('node-cron');

const prisma = new PrismaClient();
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.DirectMessages
    ] 
});

// --- 1. CẤU HÌNH ---
const TOKEN = process.env.DISCORD_TOKEN;
const API_KEY = process.env.FOOTBALL_API_KEY;
const ID_KENH_CUOC = '1474793205299155135';
const ID_KENH_LIVE = '1474672512708247582';
const ALLOWED_LEAGUES = ['PL', 'PD', 'CL']; // Ngoại hạng Anh, La Liga, C1

// --- 2. HỖ TRỢ LOGIC (SMART HANDICAP) ---
async function getSmartHcap(compCode, homeId, awayId) {
    try {
        const res = await axios.get(`https://api.football-data.org/v4/competitions/${compCode}/standings`, {
            headers: { 'X-Auth-Token': API_KEY }
        });
        const table = res.data.standings[0].table;
        const hRank = table.find(t => t.team.id === homeId)?.position || 10;
        const aRank = table.find(t => t.team.id === awayId)?.position || 10;
        const diff = aRank - hRank;
        // Tính kèo chấp dựa trên chênh lệch hạng
        return Math.round((diff / 4) * 0.25 * 4) / 4 || 0.5;
    } catch (e) {
        return 0.5;
    }
}

// --- 3. LOOP CẬP NHẬT KÊNH CƯỢC & LIVE ---
async function updateScoreboard() {
    try {
        const res = await axios.get('https://api.football-data.org/v4/matches', {
            headers: { 'X-Auth-Token': API_KEY }
        });
        const matches = res.data.matches.filter(m => ALLOWED_LEAGUES.includes(m.competition.code));
        
        const chCuoc = await client.channels.fetch(ID_KENH_CUOC);
        const chLive = await client.channels.fetch(ID_KENH_LIVE);

        // Làm sạch tin nhắn cũ của bot
        const oldBetMsgs = await chCuoc.messages.fetch({ limit: 20 });
        oldBetMsgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete().catch(() => {}));

        const oldLiveMsgs = await chLive.messages.fetch({ limit: 10 });
        oldLiveMsgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete().catch(() => {}));

        // Hiển thị trận sắp đá (Chỉ kèo chấp)
        for (const m of matches.filter(x => x.status === 'TIMED').slice(0, 10)) {
            const hcap = await getSmartHcap(m.competition.code, m.homeTeam.id, m.awayTeam.id);
            const startTime = new Date(m.utcDate).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${m.competition.name.toUpperCase()}`)
                .setColor(0x3498db)
                .setDescription(`🏟️ **${m.homeTeam.name}** vs **${m.awayTeam.name}**\n🕒 Giờ đá: \`${startTime}\`\n━━━━━━━━━━━━\n⚖️ **Kèo Chấp**: \`${hcap > 0 ? '+' + hcap : hcap}\``)
                .setFooter({ text: `ID Trận: ${m.id}` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bet_chu_${m.id}_${hcap}`).setLabel('🏠 Chủ').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`bet_khach_${m.id}_${-hcap}`).setLabel('✈️ Khách').setStyle(ButtonStyle.Danger)
            );

            await chCuoc.send({ embeds: [embed], components: [row] });
        }

        // Hiển thị Live Score
        const live = matches.filter(m => ['IN_PLAY', 'PAUSED', 'LIVE'].includes(m.status));
        for (const m of live) {
            const sc = m.score.fullTime;
            const liveEmbed = new EmbedBuilder()
                .setTitle(`🔴 LIVE: ${m.competition.name}`)
                .setColor(0xe74c3c)
                .addFields({ 
                    name: m.status === 'PAUSED' ? '☕ GIẢI LAO' : '⚽ ĐANG THI ĐẤU', 
                    value: `🏠 **${m.homeTeam.shortName}** \` ${sc.home} \` — \` ${sc.away} \` **${m.awayTeam.shortName}**` 
                })
                .setFooter({ text: `Cập nhật lúc: ${new Date().toLocaleTimeString('vi-VN')}` });
            await chLive.send({ embeds: [liveEmbed] });
        }
    } catch (e) {
        console.error("Lỗi cập nhật bảng điểm:", e.message);
    }
}

// --- 4. XỬ LÝ ĐẶT CƯỢC & GỬI DM ---
client.on('interactionCreate', async (i) => {
    // Hiện Modal nhập tiền
    if (i.isButton() && i.customId.startsWith('bet_')) {
        const [_, side, mId, line] = i.customId.split('_');
        
        const modal = new ModalBuilder().setCustomId(`modal_${side}_${mId}_${line}`).setTitle('🎫 PHIẾU CƯỢC');
        const amtInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Nhập số tiền muốn cược')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
            
        modal.addComponents(new ActionRowBuilder().addComponents(amtInput));
        await i.showModal(modal);
    }

    // Xử lý nộp Modal
    if (i.isModalSubmit() && i.customId.startsWith('modal_')) {
        const [_, side, mId, line] = i.customId.split('_');
        const amount = i.fields.getTextInputValue('amount');

        // Lưu vào Database (Prisma)
        await prisma.bet.create({
            data: {
                userId: i.user.id,
                matchId: mId,
                side: side,
                amount: amount, // Lưu dạng string hoặc int tùy schema của bạn
                handicap: parseFloat(line),
                status: 'PENDING'
            }
        });

        await i.reply({ content: `✅ Đã ghi nhận lệnh cược! Kiểm tra DM để nhận biên lai.`, ephemeral: true });

        // Gửi vé vào DM (Hóa đơn)
        const ticket = new EmbedBuilder()
            .setTitle("🧾 BIÊN LAI CƯỢC")
            .setColor(0xf1c40f)
            .addFields(
                { name: "🆔 Trận", value: `#${mId}`, inline: true },
                { name: "⚽ Cửa đặt", value: side.toUpperCase(), inline: true },
                { name: "💰 Tiền cược", value: `\`${amount}\``, inline: true },
                { name: "⚖️ Kèo chấp", value: `\`${line}\``, inline: true }
            )
            .setTimestamp();

        await i.user.send({ embeds: [ticket] }).catch(() => {
            i.followUp({ content: "⚠️ Bot không thể gửi DM cho bạn (Bạn có thể đang khóa DM).", ephemeral: true });
        });
    }
});
client.on('messageCreate', async (message) => {
    // 1. Kiểm tra nếu tin nhắn là bot hoặc không bắt đầu bằng dấu !
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 2. Xử lý lệnh chinhcau
    if (command === 'chinhcau') {
        // Kiểm tra quyền Admin
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');
        }

        // Kiểm tra cú pháp: !chinhcau [ID Trận] [Cửa thắng]
        if (args.length < 2) {
            return message.reply('⚠️ Sai cú pháp! Dùng: `!chinhcau [ID_Trận] [chu/khach]`\nVí dụ: `!chinhcau 412345 chu`');
        }

        const matchId = args[0];
        const sideWin = args[1].toLowerCase();

        // Kiểm tra cửa thắng hợp lệ
        if (sideWin !== 'chu' && sideWin !== 'khach') {
            return message.reply('❌ Cửa thắng phải là `chu` hoặc `khach`!');
        }

        // Lưu vào bộ nhớ tạm
        adminOverride.set(matchId, sideWin);

        // Tạo Embed thông báo cho chuyên nghiệp
        const embed = new EmbedBuilder()
            .setTitle('🎯 XÁC NHẬN ĐIỀU CẦU')
            .setColor(0xff0000) // Màu đỏ cảnh báo
            .addFields(
                { name: '🆔 ID Trận đấu', value: `\`${matchId}\``, inline: true },
                { name: '🚩 Cửa thắng ép buộc', value: `**${sideWin === 'chu' ? 'ĐỘI CHỦ NHÀ' : 'ĐỘI KHÁCH'}**`, inline: true }
            )
            .setFooter({ text: 'Kết quả thật từ API sẽ bị bỏ qua cho trận này.' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }
});
// --- 5. KHỞI CHẠY ---
client.once('ready', async () => {
    console.log(`🚀 Bot Node.js đã sẵn sàng: ${client.user.tag}`);
    await updateScoreboard(); // Chạy ngay lập tức khi bật
    cron.schedule('*/2 * * * *', updateScoreboard); // Chạy mỗi 2 phút
});

client.login(TOKEN);

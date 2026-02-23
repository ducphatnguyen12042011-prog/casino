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

// --- CẤU HÌNH HỆ THỐNG ---
const TOKEN = process.env.DISCORD_TOKEN;
const API_KEY = process.env.FOOTBALL_API_KEY;
const ID_KENH_CUOC = '1475439630274007121'; 
const ID_KENH_LIVE = '1474793205299155135'; 
const ALLOWED_LEAGUES = ['PL', 'PD', 'CL', 'BL1', 'SA']; 

// Bộ nhớ tạm cho lệnh Admin chỉnh cầu
const adminOverride = new Map();

// --- 1. SMART HANDICAP (LOGIC TỪ BẢN PYTHON) ---
async function getSmartHcap(compCode, homeId, awayId) {
    try {
        const res = await axios.get(`https://api.football-data.org/v4/competitions/${compCode}/standings`, {
            headers: { 'X-Auth-Token': API_KEY }
        });
        const table = res.data.standings[0].table;
        const hRank = table.find(t => t.team.id === homeId)?.position || 10;
        const aRank = table.find(t => t.team.id === awayId)?.position || 10;
        const diff = aRank - hRank;
        return Math.round((diff / 4) * 0.25 * 4) / 4 || 0.5;
    } catch { return 0.5; }
}

// --- 2. HÀM CẬP NHẬT TRẬN ĐẤU (AUTO-POST) ---
async function updateFootballBoard() {
    try {
        console.log("⚽ Đang cập nhật dữ liệu bóng đá...");
        const res = await axios.get('https://api.football-data.org/v4/matches', {
            headers: { 'X-Auth-Token': API_KEY }
        });
        const matches = res.data.matches.filter(m => ALLOWED_LEAGUES.includes(m.competition.code));
        
        const chCuoc = await client.channels.fetch(ID_KENH_CUOC);
        const chLive = await client.channels.fetch(ID_KENH_LIVE);

        // Làm sạch tin nhắn cũ của bot
        const oldBet = await chCuoc.messages.fetch({ limit: 50 });
        const botBet = oldBet.filter(m => m.author.id === client.user.id);
        if (botBet.size > 0) await chCuoc.bulkDelete(botBet).catch(() => {});

        const oldLive = await chLive.messages.fetch({ limit: 20 });
        const botLive = oldLive.filter(m => m.author.id === client.user.id);
        if (botLive.size > 0) await chLive.bulkDelete(botLive).catch(() => {});

        // --- ĐĂNG KÈO CƯỢC ---
        for (const m of matches.filter(x => x.status === 'TIMED').slice(0, 8)) {
            const hcap = await getSmartHcap(m.competition.code, m.homeTeam.id, m.awayTeam.id);
            const startTime = new Date(m.utcDate).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${m.competition.name.toUpperCase()}`)
                .setColor(0x3498db)
                .setThumbnail(m.homeTeam.crest || m.competition.emblem)
                .setDescription(`🏟️ **${m.homeTeam.name}** vs **${m.awayTeam.name}**\n🕒 Giờ đá: \`${startTime}\`\n━━━━━━━━━━━━\n⚖️ **Kèo Chấp**: \`${hcap > 0 ? '+' + hcap : hcap}\``)
                .setFooter({ text: `ID Trận: ${m.id} | Chấp dựa trên BXH thực tế` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bet_chu_${m.id}_${hcap}`).setLabel('🏠 Chủ').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`bet_khach_${m.id}_${-hcap}`).setLabel('✈️ Khách').setStyle(ButtonStyle.Danger)
            );
            await chCuoc.send({ embeds: [embed], components: [row] });
        }

        // --- ĐĂNG LIVE SCORE ---
        for (const m of matches.filter(x => ['IN_PLAY', 'PAUSED'].includes(x.status))) {
            const sc = m.score.fullTime;
            const liveEmb = new EmbedBuilder()
                .setTitle(`🔴 LIVE: ${m.competition.name}`)
                .setColor(0xe74c3c)
                .addFields({ 
                    name: m.status === 'PAUSED' ? '☕ GIẢI LAO' : '⚽ ĐANG THI ĐẤU', 
                    value: `🏠 **${m.homeTeam.shortName}** \` ${sc.home} \` — \` ${sc.away} \` **${m.awayTeam.shortName}**` 
                })
                .setTimestamp();
            await chLive.send({ embeds: [liveEmb] });
        }
        console.log("✅ Đã làm mới bảng kèo.");
    } catch (e) { console.error("Lỗi cập nhật:", e.message); }
}

// --- 3. LỆNH CHỈNH CẦU (ADMIN) ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;

    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'chinhcau' && msg.member.permissions.has('Administrator')) {
        const matchId = args[0];
        const side = args[1]?.toLowerCase();
        if (!matchId || !['chu', 'khach'].includes(side)) {
            return msg.reply("⚠️ Cú pháp: `!chinhcau [ID] [chu/khach]`");
        }
        adminOverride.set(matchId, side);
        msg.reply(`🎯 **ADMIN ĐIỀU CẦU:** Trận \`#${matchId}\` sẽ thắng cửa **${side.toUpperCase()}**.`);
    }
});

// --- 4. XỬ LÝ ĐẶT CƯỢC & DM BIÊN LAI ---
client.on('interactionCreate', async (i) => {
    // Hiện Modal nhập tiền
    if (i.isButton() && i.customId.startsWith('bet_')) {
        const [_, side, mId, line] = i.customId.split('_');
        const modal = new ModalBuilder().setCustomId(`modal_${side}_${mId}_${line}`).setTitle('🎫 PHIẾU CƯỢC');
        const input = new TextInputBuilder().setCustomId('amt').setLabel('Số tiền cược').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }

    // Xử lý nộp tiền & Gửi DM
    if (i.isModalSubmit() && i.customId.startsWith('modal_')) {
        const [_, side, mId, line] = i.customId.split('_');
        const amount = i.fields.getTextInputValue('amt');

        await prisma.bet.create({
            data: { userId: i.user.id, matchId: mId, side: side, amount: amount, handicap: parseFloat(line), status: 'PENDING' }
        });

        await i.reply({ content: `✅ Cược thành công! Check DM nhận biên lai.`, ephemeral: true });

        // GỬI BIÊN LAI DM
        const ticket = new EmbedBuilder()
            .setTitle("🎫 BIÊN LAI CƯỢC VERDICT")
            .setColor(0xF1C40F)
            .setThumbnail('https://i.imgur.com/8E9v69v.png')
            .addFields(
                { name: '🆔 Mã trận', value: `\`#${mId}\``, inline: true },
                { name: '🏟️ Cửa đặt', value: `**${side.toUpperCase() === 'CHU' ? 'CHỦ NHÀ' : 'KHÁCH'}**`, inline: true },
                { name: '⚖️ Kèo chấp', value: `\`${line > 0 ? '+' + line : line}\``, inline: true },
                { name: '💰 Tiền cược', value: `\`${parseInt(amount).toLocaleString()} xu\``, inline: true },
                { name: '📅 Thời gian', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            )
            .setFooter({ text: 'Sử dụng biên lai này để đối soát khi có khiếu nại.' });

        await i.user.send({ embeds: [ticket] }).catch(() => {
            i.followUp({ content: "⚠️ Vui lòng mở DM để nhận biên lai lần sau!", ephemeral: true });
        });
    }
});

// --- 5. RUN BOT ---
client.once('ready', async () => {
    console.log(`🚀 Bot đã online: ${client.user.tag}`);
    // Đăng bài ngay khi bật bot
    await updateFootballBoard();
    // Lặp lại mỗi 2 phút
    cron.schedule('*/2 * * * *', updateFootballBoard);
});

client.login(TOKEN);

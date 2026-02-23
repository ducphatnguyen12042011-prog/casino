const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cron = require('node-cron');

const prisma = new PrismaClient();
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

// --- CẤU HÌNH ---
const TOKEN = process.env.DISCORD_TOKEN;
const API_KEY = process.env.FOOTBALL_API_KEY;
const ID_KENH_CUOC = '1475439630274007121';
const ID_KENH_LIVE = '1474793205299155135';
const ALLOWED_LEAGUES = ['PL', 'PD', 'CL', 'BL1', 'SA']; 

const adminOverride = new Map(); // Lưu MatchID -> Cửa thắng (chu/khach)

// --- 1. SMART HANDICAP ---
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

// --- 2. HÀM CẬP NHẬT KÊNH (CHÍNH) ---
async function refreshBoards() {
    try {
        console.log("⚽ Đang làm mới dữ liệu...");
        const res = await axios.get('https://api.football-data.org/v4/matches', {
            headers: { 'X-Auth-Token': API_KEY }
        });
        const matches = res.data.matches.filter(m => ALLOWED_LEAGUES.includes(m.competition.code));
        
        const chCuoc = await client.channels.fetch(ID_KENH_CUOC);
        const chLive = await client.channels.fetch(ID_KENH_LIVE);

        // Xóa tin cũ của bot để kênh luôn mới
        const oldBet = await chCuoc.messages.fetch({ limit: 50 });
        oldBet.filter(m => m.author.id === client.user.id).forEach(m => m.delete().catch(() => {}));
        
        const oldLive = await chLive.messages.fetch({ limit: 20 });
        oldLive.filter(m => m.author.id === client.user.id).forEach(m => m.delete().catch(() => {}));

        // --- ĐĂNG KÈO CƯỢC ---
        const timed = matches.filter(x => x.status === 'TIMED').slice(0, 10);
        for (const m of timed) {
            const hcap = await getSmartHcap(m.competition.code, m.homeTeam.id, m.awayTeam.id);
            const startTime = new Date(m.utcDate).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${m.competition.name.toUpperCase()}`)
                .setColor(0x00ff00)
                .setDescription(`🏟️ **${m.homeTeam.name}** vs **${m.awayTeam.name}**\n🕒 Giờ đá: \`${startTime}\`\n━━━━━━━━━━━━\n⚖️ **Kèo Chấp**: \`${hcap > 0 ? '+' + hcap : hcap}\``)
                .setFooter({ text: `ID Trận: ${m.id}` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bet_chu_${m.id}_${hcap}`).setLabel('🏠 Đội Chủ').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`bet_khach_${m.id}_${-hcap}`).setLabel('✈️ Đội Khách').setStyle(ButtonStyle.Danger)
            );
            await chCuoc.send({ embeds: [embed], components: [row] });
        }

        // --- ĐĂNG LIVE SCORE ---
        const live = matches.filter(x => ['IN_PLAY', 'PAUSED'].includes(x.status));
        for (const m of live) {
            const sc = m.score.fullTime;
            const liveEmb = new EmbedBuilder()
                .setTitle(`🔴 LIVE SCORE: ${m.competition.name}`)
                .setColor(0xff0000)
                .addFields({ 
                    name: m.status === 'PAUSED' ? '☕ ĐANG GIẢI LAO' : '⚽ TRẬN ĐẤU ĐANG DIỄN RA', 
                    value: `🏠 **${m.homeTeam.shortName}** \` ${sc.home} \` — \` ${sc.away} \` **${m.awayTeam.shortName}**` 
                })
                .setTimestamp();
            await chLive.send({ embeds: [liveEmb] });
        }
        console.log("✅ Cập nhật thành công.");
    } catch (e) { console.error("Lỗi cập nhật:", e.message); }
}

// --- 3. LỆNH CHỈNH CẦU (ADMIN) ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!chinhcau')) return;
    if (!msg.member.permissions.has('Administrator')) return msg.reply("❌ Bạn không có quyền Admin!");

    const args = msg.content.split(' ');
    const mId = args[1];
    const side = args[2]?.toLowerCase();

    if (!mId || !['chu', 'khach'].includes(side)) {
        return msg.reply("⚠️ Cú pháp: `!chinhcau [ID] [chu/khach]`");
    }

    adminOverride.set(mId, side);
    msg.reply(`🎯 **Xác nhận:** Trận \`#${mId}\` đã được ép cửa **${side.toUpperCase()}** thắng.`);
});

// --- 4. XỬ LÝ ĐẶT CƯỢC & DM ---
client.on('interactionCreate', async (i) => {
    if (i.isButton() && i.customId.startsWith('bet_')) {
        const [_, side, mId, line] = i.customId.split('_');
        const modal = new ModalBuilder().setCustomId(`modal_${side}_${mId}_${line}`).setTitle('🎫 PHIẾU CƯỢC');
        const input = new TextInputBuilder().setCustomId('amt').setLabel('Nhập số tiền cược').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId.startsWith('modal_')) {
        const [_, side, mId, line] = i.customId.split('_');
        const amount = i.fields.getTextInputValue('amt');

        await prisma.bet.create({
            data: { userId: i.user.id, matchId: mId, side: side, amount: amount, handicap: parseFloat(line), status: 'PENDING' }
        });

        await i.reply({ content: `✅ Đặt cược thành công! Hóa đơn đã gửi vào DM.`, ephemeral: true });

        // Gửi DM Hóa đơn
        const bill = new EmbedBuilder()
            .setTitle("🧾 BIÊN LAI CƯỢC HỆ THỐNG")
            .setColor(0xF1C40F)
            .addFields(
                { name: '🆔 Mã trận', value: `\`#${mId}\``, inline: true },
                { name: '🚩 Cửa thắng', value: `**${side.toUpperCase()}**`, inline: true },
                { name: '💰 Số tiền', value: `\`${parseInt(amount).toLocaleString()} xu\``, inline: true },
                { name: '⚖️ Kèo chấp', value: `\`${line}\``, inline: true }
            )
            .setFooter({ text: 'Lưu biên lai này để đối soát kết quả.' })
            .setTimestamp();

        await i.user.send({ embeds: [bill] }).catch(() => {});
    }
});

// --- 5. KHỞI CHẠY ---
client.once('ready', async () => {
    console.log(`🚀 Bot đã sẵn sàng: ${client.user.tag}`);
    await refreshBoards(); // Ép đăng ngay khi bật
    cron.schedule('*/2 * * * *', refreshBoards); // 2 phút cập nhật 1 lần
});

client.login(TOKEN);

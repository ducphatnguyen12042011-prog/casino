const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cron = require('node-cron');

const prisma = new PrismaClient();
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages] 
});

// --- CẤU HÌNH ---
const TOKEN = process.env.BOT_TOKEN_CADO;
const FB_API_KEY = process.env.FOOTBALL_API_KEY;
const ID_KENH_CUOC = '1474793205299155135';
const ID_KENH_LIVE = '1474672512708247582';
const ALLOWED_LEAGUES = ['PL', 'PD', 'CL', 'BL1', 'SA', 'FL1'];

// Bộ nhớ tạm lưu lệnh Admin (ID Trận -> Cửa thắng)
const adminOverride = new Map();

// --- 1. SMART LOGIC: TỰ TÍNH KÈO (DỰA TRÊN BXH) ---
async function getSmartHcap(compCode, homeId, awayId) {
    try {
        const res = await axios.get(`https://api.football-data.org/v4/competitions/${compCode}/standings`, {
            headers: { 'X-Auth-Token': FB_API_KEY }
        });
        const table = res.data.standings[0].table;
        const hRank = table.find(t => t.team.id === homeId)?.position || 10;
        const aRank = table.find(t => t.team.id === awayId)?.position || 10;
        const diff = aRank - hRank;
        return Math.round((diff / 4) * 0.25 * 4) / 4 || 0.5;
    } catch { return 0.5; }
}

// --- 2. LOOP: TỰ ĐỘNG ĐĂNG TRẬN & LIVE SCORE ---
cron.schedule('*/2 * * * *', async () => {
    try {
        const res = await axios.get('https://api.football-data.org/v4/matches', {
            headers: { 'X-Auth-Token': FB_API_KEY }
        });
        const matches = res.data.matches.filter(m => ALLOWED_LEAGUES.includes(m.competition.code));
        
        const chCuoc = await client.channels.fetch(ID_KENH_CUOC);
        const chLive = await client.channels.fetch(ID_KENH_LIVE);

        // Làm sạch kênh cược (chỉ xóa tin nhắn của bot)
        const oldBetMsgs = await chCuoc.messages.fetch({ limit: 20 });
        oldBetMsgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete().catch(() => {}));

        // --- ĐĂNG KÈO MỚI ---
        for (const m of matches.filter(x => x.status === 'TIMED').slice(0, 10)) {
            const hcap = await getSmartHcap(m.competition.code, m.homeTeam.id, m.awayTeam.id);
            const startTime = new Date(m.utcDate).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
            
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${m.competition.name.toUpperCase()}`)
                .setColor(0x3498db)
                .setThumbnail(m.homeTeam.crest)
                .setDescription(`🏟️ **${m.homeTeam.name}** vs **${m.awayTeam.name}**\n🕒 Giờ đá: \`${startTime}\`\n━━━━━━━━━━━━\n⚖️ **Chấp**: \`${hcap > 0 ? '+' + hcap : hcap}\` | ⚽ **T/X**: \`2.5\``)
                .setFooter({ text: `ID Trận: ${m.id} • Dùng !chinhcau ${m.id} [cửa] để điều cầu` });

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bet_chu_${m.id}_${hcap}`).setLabel('🏠 Chủ').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`bet_khach_${m.id}_${-hcap}`).setLabel('✈️ Khách').setStyle(ButtonStyle.Danger)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bet_tai_${m.id}_2.5`).setLabel('🔥 Tài').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`bet_xiu_${m.id}_2.5`).setLabel('❄️ Xỉu').setStyle(ButtonStyle.Secondary)
            );

            await chCuoc.send({ embeds: [embed], components: [row1, row2] });
        }

        // --- CẬP NHẬT LIVE SCORE ---
        const oldLiveMsgs = await chLive.messages.fetch({ limit: 10 });
        oldLiveMsgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete().catch(() => {}));

        for (const m of matches.filter(x => ['IN_PLAY', 'PAUSED'].includes(x.status))) {
            const sc = m.score.fullTime;
            const liveEmbed = new EmbedBuilder()
                .setTitle(`🔴 LIVE: ${m.competition.name}`)
                .setColor(0xe74c3c)
                .addFields({ 
                    name: m.status === 'PAUSED' ? '☕ ĐANG GIẢI LAO' : '⚽ ĐANG THI ĐẤU', 
                    value: `🏠 **${m.homeTeam.shortName}** \` ${sc.home} \` — \` ${sc.away} \` **${m.awayTeam.shortName}**` 
                })
                .setFooter({ text: `Cập nhật: ${new Date().toLocaleTimeString('vi-VN')}` });
            await chLive.send({ embeds: [liveEmbed] });
        }
    } catch (e) { console.error("Loop Error:", e.message); }
});

// --- 3. TỰ ĐỘNG QUYẾT TOÁN (TRẢ THƯỞNG) ---
cron.schedule('*/10 * * * *', async () => {
    try {
        const res = await axios.get('https://api.football-data.org/v4/matches?status=FINISHED', {
            headers: { 'X-Auth-Token': FB_API_KEY }
        });

        for (const m of res.data.matches) {
            const mId = m.id.toString();
            const bets = await prisma.bet.findMany({ where: { matchId: mId, status: 'PENDING' } });
            if (bets.length === 0) continue;

            const forceWinSide = adminOverride.get(mId);
            const { home: h, away: a } = m.score.fullTime;

            for (const bet of bets) {
                let isWin = false;
                if (forceWinSide) {
                    if (bet.side === forceWinSide) isWin = true;
                } else {
                    // Tính theo tỉ số thật
                    if (bet.side === 'chu' && (h + bet.handicap) > a) isWin = true;
                    if (bet.side === 'khach' && (a + bet.handicap) > h) isWin = true;
                    if (bet.side === 'tai' && (h + a) > 2.5) isWin = true;
                    if (bet.side === 'xiu' && (h + a) < 2.5) isWin = true;
                }

                if (isWin) {
                    const winAmt = Math.floor(bet.amount * 1.9);
                    await prisma.user.update({ where: { id: bet.userId }, data: { coins: { increment: winAmt } } });
                    await prisma.bet.update({ where: { id: bet.id }, data: { status: 'WIN' } });
                    
                    const user = await client.users.fetch(bet.userId).catch(() => null);
                    if (user) await user.send(`🎊 **Thắng cược!** Trận #${mId} đã nổ, bạn nhận được **+${winAmt.toLocaleString()} xu**!`).catch(() => {});
                } else {
                    await prisma.bet.update({ where: { id: bet.id }, data: { status: 'LOSS' } });
                }
            }
            adminOverride.delete(mId);
        }
    } catch (e) { console.error("Settle Error:", e.message); }
});

// --- 4. XỬ LÝ TƯƠNG TÁC (BET & MODAL) ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        const [_, side, mId, line] = i.customId.split('_');
        const modal = new ModalBuilder().setCustomId(`modal_${side}_${mId}_${line}`).setTitle('🎫 PHIẾU CƯỢC');
        const amtInput = new TextInputBuilder().setCustomId('amt').setLabel('Số tiền cược (Tối thiểu 10,000)').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(amtInput));
        await i.showModal(modal);
    }

    if (i.isModalSubmit()) {
        const [_, side, mId, line] = i.customId.split('_');
        const amount = parseInt(i.fields.getTextInputValue('amt').replace(/\D/g, ''));

        if (isNaN(amount) || amount < 10000) return i.reply({ content: "❌ Tối thiểu 10,000!", ephemeral: true });

        const user = await prisma.user.findUnique({ where: { id: i.user.id } });
        if (!user || user.coins < amount) return i.reply({ content: "❌ Không đủ tiền!", ephemeral: true });

        await prisma.$transaction([
            prisma.user.update({ where: { id: i.user.id }, data: { coins: { decrement: amount } } }),
            prisma.bet.create({ data: { userId: i.user.id, matchId: mId, side: side, amount: amount, handicap: parseFloat(line), status: 'PENDING' } })
        ]);

        await i.reply({ content: "✅ Đặt cược thành công! Check DM nhận vé.", ephemeral: true });
        
        const ticket = new EmbedBuilder()
            .setTitle("🧾 VÉ CƯỢC HỆ THỐNG")
            .setColor(0xf1c40f)
            .addFields(
                { name: "🆔 Trận", value: `#${mId}`, inline: true },
                { name: "⚽ Cửa đặt", value: side.toUpperCase(), inline: true },
                { name: "💰 Tiền cược", value: `${amount.toLocaleString()} xu`, inline: true }
            );
        await i.user.send({ embeds: [ticket] }).catch(() => {});
    }
});

// --- 5. LỆNH ADMIN & VÍ ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;

    // Lệnh Ví
    if (msg.content === '!vi') {
        const u = await prisma.user.findUnique({ where: { id: msg.author.id } });
        return msg.reply(`💳 Ví của bạn: **${u?.coins.toLocaleString() || 0}** xu`);
    }

    // Lệnh Chỉnh Cầu (Admin)
    if (msg.content.startsWith('!chinhcau') && msg.member.permissions.has('Administrator')) {
        const args = msg.content.split(' ');
        if (args.length < 3) return msg.reply("Sử dụng: `!chinhcau [ID] [chu/khach/tai/xiu]`");
        adminOverride.set(args[1], args[2].toLowerCase());
        return msg.reply(`🎯 Đã ép kết quả trận **#${args[1]}** thắng cửa **${args[2].toUpperCase()}**!`);
    }
});

client.once('ready', () => console.log(`🚀 Bot Cá Độ Ready: ${client.user.tag}`));
client.login(TOKEN);

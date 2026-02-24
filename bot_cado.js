import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from './shared/economy.js';
import fetch from 'node-fetch';
import 'dotenv/config';

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// --- CẤU HÌNH ---
const BET_CHANNEL_ID = "1474793205299155135"; 
const LIVE_CHANNEL_ID = "1474672512708247582";
const ADMIN_ROLE_ID = "1465374336214106237";

// Biến lưu trữ ID tin nhắn bảng kèo để cập nhật (tránh spam)
let lastBetMessageId = null;

// --- HÀM GỬI BẢNG KÈO TỰ ĐỘNG ---
async function refreshBetBoard() {
    try {
        const betChan = await client.channels.fetch(BET_CHANNEL_ID);
        if (!betChan) return console.log("❌ Không tìm thấy kênh Đặt Cược!");

        const matches = await prisma.matchConfig.findMany({ 
            where: { isLocked: false, hcap: { not: 0 } } 
        });

        if (matches.length === 0) return;

        // Xóa tin nhắn cũ nếu có để tránh trôi tin
        if (lastBetMessageId) {
            try {
                const oldMsg = await betChan.messages.fetch(lastBetMessageId);
                if (oldMsg) await oldMsg.delete();
            } catch (e) { /* Tin nhắn đã bị xóa hoặc không tìm thấy */ }
        }

        const embed = new EmbedBuilder()
            .setTitle("🏆 SÀN GIAO DỊCH VERDICT - ĐANG MỞ")
            .setDescription("Chọn trận đấu bên dưới để xem tỷ lệ và đặt cược trực tiếp.")
            .setColor("#2ecc71")
            .setThumbnail("https://i.imgur.com/6Xw6kIn.png")
            .setFooter({ text: "Hệ thống cập nhật tự động" })
            .setTimestamp();

        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_match_supreme')
            .setPlaceholder('👉 Danh sách trận đấu đang mở cược...')
            .addOptions(matches.map(m => ({
                label: m.matchId,
                description: `Hcap: ${m.hcap} | O/U: ${m.total}`,
                value: m.matchId
            })));

        const newMsg = await betChan.send({ 
            content: "🔥 **THÔNG BÁO:** Sàn cược đã cập nhật trận đấu mới!", 
            embeds: [embed], 
            components: [new ActionRowBuilder().addComponents(menu)] 
        });

        lastBetMessageId = newMsg.id;
    } catch (error) {
        console.error("❌ Lỗi gửi bảng kèo tự động:", error);
    }
}

// 1. ĐỒNG BỘ API & TỰ ĐỘNG GỬI
async function globalSync() {
    try {
        const res = await fetch('https://api.football-data.org/v4/matches', {
            headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY }
        });
        const data = await res.json();
        if (!data.matches) return;

        const currentMatches = data.matches.filter(m => ['PL', 'PD'].includes(m.competition.code));

        for (const m of currentMatches) {
            const matchName = `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`.toUpperCase();
            await prisma.matchConfig.upsert({
                where: { matchId: matchName },
                update: { isLocked: m.status !== 'SCHEDULED' },
                create: { matchId: matchName, hcap: 0, total: 0, isLocked: false }
            });
        }
        // Mỗi lần đồng bộ xong, nếu có thay đổi thì gửi bảng kèo mới
        await refreshBetBoard();
    } catch (e) { console.error("❌ Lỗi API:", e); }
}

setInterval(globalSync, 30 * 60 * 1000); // 30p quét 1 lần

client.on('ready', async () => {
    console.log(`🚀 BOT ONLINE: ${client.user.tag}`);
    await globalSync();
});

// --- 2. XỬ LÝ LỆNH ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID);

    // Admin set Odds xong bot sẽ tự động gửi bảng kèo mới vào kênh BET
    if (command === '!setodds' && isAdmin) {
        const hcap = parseFloat(args[args.length - 2]);
        const total = parseFloat(args[args.length - 1]);
        const matchId = args.slice(1, args.length - 2).join(" ").toUpperCase();

        const updated = await prisma.matchConfig.update({
            where: { matchId: matchId },
            data: { hcap, total, isLocked: false }
        }).catch(() => null);

        if (!updated) return msg.reply("❌ Trận này không có trong danh sách!");

        // Gửi Live
        const liveEmbed = new EmbedBuilder()
            .setTitle(`🏟️ ${matchId}`)
            .addFields({ name: '⚖️ Handicap', value: `**${hcap}**`, inline: true }, { name: '🏟️ O/U', value: `**${total}**`, inline: true })
            .setColor("#f1c40f");
        client.channels.cache.get(LIVE_CHANNEL_ID).send({ content: "@everyone Kèo mới!", embeds: [liveEmbed] });

        msg.reply("✅ Đã set odds. Bảng kèo tại <#1474793205299155135> sẽ tự cập nhật!");
        
        // CẬP NHẬT LUÔN BẢNG KÈO Ở KÊNH BET
        await refreshBetBoard();
    }
    
    // Vẫn giữ lệnh !keo dự phòng
    if (command === '!keo' && msg.channel.id === BET_CHANNEL_ID) {
        await refreshBetBoard();
        msg.delete().catch(() => {});
    }
});

// --- 3. XỬ LÝ TƯƠNG TÁC (BUTTON/MENU) ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.channelId !== BET_CHANNEL_ID) return;

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_match_supreme') {
        const mId = interaction.values[0];
        const match = await prisma.matchConfig.findUnique({ where: { matchId: mId } });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bet_HOME_${mId}`).setLabel(`HOME (${match.hcap})`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`bet_AWAY_${mId}`).setLabel('AWAY').setStyle(ButtonStyle.Danger)
        );
        
        await interaction.reply({ content: `🏟️ **${mId}** - Tài Xỉu: **${match.total}**`, components: [row], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith('bet_')) {
        const [_, side, mId] = interaction.customId.split('_');
        await interaction.reply({ content: `💰 Nhập số tiền cược vào chat:`, ephemeral: true });

        const filter = m => m.author.id === interaction.user.id && !isNaN(m.content);
        const col = interaction.channel.createMessageCollector({ filter, time: 20000, max: 1 });

        col.on('collect', async (m) => {
            const amt = parseInt(m.content);
            const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });
            if (!user || user.balance < amt) return m.reply("❌ Không đủ tiền!");

            await prisma.$transaction([
                prisma.user.update({ where: { discordId: interaction.user.id }, data: { balance: { decrement: amt } } }),
                prisma.bet.create({ data: { discordId: interaction.user.id, matchId: mId, choice: side, amount: amt } })
            ]);

            m.reply(`✅ Cược thành công **${amt.toLocaleString()} VC** cho **${side}**.`);
            client.channels.cache.get(LIVE_CHANNEL_ID).send(`🔥 **${interaction.user.username}** vừa vào **${amt.toLocaleString()} VC** - Trận \`${mId}\` (${side})`);
            if (m.deletable) m.delete().catch(() => {});
        });
    }
});

client.login(process.env.DISCORD_TOKEN_CADO);

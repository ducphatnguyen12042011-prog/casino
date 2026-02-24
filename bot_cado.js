import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from './shared/economy.js';
import fetch from 'node-fetch';
import 'dotenv/config';

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// --- CẤU HÌNH HỆ THỐNG ---
const BET_CHANNEL_ID = "1474793205299155135";  // Kênh ĐƯỢC đặt cược
const LIVE_CHANNEL_ID = "1474672512708247582"; // Kênh CHỈ báo Live
const ADMIN_ROLE_ID = "1465374336214106237";   // Role Admin

// Danh sách đội bóng được phép (EPL & La Liga)
const VALID_TEAMS = [
    "MANCHESTER UNITED", "MANCHESTER CITY", "LIVERPOOL FC", "ARSENAL FC", "CHELSEA FC", 
    "TOTTENHAM HOTSPUR", "NEWCASTLE UNITED", "ASTON VILLA", "WEST HAM UNITED", 
    "EVERTON FC", "LEICESTER CITY", "REAL MADRID CF", "FC BARCELONA", "ATLÉTICO MADRID", 
    "SEVILLA FC", "VALENCIA CF", "REAL SOCIEDAD", "ATHLETIC BILBAO", "VILLARREAL CF"
];

// --- 1. TỰ ĐỘNG LẤY TRẬN ĐẤU TỪ API ---
async function syncMatchesFromAPI() {
    try {
        const res = await fetch('https://api.football-data.org/v4/matches', {
            headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY }
        });
        const data = await res.json();
        if (!data.matches) return;

        // Lọc trận thuộc Ngoại hạng Anh (PL) và La Liga (PD)
        const currentMatches = data.matches.filter(m => 
            ['PL', 'PD'].includes(m.competition.code) &&
            (VALID_TEAMS.includes(m.homeTeam.name.toUpperCase()) || VALID_TEAMS.includes(m.awayTeam.name.toUpperCase()))
        );

        for (const m of currentMatches) {
            const matchName = `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`.toUpperCase();
            await prisma.matchConfig.upsert({
                where: { matchId: matchName },
                update: { isLocked: m.status !== 'SCHEDULED' },
                create: { matchId: matchName, hcap: 0, total: 0, isLocked: false }
            });
        }
        console.log(`✅ [API] Đã đồng bộ ${currentMatches.length} trận đấu mới.`);
    } catch (e) { console.error("❌ Lỗi API:", e); }
}

// Chạy đồng bộ mỗi 6 tiếng
setInterval(syncMatchesFromAPI, 6 * 60 * 60 * 1000);

client.on('ready', () => {
    console.log(`✨ [VERDICT] Bot Online: ${client.user.tag}`);
    syncMatchesFromAPI();
});

// --- 2. XỬ LÝ TIN NHẮN ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID);

    // Chặn cược tại kênh Live
    if (msg.channel.id === LIVE_CHANNEL_ID && (command === '!keo' || command === '!cado')) {
        return msg.reply("🚫 **Vui lòng sang kênh <#1474793205299155135> để đặt cược!**").then(m => setTimeout(() => { m.delete(); msg.delete(); }, 5000));
    }

    // LỆNH ADMIN: SET KÈO (Dành cho các trận đã sync từ API)
    if (command === '!setodds' && isAdmin) {
        const matchId = args.slice(1, args.length - 2).join(" ").toUpperCase();
        const hcap = parseFloat(args[args.length - 2]);
        const total = parseFloat(args[args.length - 1]);

        if (!matchId || isNaN(hcap)) return msg.reply("⚠️ **HD:** `!setodds [Tên Trận] [Hcap] [Total]`\n*Ví dụ: !setodds ARS VS MCI 0.5 2.5*");

        const match = await prisma.matchConfig.update({
            where: { matchId: matchId },
            data: { hcap, total, isLocked: false }
        }).catch(() => null);

        if (!match) return msg.reply("❌ Không tìm thấy trận đấu này. Dùng `!list` để xem danh sách.");

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'VERDICT ODDS UPDATE', iconURL: 'https://i.imgur.com/vP6pX6S.png' })
            .setTitle(`🏟️ ${matchId}`)
            .addFields(
                { name: '⚖️ Handicap', value: `\`${hcap}\``, inline: true },
                { name: '🏟️ Over/Under', value: `\`${total}\``, inline: true }
            )
            .setColor("#f1c40f")
            .setFooter({ text: "Sang kênh đặt cược để vào lệnh!" });

        client.channels.cache.get(LIVE_CHANNEL_ID).send({ content: "@everyone", embeds: [embed] });
        msg.reply("✅ Đã lên kèo thành công!");
    }

    // LỆNH NGƯỜI CHƠI: XEM KÈO
    if ((command === '!keo' || command === '!cado') && msg.channel.id === BET_CHANNEL_ID) {
        const matches = await prisma.matchConfig.findMany({ where: { isLocked: false, hcap: { not: 0 } } });
        if (matches.length === 0) return msg.reply("❌ Hiện tại chưa có trận nào mở kèo.");

        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_match')
            .setPlaceholder('👉 Chọn trận đấu để đặt cược...')
            .addOptions(matches.map(m => ({ label: m.matchId, description: `Hcap: ${m.hcap} | O/U: ${m.total}`, value: m.matchId })));

        msg.reply({ content: "🏆 **SÀN GIAO DỊCH VERDICT**", components: [new ActionRowBuilder().addComponents(menu)] });
    }
});

// --- 3. XỬ LÝ TƯƠNG TÁC ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.channelId !== BET_CHANNEL_ID) return;

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_match') {
        const mId = interaction.values[0];
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bet_HOME_${mId}`).setLabel('CƯỢC HOME').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`bet_AWAY_${mId}`).setLabel('CƯỢC AWAY').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ content: `🏟️ Trận: **${mId}** - Chọn cửa:`, components: [row], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith('bet_')) {
        const [_, side, mId] = interaction.customId.split('_');
        await interaction.reply({ content: `💰 Nhập số tiền cược vào chat (Ví dụ: 5000):`, ephemeral: true });

        const filter = m => m.author.id === interaction.user.id && !isNaN(m.content);
        const col = interaction.channel.createMessageCollector({ filter, time: 20000, max: 1 });

        col.on('collect', async (m) => {
            const amt = parseInt(m.content);
            const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });
            if (!user || user.balance < amt) return m.reply("❌ Số dư không đủ!");

            await prisma.$transaction([
                prisma.user.update({ where: { discordId: interaction.user.id }, data: { balance: { decrement: amt } } }),
                prisma.bet.create({ data: { discordId: interaction.user.id, matchId: mId, choice: side, amount: amt } })
            ]);

            m.reply(`✅ Đã cược **${amt.toLocaleString()} VC** cho **${side}**!`);
            client.channels.cache.get(LIVE_CHANNEL_ID).send(`🔥 **${interaction.user.username}** vừa vào **${amt.toLocaleString()} VC** - Trận \`${mId}\` (${side})`);
            if (m.deletable) m.delete();
        });
    }
});

client.login(process.env.DISCORD_TOKEN);

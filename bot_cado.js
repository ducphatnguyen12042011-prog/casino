const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { prisma } = require('./shared/economy');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// --- CẤU HÌNH HỆ THỐNG ---
const BET_CHANNEL_ID = "1474793205299155135";  
const LIVE_CHANNEL_ID = "1474672512708247582"; 
const ADMIN_ROLE_ID = "1465374336214106237";   

// Danh sách đội bóng được phép (EPL & LA LIGA)
const VALID_TEAMS = [
    "MANCHESTER UNITED", "MANCHESTER CITY", "LIVERPOOL FC", "ARSENAL FC", "CHELSEA FC", 
    "TOTTENHAM HOTSPUR", "NEWCASTLE UNITED", "ASTON VILLA", "WEST HAM UNITED", 
    "EVERTON FC", "LEICESTER CITY", "REAL MADRID CF", "FC BARCELONA", "ATLÉTICO MADRID", 
    "SEVILLA FC", "VALENCIA CF", "REAL SOCIEDAD", "ATHLETIC BILBAO", "VILLARREAL CF"
];

client.on('ready', () => {
    console.log(`✨ [SUPREME CADO] Luxury System is Online: ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID);

    // --- XỬ LÝ PHÂN TÁCH KÊNH ---
    if (msg.channel.id === LIVE_CHANNEL_ID && (command === '!keo' || command === '!cado')) {
        return msg.reply("❌ **Kênh LIVE không được phép đặt cược.** Hãy di chuyển tới <#1474793205299155135>!").then(m => setTimeout(() => { m.delete(); msg.delete(); }, 5000));
    }

    // 1. LỆNH !SETKE (Chỉ Admin - Mở kèo Luxury)
    if (command === '!setke' && isAdmin) {
        let mIdRaw = args.slice(1, args.length - 3).join(" "); // Lấy tên đội (có thể có dấu cách)
        const hcap = args[args.length - 3];
        const total = args[args.length - 2];
        const startTime = args[args.length - 1];

        if (!mIdRaw || !startTime) return msg.reply("⚠️ **HD:** `!setke [Tên Đội] [Hcap] [Total] [HH:mm]`");

        const mId = mIdRaw.toUpperCase();
        if (!VALID_TEAMS.includes(mId)) {
            return msg.reply(`❌ Đội **${mId}** không thuộc giải đấu được cấp phép (EPL/La Liga).`);
        }

        const [hours, minutes] = startTime.split(':').map(Number);
        const closeDate = new Date(); closeDate.setHours(hours, minutes - 5, 0, 0);

        await prisma.matchConfig.upsert({
            where: { matchId: mId },
            update: { hcap: parseFloat(hcap), total: parseFloat(total), isLocked: false },
            create: { matchId: mId, hcap: parseFloat(hcap), total: parseFloat(total) }
        });

        // Hẹn giờ khóa kèo tự động
        const timeout = closeDate.getTime() - Date.now();
        if (timeout > 0) {
            setTimeout(async () => {
                await prisma.matchConfig.update({ where: { matchId: mId }, data: { isLocked: true } });
                client.channels.cache.get(LIVE_CHANNEL_ID)?.send(`🚫 **TRẬN ĐẤU BẮT ĐẦU:** Trận \`${mId}\` chính thức đóng sàn cược!`);
            }, timeout);
        }

        const openEmbed = new EmbedBuilder()
            .setAuthor({ name: 'VERDICT | PREMIUM SPORTS BETTING', iconURL: 'https://i.imgur.com/vP6pX6S.png' })
            .setTitle(`🏟️ NEW MATCH: ${mId}`)
            .setDescription(`⭐ **Trận đấu thuộc giải đấu cấp cao đã lên sàn.**\n*Hãy chuẩn bị nguồn vốn để tham gia đặt cược ngay!*`)
            .setColor("#f1c40f") // Gold
            .addFields(
                { name: '⚖️ HANDICAP', value: `\`${hcap}\``, inline: true },
                { name: '🏟️ OVER/UNDER', value: `\`${total}\``, inline: true },
                { name: '⏰ START TIME', value: `\`${startTime}\``, inline: true },
                { name: '🚫 LOCK TIME', value: `\`${closeDate.getHours()}:${closeDate.getMinutes().toString().padStart(2, '0')}\` (5p trước trận)`, inline: false }
            )
            .setImage('https://i.imgur.com/vP6pX6S.png')
            .setFooter({ text: 'The Verdict Economy System' })
            .setTimestamp();

        client.channels.cache.get(LIVE_CHANNEL_ID)?.send({ content: "@everyone", embeds: [openEmbed] });
        msg.reply(`✅ Đã mở kèo Luxury cho **${mId}**!`);
    }

    // 2. LỆNH !CHINHKE (Sửa tỷ lệ)
    if (command === '!chinhkeo' && isAdmin) {
        const mId = args.slice(1, args.length - 2).join(" ").toUpperCase();
        const hcap = args[args.length - 2];
        const total = args[args.length - 1];

        await prisma.matchConfig.update({ where: { matchId: mId }, data: { hcap: parseFloat(hcap), total: parseFloat(total) } });

        const upEmbed = new EmbedBuilder()
            .setAuthor({ name: 'ODDS UPDATE | BIẾN ĐỘNG KÈO', iconURL: 'https://i.imgur.com/vP6pX6S.png' })
            .setTitle(`⚡ ${mId}`)
            .setColor("#e67e22")
            .addFields({ name: "⚖️ Hcap Mới", value: `**${hcap}**`, inline: true }, { name: "🏟️ Total Mới", value: `**${total}**`, inline: true });

        client.channels.cache.get(LIVE_CHANNEL_ID)?.send({ embeds: [upEmbed] });
        msg.reply("✅ Đã cập nhật tỷ lệ.");
    }

    // 3. LỆNH !KEO (Chỉ ở Kênh Cược)
    if ((command === '!keo' || command === '!cado') && msg.channel.id === BET_CHANNEL_ID) {
        const matches = await prisma.matchConfig.findMany({ where: { isLocked: false } });
        if (matches.length === 0) return msg.reply("❌ Sàn cược hiện đang đóng.");

        const menuEmbed = new EmbedBuilder()
            .setAuthor({ name: 'VERDICT BETTING CENTER', iconURL: 'https://i.imgur.com/6Xw6kIn.png' })
            .setTitle("🏆 SÀN GIAO DỊCH CƯỢC HÔM NAY")
            .setDescription("> Vui lòng chọn đội bóng bạn muốn đặt niềm tin dưới đây.\n\n─── **GIẢI ĐẤU ĐANG DIỄN RA** ───")
            .setColor("#00fbff")
            .setImage('https://i.imgur.com/vP6pX6S.png');

        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_bet')
            .setPlaceholder('👉 Danh sách đội bóng đang mở kèo...')
            .addOptions(matches.map(m => ({ label: `${m.matchId}`, description: `Chấp: ${m.hcap} | Tài: ${m.total}`, value: m.matchId })));

        msg.reply({ embeds: [menuEmbed], components: [new ActionRowBuilder().addComponents(menu)] });
    }
});

// --- XỬ LÝ ĐẶT CƯỢC ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.channelId !== BET_CHANNEL_ID) return;

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_bet') {
        const mId = interaction.values[0];
        const match = await prisma.matchConfig.findUnique({ where: { matchId: mId } });
        if (match.isLocked) return interaction.reply({ content: "❌ Trận này đã đóng cược!", ephemeral: true });

        const betEmbed = new EmbedBuilder()
            .setTitle(`🏟️ PHIẾU CƯỢC: ${mId}`)
            .setColor("#f1c40f")
            .addFields({ name: "⚖️ Tỷ Lệ Chấp", value: `**${match.hcap}**`, inline: true }, { name: "🏟️ Tài Xỉu", value: `**${match.total}**`, inline: true })
            .setFooter({ text: "Chọn cửa cược bên dưới" });

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bet_HOME_${mId}`).setLabel('CƯỢC HOME').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`bet_AWAY_${mId}`).setLabel('CƯỢC AWAY').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ embeds: [betEmbed], components: [buttons], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith('bet_')) {
        const [_, side, mId] = interaction.customId.split('_');
        await interaction.reply({ content: `✅ Bạn chọn **${side}**. Hãy nhập số tiền muốn cược (Ví dụ: 5000) vào chat:`, ephemeral: true });

        const filter = m => m.author.id === interaction.user.id && !isNaN(m.content);
        const col = interaction.channel.createMessageCollector({ filter, time: 20000, max: 1 });

        col.on('collect', async (m) => {
            const amt = parseInt(m.content);
            const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });
            if (!user || user.balance < amt) return m.reply("❌ Số dư VC không đủ để thực hiện giao dịch này!");

            const match = await prisma.matchConfig.findUnique({ where: { matchId: mId } });
            if (match.isLocked) return m.reply("❌ Rất tiếc, trận đấu đã vừa khóa cược!");

            await prisma.$transaction([
                prisma.user.update({ where: { discordId: interaction.user.id }, data: { balance: { decrement: amt } } }),
                prisma.bet.create({ data: { discordId: interaction.user.id, matchId: mId, choice: side, amount: amt, hcap: match.hcap } }),
                prisma.transaction.create({ data: { userId: interaction.user.id, type: "TRU", amount: amt, reason: `Cược ${side} cho ${mId}` } })
            ]);

            m.reply({ embeds: [new EmbedBuilder().setTitle("✅ GIAO DỊCH THÀNH CÔNG").setDescription(`Bạn đã cược **${amt.toLocaleString()} VC** cho cửa **${side}** trận **${mId}**.`).setColor("#2ecc71")] });

            const liveLog = new EmbedBuilder()
                .setColor("#9b59b6")
                .setDescription(`🔥 **${interaction.user.username}** vừa vào lệnh **${amt.toLocaleString()} VC** cho cửa **${side}** trận \`${mId}\`!`);
            client.channels.cache.get(LIVE_CHANNEL_ID)?.send({ embeds: [liveLog] });
            if (m.deletable) m.delete();
        });
    }
});

client.login(process.env.DISCORD_TOKEN_CADO);

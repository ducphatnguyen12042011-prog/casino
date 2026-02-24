const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { prisma } = require('./shared/economy');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// --- CẤU HÌNH HỆ THỐNG ---
const BET_CHANNEL_ID = "1474793205299155135";  // Kênh ĐƯỢC đặt cược
const LIVE_CHANNEL_ID = "1474672512708247582"; // Kênh CHỈ để báo Live
const ADMIN_ROLE_ID = "1465374336214106237";   // Role Admin quyền lực

// Danh sách đội bóng tinh lọc (UCL, EPL, LA LIGA)
const VALID_TEAMS = [
    "MANCHESTER UNITED", "MANCHESTER CITY", "LIVERPOOL FC", "ARSENAL FC", "CHELSEA FC", 
    "TOTTENHAM HOTSPUR", "NEWCASTLE UNITED", "ASTON VILLA", "WEST HAM UNITED", 
    "EVERTON FC", "LEICESTER CITY", "REAL MADRID CF", "FC BARCELONA", "ATLÉTICO MADRID", 
    "SEVILLA FC", "VALENCIA CF", "REAL SOCIEDAD", "ATHLETIC BILBAO", "VILLARREAL CF"
];

client.on('ready', () => {
    console.log(`✨ [VERDICT SUPREME] Bot Online: ${client.user.tag}`);
    console.log(`📡 Đang giám sát Kênh Live: ${LIVE_CHANNEL_ID}`);
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID);

    // Chặn người dùng dùng lệnh cược ở kênh Live
    if (msg.channel.id === LIVE_CHANNEL_ID && (command === '!keo' || command === '!cado')) {
        return msg.reply("❌ **Kênh này chỉ dùng để cập nhật Live Score.** Hãy sang <#1474793205299155135> để tham gia cược!").then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 6000));
    }

    // 1. LỆNH !SETKE (Mở kèo mới - Chỉ Admin)
    if (command === '!setke' && isAdmin) {
        // Tách mId (tên đội), Hcap, Total, Time linh hoạt
        let mIdRaw = args.slice(1, args.length - 3).join(" ");
        const hcap = args[args.length - 3];
        const total = args[args.length - 2];
        const startTime = args[args.length - 1];

        if (!mIdRaw || !startTime || !startTime.includes(':')) {
            return msg.reply("⚠️ **Sai cú pháp!** Hãy dùng: `!setke [Tên Đội] [Hcap] [Total] [HH:mm]`\n*Ví dụ: !setke Real Madrid CF 0.5 2.5 22:00*");
        }

        const mId = mIdRaw.toUpperCase().trim();
        if (!VALID_TEAMS.includes(mId)) {
            return msg.reply(`❌ Đội bóng **${mId}** không nằm trong danh sách thi đấu được cấp phép (UCL/EPL/La Liga).`);
        }

        const [hours, minutes] = startTime.split(':').map(Number);
        const matchDate = new Date(); matchDate.setHours(hours, minutes, 0, 0);
        const lockDate = new Date(matchDate.getTime() - 5 * 60000); // 5 phút trước trận

        await prisma.matchConfig.upsert({
            where: { matchId: mId },
            update: { hcap: parseFloat(hcap), total: parseFloat(total), isLocked: false },
            create: { matchId: mId, hcap: parseFloat(hcap), total: parseFloat(total) }
        });

        // Tự động Khóa Kèo
        const timeout = lockDate.getTime() - Date.now();
        if (timeout > 0) {
            setTimeout(async () => {
                await prisma.matchConfig.update({ where: { matchId: mId }, data: { isLocked: true } });
                const liveChan = client.channels.cache.get(LIVE_CHANNEL_ID);
                if (liveChan) liveChan.send(`🚫 **ĐÓNG CƯỢC:** Sàn giao dịch trận \`${mId}\` chính thức **KHÓA** để bắt đầu thi đấu.`);
            }, timeout);
        }

        // Gửi thông báo Luxury lên kênh LIVE
        const liveChan = client.channels.cache.get(LIVE_CHANNEL_ID);
        if (liveChan) {
            const embed = new EmbedBuilder()
                .setAuthor({ name: 'THE VERDICT | PREMIUM ODDS', iconURL: 'https://i.imgur.com/vP6pX6S.png' })
                .setTitle(`📢 TRẬN ĐẤU MỚI: ${mId}`)
                .setDescription(`🏆 **Hạng mục:** *Elite Leagues (EPL/La Liga)*\n\n─── **THÔNG SỐ ODDS HÔM NAY** ───`)
                .setColor("#f1c40f")
                .addFields(
                    { name: '⚖️ HANDICAP', value: `\`${hcap}\``, inline: true },
                    { name: '🏟️ OVER/UNDER', value: `\`${total}\``, inline: true },
                    { name: '⏰ START', value: `\`${startTime}\``, inline: true },
                    { name: '🚫 LOCK', value: `\`${lockDate.getHours()}:${lockDate.getMinutes().toString().padStart(2, '0')}\``, inline: true }
                )
                .setThumbnail('https://i.imgur.com/vP6pX6S.png')
                .setFooter({ text: 'VERDICT Economy • Hệ thống cược tự động' })
                .setTimestamp();

            liveChan.send({ content: "@everyone **KÈO MỚI CỰC HOT!**", embeds: [embed] })
                .then(() => msg.reply(`✅ Đã mở kèo **${mId}** và thông báo tới kênh LIVE.`))
                .catch(err => {
                    console.error("Lỗi gửi tin Live:", err);
                    msg.reply("❌ Bot thiếu quyền gửi tin (Embed Links) vào kênh LIVE.");
                });
        }
    }

    // 2. LỆNH !CHINHKE (Sửa nhanh tỷ lệ)
    if (command === '!chinhkeo' && isAdmin) {
        const mId = args.slice(1, args.length - 2).join(" ").toUpperCase();
        const hcap = args[args.length - 2];
        const total = args[args.length - 1];

        await prisma.matchConfig.update({ where: { matchId: mId }, data: { hcap: parseFloat(hcap), total: parseFloat(total) } });

        const upEmbed = new EmbedBuilder()
            .setTitle(`⚡ BIẾN ĐỘNG KÈO: ${mId}`)
            .setColor("#e67e22")
            .setDescription(`Tỷ lệ cược vừa được cập nhật theo thị trường.\n**Hcap:** \`${hcap}\` | **Total:** \`${total}\``);

        client.channels.cache.get(LIVE_CHANNEL_ID)?.send({ embeds: [upEmbed] });
        msg.reply("✅ Đã cập nhật tỷ lệ cược mới.");
    }

    // 3. LỆNH !KEO (Chỉ hoạt động ở Kênh Đặt Cược)
    if ((command === '!keo' || command === '!cado') && msg.channel.id === BET_CHANNEL_ID) {
        const matches = await prisma.matchConfig.findMany({ where: { isLocked: false } });
        if (matches.length === 0) return msg.reply("❌ Hiện tại chưa có trận đấu nào mở cược.");

        const menuEmbed = new EmbedBuilder()
            .setAuthor({ name: 'VERDICT BETTING CENTER', iconURL: 'https://i.imgur.com/6Xw6kIn.png' })
            .setTitle("🏆 DANH SÁCH KÈO ĐANG MỞ")
            .setDescription("Sử dụng menu bên dưới để chọn đội bóng và đặt cược.")
            .setColor("#00fbff")
            .setImage('https://i.imgur.com/vP6pX6S.png');

        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_bet')
            .setPlaceholder('👉 Lựa chọn trận đấu bạn muốn theo...')
            .addOptions(matches.map(m => ({ label: `${m.matchId}`, description: `Hcap: ${m.hcap} | Over/Under: ${m.total}`, value: m.matchId })));

        msg.reply({ embeds: [menuEmbed], components: [new ActionRowBuilder().addComponents(menu)] });
    }
});

// --- XỬ LÝ ĐẶT CƯỢC & TRANSACTION ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.channelId !== BET_CHANNEL_ID) return;

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_bet') {
        const mId = interaction.values[0];
        const match = await prisma.matchConfig.findUnique({ where: { matchId: mId } });
        if (!match || match.isLocked) return interaction.reply({ content: "❌ Trận này đã khóa sàn cược!", ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bet_HOME_${mId}`).setLabel('CƯỢC HOME').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`bet_AWAY_${mId}`).setLabel('CƯỢC AWAY').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ content: `🏟️ Trận: **${mId}** | Cược cửa nào?`, components: [row], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith('bet_')) {
        const [_, side, mId] = interaction.customId.split('_');
        await interaction.reply({ content: `✅ Bạn chọn **${side}**. Hãy nhập số tiền muốn cược (Tối thiểu 100 VC):`, ephemeral: true });

        const filter = m => m.author.id === interaction.user.id && !isNaN(m.content);
        const col = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });

        col.on('collect', async (m) => {
            const amt = parseInt(m.content);
            if (amt < 100) return m.reply("❌ Tiền cược không được thấp hơn 100 VC.");

            const user = await prisma.user.findUnique({ where: { discordId: m.author.id } });
            if (!user || user.balance < amt) return m.reply("❌ Số dư ví của bạn không đủ.");

            const match = await prisma.matchConfig.findUnique({ where: { matchId: mId } });
            if (!match || match.isLocked) return m.reply("❌ Kèo vừa mới khóa, giao dịch bị hủy.");

            await prisma.$transaction([
                prisma.user.update({ where: { discordId: m.author.id }, data: { balance: { decrement: amt } } }),
                prisma.bet.create({ data: { discordId: m.author.id, matchId: mId, choice: side, amount: amt, hcap: match.hcap } }),
                prisma.transaction.create({ data: { userId: m.author.id, type: "TRU", amount: amt, reason: `Cược ${side} trận ${mId}` } })
            ]);

            m.reply({ embeds: [new EmbedBuilder().setTitle("✅ GIAO DỊCH THÀNH CÔNG").setDescription(`Đã xác nhận cược **${amt.toLocaleString()} VC** cho **${side}**!`).setColor("#2ecc71")] });
            
            // Báo lên Live Score
            client.channels.cache.get(LIVE_CHANNEL_ID)?.send({
                embeds: [new EmbedBuilder().setColor("#9b59b6").setDescription(`🔥 **${interaction.user.username}** vừa vào lệnh **${amt.toLocaleString()} VC** cho cửa **${side}** trận \`${mId}\`!`)]
            });
            if (m.deletable) m.delete().catch(() => {});
        });
    }
});

client.login(process.env.DISCORD_TOKEN_CADO);

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// --- CẤU HÌNH ---
const PREFIX = '!';
let history = []; // Lưu lịch sử cầu

// Hệ thống ví (Giả lập)
const balances = new Map();
const getBalance = (id) => balances.get(id) || 10000000;
const updateBalance = (id, amt) => balances.set(id, getBalance(id) + amt);

// --- LỆNH !TX ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    if (message.content.toLowerCase() === '!tx') {
        const embed = new EmbedBuilder()
            .setAuthor({ name: "CASINO INSTANT - CƯỢC LÀ CÓ KẾT QUẢ", iconURL: "https://i.imgur.com/8QO7Z6u.png" })
            .setTitle("🎲 BẮT ĐẦU PHIÊN MỚI")
            .setColor("#2f3136")
            .setDescription("Vui lòng chọn **Tài** hoặc **Xỉu** để đặt cược.\nKết quả sẽ hiển thị ngay sau khi bạn xác nhận tiền cược!")
            .addFields({ name: "📊 SOI CẦU", value: history.slice(-10).map(h => h === 'tai' ? '🔴' : '⚪').join(' ') || 'Chưa có dữ liệu' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bet_tai').setLabel('ĐẶT TÀI (11-17)').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('bet_xiu').setLabel('ĐẶT XỈU (4-10)').setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// --- XỬ LÝ NÚT BẤM & KẾT QUẢ TỨC THÌ ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        const side = i.customId.replace('bet_', '');
        const modal = new ModalBuilder().setCustomId(`modal_${side}`).setTitle('🎫 XÁC NHẬN PHIẾU CƯỢC');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('amt').setLabel('Số tiền cược').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await i.showModal(modal);
    }

    if (i.isModalSubmit()) {
        await i.deferReply(); // Dùng để bot có thời gian tính toán
        
        const side = i.customId.replace('modal_', '');
        const amount = parseInt(i.fields.getTextInputValue('amt').replace(/,/g, ''));
        const userId = i.user.id;

        // Kiểm tra tiền
        if (isNaN(amount) || amount < 1000) return i.editReply("❌ Số tiền tối thiểu là 1,000 xu!");
        if (getBalance(userId) < amount) return i.editReply("❌ Bạn không đủ số dư!");

        // --- XỔ SỐ NGAY LẬP TỨC ---
        const d = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
        const total = d[0] + d[1] + d[2];
        const result = total >= 11 ? 'tai' : 'xiu';
        const diceIcons = d.map(v => v === 1 ? '⚀' : v === 2 ? '⚁' : v === 3 ? '⚂' : v === 4 ? '⚃' : v === 5 ? '⚄' : '⚅').join(' ');
        
        history.push(result);
        let win = false;
        let messageResult = "";

        if (side === result) {
            win = true;
            const prize = amount * 0.95; // Thắng nhận thêm 95%
            updateBalance(userId, prize);
            messageResult = `🥳 Chúc mừng bạn đã thắng **+${prize.toLocaleString()}** xu!`;
        } else {
            updateBalance(userId, -amount);
            messageResult = `💸 Rất tiếc, bạn đã thua **-${amount.toLocaleString()}** xu!`;
        }

        // --- HIỂN THỊ EMBED KẾT QUẢ ---
        const resEmbed = new EmbedBuilder()
            .setTitle(win ? "🎉 CHIẾN THẮNG!" : "💀 THẤT BẠI!")
            .setColor(win ? "#2ecc71" : "#e74c3c")
            .setThumbnail(i.user.displayAvatarURL())
            .addFields(
                { name: "👤 Người chơi", value: `<@${userId}>`, inline: true },
                { name: "🎯 Bạn chọn", value: `\`${side.toUpperCase()}\``, inline: true },
                { name: "🎲 Kết quả", value: `**${diceIcons}** (${d.join('-')}) = **${total}**`, inline: false },
                { name: "🏁 Kết luận", value: `👉 **${result.toUpperCase()}**`, inline: true },
                { name: "💰 Ví hiện tại", value: `\`${getBalance(userId).toLocaleString()}\` xu`, inline: true },
                { name: "📊 Soi cầu mới", value: history.slice(-15).map(h => h === 'tai' ? '🔴' : '⚪').join(' ') }
            )
            .setDescription(messageResult)
            .setFooter({ text: "Gõ !tx để làm ván mới!" })
            .setTimestamp();

        await i.editReply({ embeds: [resEmbed] });
    }
});

client.once('ready', () => { console.log(`✅ Instant Bot ${client.user.tag} sẵn sàng!`); });
client.login(process.env.BOT_TOKEN);
